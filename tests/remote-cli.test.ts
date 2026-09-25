import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  addRemote,
  getRemote,
  listRemotes,
  RemoteCliError,
  validateRemoteUrl,
} from "../server/remote/registry.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("URL remota aceita loopback IPv6 sem liberar HTTP externo", () => {
  assert.equal(validateRemoteUrl("http://[::1]:4317"), "http://[::1]:4317");
  assert.throws(() => validateRemoteUrl("http://example.com"), /HTTPS/i);
});
const shim = path.join(projectRoot, "bin", "threadmark.mjs");

interface CliResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function runThreadmark(
  args: readonly string[],
  options: {
    env?: Record<string, string | undefined>;
    input?: string;
    signal?: NodeJS.Signals;
    signalAfterMs?: number;
  } = {},
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [shim, ...args], {
      cwd: projectRoot,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    const signalTimer = options.signal && options.signalAfterMs
      ? setTimeout(() => child.kill(options.signal!), options.signalAfterMs)
      : undefined;
    child.once("close", (code, signal) => {
      if (signalTimer) clearTimeout(signalTimer);
      resolve({ code, signal, stdout, stderr });
    });
    child.stdin.end(options.input);
  });
}

test("CLI remoto persiste e lista registros sem dados de credencial", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-cli-"));
  const configPath = path.join(directory, "config", "remotes.json");
  const env = { THREADMARK_REMOTE_CONFIG_PATH: configPath };
  try {
    const added = await runThreadmark(
      [
        "remote",
        "add",
        "production",
        "--ssh",
        "threadmark-prod",
        "--container",
        "threadmark-production",
        "--json",
      ],
      { env },
    );

    assert.equal(added.code, 0);
    assert.equal(added.signal, null);
    assert.deepEqual(JSON.parse(added.stdout), {
      ok: true,
      remote: {
        name: "production",
        ssh: "threadmark-prod",
        container: "threadmark-production",
      },
    });

    const listed = await runThreadmark(["remote", "list", "--json"], { env });
    assert.equal(listed.code, 0);
    assert.deepEqual(JSON.parse(listed.stdout), {
      ok: true,
      remotes: [
        {
          name: "production",
          ssh: "threadmark-prod",
          container: "threadmark-production",
        },
      ],
    });

    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
    assert.deepEqual(config, {
      version: 2,
      remotes: [
        {
          name: "production",
          ssh: "threadmark-prod",
          container: "threadmark-production",
        },
      ],
    });
    assert.equal((await stat(configPath)).mode & 0o777, 0o600);
    assert.equal((await stat(path.dirname(configPath))).mode & 0o777, 0o700);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI remoto cadastra destino HTTPS sem persistir credencial", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-https-"));
  const configPath = path.join(directory, "config", "remotes.json");
  const env = { THREADMARK_REMOTE_CONFIG_PATH: configPath };
  try {
    const added = await runThreadmark(
      [
        "remote",
        "add",
        "production",
        "--url",
        "https://threadmark.example.com/",
        "--json",
      ],
      { env },
    );

    assert.equal(added.code, 0);
    assert.deepEqual(JSON.parse(added.stdout), {
      ok: true,
      remote: {
        name: "production",
        url: "https://threadmark.example.com",
      },
    });
    const configText = await readFile(configPath, "utf8");
    assert.equal(configText.includes("token"), false);
    assert.deepEqual(JSON.parse(configText), {
      version: 2,
      remotes: [
        {
          name: "production",
          url: "https://threadmark.example.com",
        },
      ],
    });

    const pathUrl = await runThreadmark(
      ["remote", "add", "path", "--url", "https://threadmark.example.com/app", "--json"],
      { env },
    );
    assert.equal(pathUrl.code, 2);
    assert.equal(JSON.parse(pathUrl.stderr).error.code, "invalid_remote_config");

    for (const [name, url] of [
      ["empty-query", "https://threadmark.example.com/?"],
      ["empty-fragment", "https://threadmark.example.com/#"],
      ["empty-userinfo", "https://@threadmark.example.com"],
    ] as const) {
      const rejected = await runThreadmark(
        ["remote", "add", name, "--url", url, "--json"],
        { env },
      );
      assert.equal(rejected.code, 2, `${url}: ${rejected.stderr}`);
      assert.equal(JSON.parse(rejected.stderr).error.code, "invalid_remote_config");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI remoto HTTPS usa token do Keychain e não inicia SSH", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-http-run-"));
  const configPath = path.join(directory, "config", "remotes.json");
  const securityLog = path.join(directory, "security.jsonl");
  const requests: Array<{ url: string; authorization: string | undefined }> = [];
  const server = createServer((request, response) => {
    requests.push({
      url: request.url ?? "",
      authorization: request.headers.authorization,
    });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ items: [], total: 0 }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const env = {
    NODE_ENV: "test",
    THREADMARK_REMOTE_CONFIG_PATH: configPath,
    THREADMARK_SECURITY_COMMAND: path.join(projectRoot, "tests", "fixtures", "security"),
    THREADMARK_FAKE_SECURITY_LOG: securityLog,
    THREADMARK_FAKE_KEYCHAIN_TOKEN: "tmk_token-do-keychain",
  };
  try {
    const added = await runThreadmark(
      ["remote", "add", "production", "--url", `http://127.0.0.1:${address.port}`, "--json"],
      { env },
    );
    assert.equal(added.code, 0, added.stderr);

    const invoked = await runThreadmark(
      ["--remote", "production", "tickets", "list", "--json"],
      { env },
    );
    assert.equal(invoked.code, 0, invoked.stderr);
    assert.deepEqual(JSON.parse(invoked.stdout), {
      schemaVersion: "threadmark.headless.v1",
      ok: true,
      command: "tickets.list",
      data: { items: [], total: 0 },
      meta: { readOnly: true, actorId: null, clientId: null },
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.authorization, "Bearer tmk_token-do-keychain");
    assert.match(requests[0]?.url ?? "", /^\/api\/tickets/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI gerencia login, status e logout HTTPS pelo Keychain", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-login-"));
  const configPath = path.join(directory, "config", "remotes.json");
  const securityLog = path.join(directory, "security.jsonl");
  const methods: string[] = [];
  const payload = {
    credential: {
      id: "credential-1",
      userId: "user-1",
      name: "Hermes no Mac",
      scope: "headless",
      clientId: "threadmark-cli",
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000).toISOString(),
      lastUsedAt: "2026-09-24T15:00:00.000Z",
      revokedAt: null,
      createdAt: "2026-09-24T14:00:00.000Z",
      updatedAt: "2026-09-24T15:00:00.000Z",
    },
    user: { id: "user-1", displayName: "Weslem", role: "owner", active: true },
    clientId: "threadmark-cli",
    headlessSchemaVersion: "threadmark.headless.v1",
  };
  let responsePayload: unknown = payload;
  const server = createServer((request, response) => {
    methods.push(request.method ?? "");
    response.setHeader("content-type", "application/json");
    const body = request.method === "DELETE"
      ? {
          ...payload,
          credential: { ...payload.credential, revokedAt: "2026-09-25T10:30:00.000Z" },
        }
      : responsePayload;
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const env = {
    NODE_ENV: "test",
    THREADMARK_REMOTE_CONFIG_PATH: configPath,
    THREADMARK_SECURITY_COMMAND: path.join(projectRoot, "tests", "fixtures", "security"),
    THREADMARK_FAKE_SECURITY_LOG: securityLog,
    THREADMARK_FAKE_KEYCHAIN_TOKEN: "tmk_token-do-keychain",
  };
  try {
    const added = await runThreadmark(
      ["remote", "add", "production", "--url", `http://127.0.0.1:${address.port}`, "--json"],
      { env },
    );
    assert.equal(added.code, 0, added.stderr);

    const login = await runThreadmark(["remote", "login", "production", "--json"], { env });
    assert.equal(login.code, 0, login.stderr);
    assert.equal((JSON.parse(login.stdout) as { status: { user: { id: string } } }).status.user.id, "user-1");

    responsePayload = {};
    const failedLogin = await runThreadmark(
      ["remote", "login", "production", "--json"],
      { env },
    );
    assert.equal(failedLogin.code, 2);
    const failedLoginError = JSON.parse(
      failedLogin.stderr.trim().split("\n").at(-1) ?? "null",
    );
    assert.equal(failedLoginError.error.code, "remote_response_invalid");
    responsePayload = payload;

    const status = await runThreadmark(["remote", "status", "production", "--json"], { env });
    assert.equal(status.code, 0, status.stderr);

    responsePayload = {};
    const malformed = await runThreadmark(
      ["remote", "status", "production", "--json"],
      { env },
    );
    assert.equal(malformed.code, 2);
    assert.equal(JSON.parse(malformed.stderr).error.code, "remote_response_invalid");

    responsePayload = {
      ...payload,
      user: { ...payload.user, id: "outro-usuario" },
      headlessSchemaVersion: "incompatível.v999",
    };
    const inconsistent = await runThreadmark(
      ["remote", "status", "production", "--json"],
      { env },
    );
    assert.equal(inconsistent.code, 2);
    assert.equal(JSON.parse(inconsistent.stderr).error.code, "remote_response_invalid");
    responsePayload = payload;

    const logout = await runThreadmark(["remote", "logout", "production", "--json"], { env });
    assert.equal(logout.code, 0, logout.stderr);
    assert.deepEqual(methods, ["GET", "GET", "GET", "GET", "GET", "DELETE"]);

    const securityCalls = (await readFile(securityLog, "utf8"))
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as { args: string[] }).args[0]);
    assert.deepEqual(securityCalls, [
      "add-generic-password",
      "find-generic-password",
      "delete-generic-password",
      "add-generic-password",
      "add-generic-password",
      "find-generic-password",
      "delete-generic-password",
      "find-generic-password",
      "find-generic-password",
      "find-generic-password",
      "find-generic-password",
      "delete-generic-password",
    ]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("registro remoto v1 continua legível e é migrado somente ao escrever", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-v1-"));
  const configPath = path.join(directory, "config", "remotes.json");
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify({
      version: 1,
      remotes: [
        { name: "legacy", ssh: "threadmark-prod", container: "threadmark-production" },
      ],
    })}\n`,
  );
  try {
    const listed = await runThreadmark(["remote", "list", "--json"], {
      env: { THREADMARK_REMOTE_CONFIG_PATH: configPath },
    });
    assert.equal(listed.code, 0);
    assert.equal((JSON.parse(await readFile(configPath, "utf8")) as { version: number }).version, 1);

    const added = await runThreadmark(
      ["remote", "add", "production", "--url", "https://threadmark.example.com", "--json"],
      { env: { THREADMARK_REMOTE_CONFIG_PATH: configPath } },
    );
    assert.equal(added.code, 0);
    assert.equal((JSON.parse(await readFile(configPath, "utf8")) as { version: number }).version, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI remoto executa a família headless por SSH com argv POSIX seguro", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-transport-"));
  const configPath = path.join(directory, "config", "remotes.json");
  const sshLog = path.join(directory, "ssh.jsonl");
  const dockerLog = path.join(directory, "docker.jsonl");
  const marker = path.join(directory, "must-not-exist");
  const fixtureDirectory = path.join(projectRoot, "tests", "fixtures");
  const resultPayload = {
    schemaVersion: "threadmark.headless.v1",
    ok: true,
    command: "tickets.list",
    data: { items: [], total: 0 },
    meta: { readOnly: true, actorId: null, clientId: null },
  };
  const env = {
    THREADMARK_REMOTE_CONFIG_PATH: configPath,
    THREADMARK_FAKE_SSH_LOG: sshLog,
    THREADMARK_FAKE_DOCKER_LOG: dockerLog,
    THREADMARK_FAKE_DOCKER_STDOUT: `${JSON.stringify(resultPayload)}\n`,
    PATH: `${fixtureDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  const injection = `contato'; touch ${marker}; #`;
  try {
    const added = await runThreadmark(
      [
        "remote",
        "add",
        "production",
        "--ssh",
        "threadmark-prod",
        "--container",
        "threadmark-production",
        "--json",
      ],
      { env },
    );
    assert.equal(added.code, 0);

    const invoked = await runThreadmark(
      [
        "--remote",
        "production",
        "tickets",
        "list",
        "--query",
        injection,
        "--json",
      ],
      { env },
    );

    assert.equal(invoked.code, 0);
    assert.equal(invoked.signal, null);
    assert.deepEqual(JSON.parse(invoked.stdout), resultPayload);
    await assert.rejects(access(marker), { code: "ENOENT" });

    const [ssh] = await readJsonLines<{ args: string[] }>(sshLog);
    assert.deepEqual(ssh?.args.slice(0, 18), [
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "ConnectionAttempts=1",
      "-o",
      "ForwardAgent=no",
      "-o",
      "ClearAllForwardings=yes",
      "-o",
      "ServerAliveInterval=10",
      "-o",
      "ServerAliveCountMax=2",
      "threadmark-prod",
    ]);

    const [docker] = await readJsonLines<{ args: string[]; stdin: string }>(dockerLog);
    assert.deepEqual(docker?.args, [
      "exec",
      "-i",
      "threadmark-production",
      "node",
      "/app/bin/threadmark.mjs",
      "tickets",
      "list",
      "--query",
      injection,
      "--json",
    ]);
    assert.equal(docker?.stdin, "");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI remoto desconhecido retorna erro JSON sem executar o modo local", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-missing-"));
  const dataDirectory = path.join(directory, "local-data");
  try {
    const result = await runThreadmark(
      ["--remote", "missing", "tickets", "list", "--json"],
      {
        env: {
          THREADMARK_REMOTE_CONFIG_PATH: path.join(directory, "config", "remotes.json"),
          SUPPORT_DATA_DIR: dataDirectory,
        },
      },
    );

    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    const failure = JSON.parse(result.stderr) as {
      schemaVersion: string;
      ok: boolean;
      command: string;
      error: { code: string };
    };
    assert.equal(failure.schemaVersion, "threadmark.headless.v1");
    assert.equal(failure.ok, false);
    assert.equal(failure.command, "tickets.list");
    assert.equal(failure.error.code, "remote_not_found");
    await assert.rejects(access(dataDirectory), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI recusa seletores remotos duplicados ou fora do prefixo antes do modo local", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-selector-"));
  const dataDirectory = path.join(directory, "local-data");
  const sshLog = path.join(directory, "ssh.jsonl");
  const env = {
    THREADMARK_REMOTE_CONFIG_PATH: path.join(directory, "config", "remotes.json"),
    SUPPORT_DATA_DIR: dataDirectory,
    THREADMARK_FAKE_SSH_LOG: sshLog,
    PATH: `${path.join(projectRoot, "tests", "fixtures")}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  try {
    for (const [args, expectedCode] of [
      [
        ["--remote", "production", "--remote", "staging", "tickets", "list", "--json"],
        "remote_selector_duplicate",
      ],
      [
        ["tickets", "list", "--remote", "production", "--json"],
        "remote_selector_misplaced",
      ],
    ] as const) {
      const result = await runThreadmark(args, { env });
      assert.equal(result.code, 2);
      const failure = JSON.parse(result.stderr) as { error: { code: string } };
      assert.equal(failure.error.code, expectedCode);
    }
    await assert.rejects(access(dataDirectory), { code: "ENOENT" });
    await assert.rejects(access(sshLog), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI remoto encaminha --input local pela entrada padrão e preserva auditoria", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-input-"));
  const configPath = path.join(directory, "config", "remotes.json");
  const dockerLog = path.join(directory, "docker.jsonl");
  const inputPath = path.join(directory, "ticket-input.json");
  const input = JSON.stringify({
    clientRequestId: "remote-ação-1",
    groupId: "group-1",
    title: "Título com acentuação",
    summary: "Cliente escreveu: Olá, preciso de ajuda 🍕.",
  });
  const env = {
    THREADMARK_REMOTE_CONFIG_PATH: configPath,
    THREADMARK_FAKE_DOCKER_LOG: dockerLog,
    THREADMARK_FAKE_DOCKER_STDOUT: "{\"ok\":true}\n",
    PATH: `${path.join(projectRoot, "tests", "fixtures")}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  try {
    await writeFile(inputPath, input, { mode: 0o600 });
    const added = await runThreadmark(
      ["remote", "add", "production", "--ssh", "threadmark-prod", "--container", "threadmark"],
      { env },
    );
    assert.equal(added.code, 0);

    const invoked = await runThreadmark(
      [
        "--remote",
        "production",
        "tickets",
        "create",
        "--input",
        inputPath,
        "--apply",
        "--as",
        "Pessoa Operadora",
        "--client",
        "hermes",
        "--json",
      ],
      { env },
    );

    assert.equal(invoked.code, 0);
    const [docker] = await readJsonLines<{ args: string[]; stdin: string }>(dockerLog);
    assert.deepEqual(docker?.args, [
      "exec",
      "-i",
      "threadmark",
      "node",
      "/app/bin/threadmark.mjs",
      "tickets",
      "create",
      "--input",
      "-",
      "--apply",
      "--as",
      "Pessoa Operadora",
      "--client",
      "hermes",
      "--json",
    ]);
    assert.equal(docker?.stdin, input);
    assert.doesNotMatch(JSON.stringify(docker?.args), new RegExp(inputPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI remoto limita arquivo local de entrada antes de iniciar SSH", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-input-limit-"));
  const configPath = path.join(directory, "config", "remotes.json");
  const inputPath = path.join(directory, "large.json");
  const sshLog = path.join(directory, "ssh.jsonl");
  const env = {
    THREADMARK_REMOTE_CONFIG_PATH: configPath,
    THREADMARK_FAKE_SSH_LOG: sshLog,
    PATH: `${path.join(projectRoot, "tests", "fixtures")}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  try {
    await writeFile(inputPath, Buffer.alloc(64 * 1024 + 1), { mode: 0o600 });
    const added = await runThreadmark(
      ["remote", "add", "production", "--ssh", "threadmark-prod", "--container", "threadmark"],
      { env },
    );
    assert.equal(added.code, 0);

    const result = await runThreadmark(
      [
        "--remote",
        "production",
        "tickets",
        "create",
        "--input",
        inputPath,
        "--apply",
        "--as",
        "Pessoa Operadora",
        "--json",
      ],
      { env },
    );

    assert.equal(result.code, 2);
    const failure = JSON.parse(result.stderr) as { error: { code: string } };
    assert.equal(failure.error.code, "input_too_large");
    await assert.rejects(access(sshLog), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("registro remoto serializa inclusões concorrentes", { timeout: 10_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-lock-"));
  const configPath = path.join(directory, "config", "remotes.json");
  const env = { THREADMARK_REMOTE_CONFIG_PATH: configPath };
  const names = Array.from({ length: 8 }, (_, index) => `remote-${index}`);
  try {
    const added = await Promise.all(
      names.map((name) =>
        runThreadmark(
          ["remote", "add", name, "--ssh", `ssh-${name}`, "--container", `container-${name}`, "--json"],
          { env },
        )),
    );
    assert.deepEqual(added.map((result) => result.code), Array(names.length).fill(0));

    const listed = await runThreadmark(["remote", "list", "--json"], { env });
    assert.equal(listed.code, 0);
    assert.deepEqual(
      (JSON.parse(listed.stdout) as { remotes: Array<{ name: string }> }).remotes.map(
        (remote) => remote.name,
      ),
      [...names].sort(),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("registro remoto mantém lock preexistente e não bloqueia leituras", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-stale-lock-"));
  const configPath = path.join(directory, "config", "remotes.json");
  const lockPath = `${configPath}.lock`;
  const remote = { name: "production", ssh: "threadmark-prod", container: "threadmark" };
  try {
    await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
    await writeFile(
      configPath,
      `${JSON.stringify({ version: 1, remotes: [remote] })}\n`,
      { mode: 0o600 },
    );
    await mkdir(lockPath, { mode: 0o700 });
    const lockBefore = await stat(lockPath);

    await assert.rejects(
      addRemote(
        { name: "staging", ssh: "threadmark-staging", container: "threadmark-staging" },
        configPath,
      ),
      (error: unknown) => {
        assert.ok(error instanceof RemoteCliError);
        assert.equal(error.code, "remote_config_busy");
        assert.match(error.message, /processo anterior possivelmente interrompido/i);
        assert.equal((error.details as { lockPath?: string })?.lockPath, lockPath);
        return true;
      },
    );

    const lockAfter = await stat(lockPath);
    assert.equal(lockAfter.ino, lockBefore.ino);
    assert.equal(lockAfter.mode, lockBefore.mode);
    assert.equal(lockAfter.mtimeMs, lockBefore.mtimeMs);
    assert.deepEqual(await readdir(lockPath), []);
    assert.deepEqual(await listRemotes(configPath), [remote]);
    assert.deepEqual(await getRemote("production", configPath), remote);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("registro remoto não muda a permissão de um pai existente no override", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-parent-"));
  const configDirectory = path.join(directory, "existing-parent");
  const configPath = path.join(configDirectory, "remotes.json");
  try {
    await mkdir(configDirectory, { mode: 0o755 });
    await chmod(configDirectory, 0o755);
    const added = await runThreadmark(
      ["remote", "add", "production", "--ssh", "threadmark-prod", "--container", "threadmark"],
      { env: { THREADMARK_REMOTE_CONFIG_PATH: configPath } },
    );

    assert.equal(added.code, 0);
    assert.equal((await stat(configDirectory)).mode & 0o777, 0o755);
    assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("gerenciamento remoto remove somente a configuração e recusa opções ambíguas", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-management-"));
  const configPath = path.join(directory, "config", "remotes.json");
  const sshLog = path.join(directory, "ssh.jsonl");
  const env = {
    THREADMARK_REMOTE_CONFIG_PATH: configPath,
    THREADMARK_FAKE_SSH_LOG: sshLog,
    PATH: `${path.join(projectRoot, "tests", "fixtures")}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  try {
    const added = await runThreadmark(
      ["remote", "add", "production", "--ssh", "threadmark-prod", "--container", "threadmark", "--json"],
      { env },
    );
    assert.equal(added.code, 0);

    const duplicate = await runThreadmark(
      [
        "remote",
        "add",
        "staging",
        "--ssh",
        "first",
        "--ssh",
        "second",
        "--container",
        "threadmark",
        "--json",
      ],
      { env },
    );
    assert.equal(duplicate.code, 2);
    assert.equal((JSON.parse(duplicate.stderr) as { error: { code: string } }).error.code, "remote_option_duplicate");

    const removed = await runThreadmark(["remote", "remove", "production", "--json"], { env });
    assert.equal(removed.code, 0);
    assert.deepEqual(JSON.parse(removed.stdout), {
      ok: true,
      remote: { name: "production", ssh: "threadmark-prod", container: "threadmark" },
    });
    const listed = await runThreadmark(["remote", "list", "--json"], { env });
    assert.deepEqual(JSON.parse(listed.stdout), { ok: true, remotes: [] });
    await assert.rejects(access(sshLog), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("transporte remoto preserva falha e sinal sem repetir escrita", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-transport-failure-"));
  const configPath = path.join(directory, "config", "remotes.json");
  const fixturePath = path.join(projectRoot, "tests", "fixtures");
  const baseEnv = {
    THREADMARK_REMOTE_CONFIG_PATH: configPath,
    PATH: `${fixturePath}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  try {
    const added = await runThreadmark(
      ["remote", "add", "production", "--ssh", "threadmark-prod", "--container", "threadmark"],
      { env: baseEnv },
    );
    assert.equal(added.code, 0);

    const failureLog = path.join(directory, "failure-ssh.jsonl");
    const failure = await runThreadmark(
      [
        "--remote",
        "production",
        "tickets",
        "status",
        "ticket-1",
        "--apply",
        "--as",
        "Pessoa Operadora",
        "--json",
      ],
      {
        env: {
          ...baseEnv,
          THREADMARK_FAKE_SSH_LOG: failureLog,
          THREADMARK_FAKE_DOCKER_EXIT: "73",
          THREADMARK_FAKE_DOCKER_STDERR: "docker command failed\n",
        },
      },
    );
    assert.equal(failure.code, 73);
    assert.equal(failure.signal, null);
    assert.equal((JSON.parse(failure.stderr) as { error: { code: string } }).error.code, "remote_transport_failed");
    const failureSsh = await readJsonLines<{ args: string[] }>(failureLog);
    assert.equal(failureSsh.length, 1);
    assert.deepEqual(failureSsh[0]?.args.slice(0, 18), [
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "ConnectionAttempts=1",
      "-o",
      "ForwardAgent=no",
      "-o",
      "ClearAllForwardings=yes",
      "-o",
      "ServerAliveInterval=10",
      "-o",
      "ServerAliveCountMax=2",
      "threadmark-prod",
    ]);

    const signalLog = path.join(directory, "signal-ssh.jsonl");
    const interrupted = await runThreadmark(
      ["--remote", "production", "tickets", "list", "--json"],
      {
        env: { ...baseEnv, THREADMARK_FAKE_SSH_LOG: signalLog, THREADMARK_FAKE_SSH_HOLD_MS: "2000" },
        signal: "SIGTERM",
        signalAfterMs: 1000,
      },
    );
    assert.equal(interrupted.code, 143);
    assert.equal(interrupted.signal, null);
    assert.equal((await readJsonLines(signalLog)).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("erros de I/O da configuração remota permanecem JSON", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-io-"));
  const parentFile = path.join(directory, "not-a-directory");
  try {
    await writeFile(parentFile, "not a directory", { mode: 0o600 });
    const result = await runThreadmark(["remote", "list", "--json"], {
      env: { THREADMARK_REMOTE_CONFIG_PATH: path.join(parentFile, "remotes.json") },
    });

    assert.equal(result.code, 2);
    const failure = JSON.parse(result.stderr) as { ok: boolean; error: { code: string } };
    assert.equal(failure.ok, false);
    assert.equal(failure.error.code, "remote_config_io");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI remoto normaliza um único --input local e rejeita duplicidade", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-input-options-"));
  const configPath = path.join(directory, "config", "remotes.json");
  const inputPath = path.join(directory, "payload.json");
  const dockerLog = path.join(directory, "docker.jsonl");
  const input = '{"groupId":"grupo-á"}';
  const env = {
    THREADMARK_REMOTE_CONFIG_PATH: configPath,
    THREADMARK_FAKE_DOCKER_LOG: dockerLog,
    PATH: `${path.join(projectRoot, "tests", "fixtures")}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  try {
    await writeFile(inputPath, input, { mode: 0o600 });
    const added = await runThreadmark(
      ["remote", "add", "production", "--ssh", "threadmark-prod", "--container", "threadmark"],
      { env },
    );
    assert.equal(added.code, 0);

    const duplicate = await runThreadmark(
      [
        "--remote",
        "production",
        "tickets",
        "create",
        "--input",
        inputPath,
        "--input",
        inputPath,
        "--apply",
        "--as",
        "Pessoa Operadora",
        "--json",
      ],
      { env },
    );
    assert.equal(duplicate.code, 2);
    assert.equal((JSON.parse(duplicate.stderr) as { error: { code: string } }).error.code, "remote_input_duplicate");
    await assert.rejects(access(dockerLog), { code: "ENOENT" });

    const inline = await runThreadmark(
      [
        "--remote",
        "production",
        "tickets",
        "create",
        `--input=${inputPath}`,
        "--apply",
        "--as",
        "Pessoa Operadora",
        "--json",
      ],
      { env },
    );
    assert.equal(inline.code, 0);
    const [docker] = await readJsonLines<{ args: string[]; stdin: string }>(dockerLog);
    assert.equal(docker?.args.includes(inputPath), false);
    assert.deepEqual(docker?.args.slice(5, 10), ["tickets", "create", "--input", "-", "--apply"]);
    assert.equal(docker?.stdin, input);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI local permanece direta e comandos não headless são recusados remotamente", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-remote-local-"));
  const sshLog = path.join(directory, "ssh.jsonl");
  const env = {
    THREADMARK_REMOTE_CONFIG_PATH: path.join(directory, "config", "remotes.json"),
    THREADMARK_FAKE_SSH_LOG: sshLog,
    PATH: `${path.join(projectRoot, "tests", "fixtures")}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  try {
    const local = await runThreadmark(["capabilities", "--json"], { env });
    assert.equal(local.code, 0);
    assert.equal((JSON.parse(local.stdout) as { ok: boolean }).ok, true);

    const rejected = await runThreadmark(["--remote", "unused", "on", "--json"], { env });
    assert.equal(rejected.code, 2);
    assert.equal((JSON.parse(rejected.stderr) as { error: { code: string } }).error.code, "remote_unsupported_command");
    await assert.rejects(access(sshLog), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function readJsonLines<T>(filePath: string): Promise<T[]> {
  const content = await readFile(filePath, "utf8");
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
