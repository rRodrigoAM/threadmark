import { spawn } from "node:child_process";

import { RemoteCliError, type RemoteTarget } from "./registry.js";

const SSH_CONNECT_TIMEOUT_SECONDS = 10;
const MAX_CAPTURED_STDERR_BYTES = 64 * 1024;

export interface RemoteCommandInput {
  remote: RemoteTarget;
  command: string;
  args: string[];
  input?: Buffer;
  json: boolean;
}

export function quotePosix(argument: string): string {
  return `'${argument.replaceAll("'", "'\"'\"'")}'`;
}

export async function runRemoteCommand(input: RemoteCommandInput): Promise<void> {
  const remoteCommand = [
    "docker",
    "exec",
    "-i",
    input.remote.container,
    "node",
    "/app/bin/threadmark.mjs",
    input.command,
    ...input.args,
  ]
    .map(quotePosix)
    .join(" ");
  const child = spawn(
    "ssh",
    [
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SECONDS}`,
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
      input.remote.ssh,
      remoteCommand,
    ],
    {
      stdio: [
        input.input ? "pipe" : "inherit",
        "pipe",
        input.json ? "pipe" : "inherit",
      ],
    },
  );
  child.stdout?.pipe(process.stdout, { end: false });
  const stderrChunks: Buffer[] = [];
  let stderrBytes = 0;
  let stderrTruncated = false;
  if (input.json) {
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrTruncated) return;
      const remaining = MAX_CAPTURED_STDERR_BYTES - stderrBytes;
      if (remaining <= 0 || chunk.length > remaining) {
        if (remaining > 0) stderrChunks.push(chunk.subarray(0, remaining));
        stderrTruncated = true;
        return;
      }
      stderrChunks.push(chunk);
      stderrBytes += chunk.length;
    });
  }
  if (input.input) {
    child.stdin?.once("error", () => undefined);
    child.stdin?.end(input.input);
  }

  const forward = (signal: NodeJS.Signals) => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  };
  process.once("SIGINT", forward);
  process.once("SIGTERM", forward);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
    };
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new RemoteCliError(
          "remote_transport_unavailable",
          `Não foi possível iniciar o SSH para “${input.remote.name}”: ${error.message}`,
        ),
      );
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        if (input.json) printRemoteFailure(input, code ?? 1, stderr, stderrTruncated);
        process.exitCode = code ?? 1;
      } else if (input.json && stderr) {
        process.stderr.write(stderr);
      }
      resolve();
    });
  });
}

function printRemoteFailure(
  input: RemoteCommandInput,
  exitCode: number,
  stderr: string,
  stderrTruncated: boolean,
): void {
  if (!stderrTruncated && isHeadlessFailure(stderr)) {
    process.stderr.write(stderr);
    return;
  }
  process.stderr.write(
    `${JSON.stringify({
      schemaVersion: "threadmark.headless.v1",
      ok: false,
      command: remoteCommandName(input.command, input.args),
      error: {
        code: "remote_transport_failed",
        message: `A execução remota via SSH falhou com código ${exitCode}.`,
      },
    })}\n`,
  );
}

function isHeadlessFailure(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as { ok?: unknown; error?: unknown };
    return parsed.ok === false && Boolean(parsed.error) && typeof parsed.error === "object";
  } catch {
    return false;
  }
}

function remoteCommandName(command: string, args: string[]): string {
  const action = args.find((argument) => !argument.startsWith("--"));
  return action ? `${command}.${action}` : command;
}
