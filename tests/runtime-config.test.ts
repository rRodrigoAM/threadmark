import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../server/runtime/config.js";

test("config mantem servico restrito ao localhost por padrao", () => {
  const config = loadConfig({});

  assert.equal(config.apiHost, "127.0.0.1");
  assert.equal(config.apiPort, 4317);
  assert.equal(config.apiUrl, "http://127.0.0.1:4317");
  assert.equal(config.publicOrigin, "http://127.0.0.1:3000");
  assert.match(config.databasePath, /\.data\/threadmark\.sqlite$/);
  assert.deepEqual(config.monitoredGroupJids, []);
  assert.deepEqual(config.staffIdentities, []);
  assert.equal(config.triageAiEnabled, true);
  assert.equal(config.triageAiModel, "gpt-5.4-mini");
  assert.equal(config.triageAiQuietMs, 180_000);
  assert.equal("agentExecutor" in config, false);
});

test("config separa origem pública HTTPS da origem interna da Web", () => {
  const config = loadConfig({
    SUPPORT_WEB_ORIGIN: "http://127.0.0.1:3000",
    SUPPORT_PUBLIC_ORIGIN: "https://threadmark.example.com",
  });

  assert.equal(config.webOrigin, "http://127.0.0.1:3000");
  assert.equal(config.publicOrigin, "https://threadmark.example.com");
  assert.equal(
    loadConfig({ SUPPORT_PUBLIC_ORIGIN: "" }).publicOrigin,
    "http://127.0.0.1:3000",
  );
});

test("config ignora seleção do executor interno aposentado", () => {
  const config = loadConfig({ SUPPORT_AGENT_EXECUTOR: "internal", CODEX_BIN: "should-not-run" });

  assert.equal("agentExecutor" in config, false);
  assert.equal("codexBin" in config, false);
});

test("config normaliza grupos e equipe sem duplicatas", () => {
  const config = loadConfig({
    SUPPORT_MONITORED_GROUPS: "g1@g.us, g2@g.us,g1@g.us",
    SUPPORT_STAFF_IDENTITIES: "5511999999999, 5511888888888",
  });

  assert.deepEqual(config.monitoredGroupJids, ["g1@g.us", "g2@g.us"]);
  assert.deepEqual(config.staffIdentities, ["5511999999999", "5511888888888"]);
});

test("config aceita modelo e janela econômica da triagem", () => {
  const config = loadConfig({
    SUPPORT_TRIAGE_AI_ENABLED: "false",
    SUPPORT_TRIAGE_AI_MODEL: "gpt-5.4",
    SUPPORT_TRIAGE_AI_QUIET_MS: "45000",
  });

  assert.equal(config.triageAiEnabled, false);
  assert.equal(config.triageAiModel, "gpt-5.4");
  assert.equal(config.triageAiQuietMs, 45_000);
});

test("config por ambiente aceita o mesmo limite de 30 minutos da interface", () => {
  const config = loadConfig({
    SUPPORT_TRIAGE_AI_QUIET_MS: String(30 * 60_000),
  });

  assert.equal(config.triageAiQuietMs, 30 * 60_000);
});

test("config por ambiente rejeita janela menor que os 30 segundos do SQLite", () => {
  assert.throws(
    () => loadConfig({ SUPPORT_TRIAGE_AI_QUIET_MS: "29000" }),
    /expected number to be >=30000/i,
  );
});

test("config ignora raízes legadas de ferramentas aposentadas", () => {
  const config = loadConfig({
    SUPPORT_CODE_ROOTS: "/produto/a, /produto/b,/produto/a",
    SUPPORT_VAULT_DIR: "/conhecimento",
  });

  assert.equal("legacyCodeRoots" in config, false);
  assert.equal("legacyVaultDirectory" in config, false);
});
