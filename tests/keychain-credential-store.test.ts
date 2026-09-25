import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { RemoteCredentialStore } from "../server/remote/credential-store.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("Keychain guarda referência por remoto sem colocar o token no argv", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "threadmark-keychain-"));
  const logPath = path.join(directory, "security.jsonl");
  const token = "tmk_segredo-que-nao-pode-aparecer-no-processo";
  const store = new RemoteCredentialStore(
    {
      ...process.env,
      NODE_ENV: "test",
      THREADMARK_SECURITY_COMMAND: path.join(projectRoot, "tests", "fixtures", "security"),
      THREADMARK_FAKE_SECURITY_LOG: logPath,
      THREADMARK_FAKE_KEYCHAIN_TOKEN: token,
    },
    "darwin",
  );

  try {
    const production = { name: "production", url: "https://threadmark.example" };
    await store.storeInteractively(production);
    assert.equal(await store.read(production), token);
    assert.equal(
      await store.read({ name: "production", url: "https://outro.example" }),
      token,
    );
    assert.equal(await store.remove(production), true);

    const calls = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { args: string[] });
    assert.deepEqual(calls.map((call) => call.args[0]), [
      "add-generic-password",
      "find-generic-password",
      "find-generic-password",
      "delete-generic-password",
    ]);
    assert.equal(calls.some((call) => call.args.includes(token)), false);
    assert.deepEqual(calls[0]?.args.slice(-2), ["-U", "-w"]);
    assert.notEqual(calls[1]?.args[2], calls[2]?.args[2]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Keychain falha fechado fora do macOS", async () => {
  const store = new RemoteCredentialStore({ NODE_ENV: "test" }, "linux");
  await assert.rejects(
    store.read({ name: "production", url: "https://threadmark.example" }),
    /macOS Keychain/,
  );
});
