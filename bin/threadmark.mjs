#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const invocationCwd = process.cwd();
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const cli = path.join(projectRoot, "server", "cli.ts");
const isRemoteInvocation = process.argv[2] === "remote"
  || process.argv[2] === "--remote"
  || process.argv[2]?.startsWith("--remote=");
const compiledCli = path.join(projectRoot, "dist", "cli", "server", "cli.js");
const useCompiledCli = isRemoteInvocation && !existsSync(path.join(projectRoot, ".git")) && existsSync(compiledCli);
const childArguments = useCompiledCli
  ? [compiledCli, ...process.argv.slice(2)]
  : [tsxCli, cli, ...process.argv.slice(2)];
const child = spawn(process.execPath, childArguments, {
  cwd: projectRoot,
  env: { ...process.env, THREADMARK_INVOKE_CWD: invocationCwd },
  stdio: "inherit",
});

const forward = (signal) => {
  if (child.exitCode === null && child.signalCode === null) child.kill(signal);
};
process.once("SIGINT", forward);
process.once("SIGTERM", forward);

child.once("error", (error) => {
  console.error(`Não foi possível iniciar o Threadmark: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.off("SIGINT", forward);
  process.off("SIGTERM", forward);
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
