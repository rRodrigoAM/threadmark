import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const source = (file: string) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("Threadmark AI não possui UI, executor, tools ou endpoints ativos", async () => {
  const removed = [
    "app/features/threadmark-ai/",
    "app/features/documentation/",
    "app/features/settings/components/sections/ai-section.tsx",
    "app/features/settings/components/tools-settings-section.tsx",
    "server/media/threadmark-ai-images.ts",
    "server/evals/threadmark-ai-eval.ts",
    "server/agent/investigation-worker.ts",
    "server/agent/investigation-pack-service.ts",
    "server/agent/codex-runner.ts",
    "server/agent/provider-router.ts",
    "server/agent/provider-settings.ts",
    "server/agent/tool-bridge.ts",
    "server/agent/tool-mcp-server.ts",
    "server/tools/deep-tool-executor.ts",
    "server/tools/local-tool-service.ts",
  ];
  for (const file of removed) {
    await assert.rejects(access(new URL(`../${file}`, import.meta.url)), { code: "ENOENT" }, file);
  }
  const [api, daemon, cli, contracts, pkg] = await Promise.all([
    source("server/index.ts"), source("server/daemon.ts"), source("server/cli.ts"),
    source("shared/contracts.ts"), source("package.json"),
  ]);
  assert.doesNotMatch(api, /["'`]\/api\/(?:threadmark-ai|investigation-threads|investigation-packs|tools|ai\/connections)/);
  assert.doesNotMatch(daemon + cli, /InvestigationWorker|CodexSupportAgent|ConfiguredSupportAgent|DeepToolExecutor|agent:once/);
  assert.doesNotMatch(contracts, /ThreadmarkAi|InvestigationPackDto|LocalToolDto/);
  assert.doesNotMatch(pkg, /eval:threadmark-ai|eval:prompts|@modelcontextprotocol\/server/);
  assert.match(daemon, /TriageAiScheduler/);
  assert.match(daemon, /AudioTranscriptionService/);
  assert.match(cli, /triage-\*/);
});

test("migrações históricas permanecem compatíveis sem descartar dados legados", async () => {
  const schema = await source("server/db/schema.ts");
  assert.match(schema, /name: "threadmark_ai_user_ownership"/);
  assert.match(schema, /name: "threadmark_ai_models_by_workload"/);
  // A remoção de código não autoriza apagar conversas, anexos ou tickets antigos.
  assert.doesNotMatch(schema, /DROP TABLE(?: IF EXISTS)? threadmark_ai_ticket_drafts/);
});
