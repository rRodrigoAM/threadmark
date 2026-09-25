import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

import { RemoteCliError, type HttpsRemoteTarget } from "./registry.js";

const execFileAsync = promisify(execFile);
const KEYCHAIN_SERVICE = "com.threadmark.cli.remote";

export class RemoteCredentialStore {
  private readonly command: string;

  constructor(
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    this.command = environment.NODE_ENV === "test"
      ? environment.THREADMARK_SECURITY_COMMAND?.trim() || "/usr/bin/security"
      : "/usr/bin/security";
  }

  async storeInteractively(
    remote: HttpsRemoteTarget,
    candidate = false,
  ): Promise<void> {
    this.assertSupported();
    console.error("Cole a mesma credencial nas duas solicitações seguras do macOS Keychain.");
    await this.spawnStore(credentialAccount(remote, candidate));
  }

  async write(remote: HttpsRemoteTarget, token: string): Promise<void> {
    this.assertSupported();
    await this.spawnStore(credentialAccount(remote), token);
  }

  async read(remote: HttpsRemoteTarget, candidate = false): Promise<string> {
    this.assertSupported();
    try {
      const result = await execFileAsync(
        this.command,
        [
          "find-generic-password",
          "-a",
          credentialAccount(remote, candidate),
          "-s",
          KEYCHAIN_SERVICE,
          "-w",
        ],
        { encoding: "utf8", env: this.environment, maxBuffer: 16 * 1024 },
      );
      const token = result.stdout.replace(/[\r\n]+$/, "");
      if (!token) {
        throw new RemoteCliError(
          "remote_authentication_required",
          `O remoto “${remote.name}” não possui credencial no macOS Keychain. Execute \`threadmark remote login ${remote.name}\`.`,
        );
      }
      return token;
    } catch (error) {
      if (error instanceof RemoteCliError) throw error;
      if ((error as { code?: number | string }).code === 44) {
        throw new RemoteCliError(
          "remote_authentication_required",
          `O remoto “${remote.name}” não possui credencial no macOS Keychain. Execute \`threadmark remote login ${remote.name}\`.`,
        );
      }
      throw new RemoteCliError(
        "remote_credential_store_failed",
        "Não foi possível ler a credencial no macOS Keychain.",
      );
    }
  }

  async remove(remote: HttpsRemoteTarget, candidate = false): Promise<boolean> {
    this.assertSupported();
    try {
      await execFileAsync(
        this.command,
        [
          "delete-generic-password",
          "-a",
          credentialAccount(remote, candidate),
          "-s",
          KEYCHAIN_SERVICE,
        ],
        { encoding: "utf8", env: this.environment, maxBuffer: 16 * 1024 },
      );
      return true;
    } catch {
      return false;
    }
  }

  private async spawnStore(account: string, token?: string): Promise<void> {
    const child = spawn(
      this.command,
      [
        "add-generic-password",
        "-a",
        account,
        "-s",
        KEYCHAIN_SERVICE,
        "-U",
        "-w",
      ],
      {
        env: this.environment,
        stdio: token === undefined ? "inherit" : ["pipe", "ignore", "inherit"],
      },
    );
    if (token !== undefined) child.stdin!.end(`${token}\n${token}\n`);
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal }));
      },
    );
    if (result.signal || result.code !== 0) {
      throw new RemoteCliError(
        "remote_credential_store_failed",
        "Não foi possível salvar a credencial no macOS Keychain.",
      );
    }
  }

  private assertSupported(): void {
    if (this.platform !== "darwin") {
      throw new RemoteCliError(
        "remote_credential_store_unsupported",
        "Credenciais HTTPS remotas exigem o macOS Keychain nesta versão.",
      );
    }
  }
}

function credentialAccount(remote: HttpsRemoteTarget, candidate = false): string {
  const originDigest = createHash("sha256")
    .update(remote.url, "utf8")
    .digest("base64url")
    .slice(0, 20);
  return `${remote.name}:${originDigest}${candidate ? ":candidate" : ""}`;
}
