import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const REMOTE_CONFIG_VERSION = 1;
const REMOTE_CONFIG_LOCK_TIMEOUT_MS = 2_000;
const REMOTE_CONFIG_LOCK_RETRY_MS = 20;
const REMOTE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SSH_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CONTAINER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export interface RemoteTarget {
  name: string;
  ssh: string;
  container: string;
}

interface RemoteConfigFile {
  version: typeof REMOTE_CONFIG_VERSION;
  remotes: RemoteTarget[];
}

export class RemoteCliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "RemoteCliError";
  }
}

export function remoteConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.THREADMARK_REMOTE_CONFIG_PATH?.trim();
  if (override) return path.resolve(override);
  const home = env.HOME?.trim();
  const userHome = home && path.isAbsolute(home) ? home : os.homedir();
  const xdgConfigHome = env.XDG_CONFIG_HOME?.trim();
  const configHome = xdgConfigHome && path.isAbsolute(xdgConfigHome)
    ? xdgConfigHome
    : path.join(userHome, ".config");
  return path.join(configHome, "threadmark", "remotes.json");
}

export function validateRemoteName(value: string): string {
  return validate(value, REMOTE_NAME_PATTERN, "Nome remoto inválido. Use letras, números, ponto, hífen ou sublinhado.");
}

export function validateSshAlias(value: string): string {
  return validate(
    value,
    SSH_ALIAS_PATTERN,
    "Alias SSH inválido. Use um alias local de ~/.ssh/config sem usuário, senha ou opções.",
  );
}

export function validateContainerName(value: string): string {
  return validate(
    value,
    CONTAINER_NAME_PATTERN,
    "Nome de container inválido. Use letras, números, ponto, hífen ou sublinhado.",
  );
}

export async function listRemotes(configPath = remoteConfigPath()): Promise<RemoteTarget[]> {
  const config = await readConfig(configPath);
  return [...config.remotes].sort((left, right) => left.name.localeCompare(right.name));
}

export async function getRemote(
  name: string,
  configPath = remoteConfigPath(),
): Promise<RemoteTarget> {
  const normalizedName = validateRemoteName(name);
  const remote = (await readConfig(configPath)).remotes.find(
    (candidate) => candidate.name === normalizedName,
  );
  if (!remote) {
    throw new RemoteCliError(
      "remote_not_found",
      `Remoto “${normalizedName}” não encontrado. Cadastre-o com \`threadmark remote add\`.`,
    );
  }
  return remote;
}

export async function addRemote(
  remote: RemoteTarget,
  configPath = remoteConfigPath(),
): Promise<RemoteTarget> {
  const normalized = normalizeRemote(remote);
  return mutateConfig(configPath, async () => {
    const config = await readConfig(configPath);
    if (config.remotes.some((candidate) => candidate.name === normalized.name)) {
      throw new RemoteCliError(
        "remote_exists",
        `Já existe um remoto chamado “${normalized.name}”. Remova-o antes de cadastrá-lo novamente.`,
      );
    }
    await writeConfig(configPath, {
      version: REMOTE_CONFIG_VERSION,
      remotes: [...config.remotes, normalized],
    });
    return normalized;
  });
}

export async function removeRemote(
  name: string,
  configPath = remoteConfigPath(),
): Promise<RemoteTarget> {
  const normalizedName = validateRemoteName(name);
  return mutateConfig(configPath, async () => {
    const config = await readConfig(configPath);
    const remote = config.remotes.find((candidate) => candidate.name === normalizedName);
    if (!remote) {
      throw new RemoteCliError(
        "remote_not_found",
        `Remoto “${normalizedName}” não encontrado. Nenhum servidor foi alterado.`,
      );
    }
    await writeConfig(configPath, {
      version: REMOTE_CONFIG_VERSION,
      remotes: config.remotes.filter((candidate) => candidate.name !== normalizedName),
    });
    return remote;
  });
}

function validate(value: string, pattern: RegExp, message: string): string {
  const normalized = value.trim();
  if (!pattern.test(normalized)) {
    throw new RemoteCliError("invalid_remote_config", message);
  }
  return normalized;
}

function normalizeRemote(remote: RemoteTarget): RemoteTarget {
  return {
    name: validateRemoteName(remote.name),
    ssh: validateSshAlias(remote.ssh),
    container: validateContainerName(remote.container),
  };
}

async function mutateConfig<T>(
  configPath: string,
  mutation: () => Promise<T>,
): Promise<T> {
  await ensureConfigDirectory(configPath);
  return withConfigLock(configPath, mutation);
}

async function withConfigLock<T>(
  configPath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lockPath = `${configPath}.lock`;
  const deadline = Date.now() + REMOTE_CONFIG_LOCK_TIMEOUT_MS;
  while (true) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        throw new RemoteCliError(
          "remote_config_busy",
          "A configuração remota está ocupada. Outro processo pode estar alterando-a, ou um processo anterior possivelmente interrompido pode ter deixado este lock. Verifique se não há uma edição ativa e faça a recuperação manual do lock antes de tentar novamente.",
          { lockPath },
        );
      }
      await wait(REMOTE_CONFIG_LOCK_RETRY_MS);
    }
  }
  try {
    return await operation();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

async function readConfig(configPath: string): Promise<RemoteConfigFile> {
  const existing = await inspectConfig(configPath);
  if (!existing) return { version: REMOTE_CONFIG_VERSION, remotes: [] };
  await chmod(configPath, 0o600);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(configPath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new RemoteCliError("remote_config_invalid", "O arquivo de remotos não contém JSON válido.");
    }
    throw error;
  }
  return parseConfig(parsed);
}

function parseConfig(value: unknown): RemoteConfigFile {
  if (!isRecord(value) || value.version !== REMOTE_CONFIG_VERSION || !Array.isArray(value.remotes)) {
    throw new RemoteCliError("remote_config_invalid", "O arquivo de remotos tem formato inválido.");
  }
  const remotes = value.remotes.map((candidate) => {
    if (!isRecord(candidate) || Object.keys(candidate).length !== 3) {
      throw new RemoteCliError("remote_config_invalid", "O arquivo de remotos contém um registro inválido.");
    }
    if (
      typeof candidate.name !== "string"
      || typeof candidate.ssh !== "string"
      || typeof candidate.container !== "string"
    ) {
      throw new RemoteCliError("remote_config_invalid", "O arquivo de remotos contém um registro inválido.");
    }
    return normalizeRemote({
      name: candidate.name,
      ssh: candidate.ssh,
      container: candidate.container,
    });
  });
  const names = new Set(remotes.map((remote) => remote.name));
  if (names.size !== remotes.length) {
    throw new RemoteCliError("remote_config_invalid", "O arquivo de remotos contém nomes duplicados.");
  }
  return { version: REMOTE_CONFIG_VERSION, remotes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function writeConfig(configPath: string, config: RemoteConfigFile): Promise<void> {
  const directory = await ensureConfigDirectory(configPath);
  await inspectConfig(configPath);

  const temporaryPath = path.join(
    directory,
    `.${path.basename(configPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(config, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, configPath);
    await chmod(configPath, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function ensureConfigDirectory(configPath: string): Promise<string> {
  const directory = path.dirname(configPath);
  const created = await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryMetadata = await lstat(directory);
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
    throw new RemoteCliError("remote_config_invalid", "O diretório de configuração remota não é seguro.");
  }
  if (created || isDefaultConfigPath(configPath)) await chmod(directory, 0o700);
  return directory;
}

function isDefaultConfigPath(configPath: string): boolean {
  return !process.env.THREADMARK_REMOTE_CONFIG_PATH?.trim()
    && path.resolve(configPath) === remoteConfigPath();
}

async function inspectConfig(configPath: string): Promise<boolean> {
  try {
    const metadata = await lstat(configPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new RemoteCliError("remote_config_invalid", "O arquivo de remotos não é um arquivo regular seguro.");
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
