import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("imagem Coolify mantém um único processo supervisor e volume persistente", async () => {
  const [dockerfile, dockerignore, packageSource, nextConfig, envExample] =
    await Promise.all([
      readFile("Dockerfile", "utf8"),
      readFile(".dockerignore", "utf8"),
      readFile("package.json", "utf8"),
      readFile("next.config.ts", "utf8"),
      readFile(".env.example", "utf8"),
    ]);
  const packageJson = JSON.parse(packageSource) as {
    scripts: Record<string, string>;
  };

  assert.match(dockerfile, /^FROM node:22-bookworm-slim AS build/m);
  assert.match(dockerfile, /^FROM node:22-bookworm-slim AS runtime/m);
  assert.match(dockerfile, /^ENV SUPPORT_DATA_DIR=\/app\/data/m);
  assert.match(dockerfile, /^ENV HOST=0\.0\.0\.0/m);
  assert.match(dockerfile, /^ENV SUPPORT_API_HOST=127\.0\.0\.1/m);
  assert.match(dockerfile, /^EXPOSE 3000/m);
  assert.match(dockerfile, /^VOLUME \["\/app\/data"\]/m);
  assert.match(dockerfile, /^USER node/m);
  assert.match(dockerfile, /^HEALTHCHECK .*http:\/\/127\.0\.0\.1:3000\/health/m);
  assert.match(
    dockerfile,
    /^CMD \["node", "--import", "tsx", "server\/daemon\.ts"\]/m,
  );
  assert.equal(packageJson.scripts["container:start"], "tsx server/daemon.ts");

  assert.match(nextConfig, /source: "\/api\/:path\*"/);
  assert.match(nextConfig, /destination: `\$\{internalApiUrl\}\/api\/:path\*`/);
  assert.match(nextConfig, /source: "\/health"/);
  assert.match(nextConfig, /destination: `\$\{internalApiUrl\}\/health`/);
  assert.match(envExample, /^SUPPORT_PUBLIC_ORIGIN=/m);

  for (const ignored of [".git", ".data", "node_modules", "dist", ".env"]) {
    assert.match(dockerignore, new RegExp(`^${ignored.replace(".", "\\.")}$`, "m"));
  }
});

test("Electron e artefatos exclusivos não fazem parte do pacote web", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    main?: string;
    build?: unknown;
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  assert.equal(packageJson.main, undefined);
  assert.equal(packageJson.build, undefined);
  assert.equal(packageJson.devDependencies.electron, undefined);
  assert.equal(packageJson.devDependencies["electron-builder"], undefined);
  assert.equal(
    Object.keys(packageJson.scripts).some((script) =>
      script.startsWith("desktop:") || script === "release:desktop"
    ),
    false,
  );
});

test("daemon do container emite bootstrap e compartilha autenticação com a API", async () => {
  const daemon = await readFile("server/daemon.ts", "utf8");

  assert.match(daemon, /const authService = new LocalAuthService\(database\)/);
  assert.match(daemon, /const setupChallenges = new SetupChallengeService\(database\)/);
  assert.match(daemon, /Código de configuração inicial/);
  assert.match(daemon, /authService,/);
  assert.match(daemon, /setupChallenges,/);
  assert.match(daemon, /previous !== process\.pid/);
});
