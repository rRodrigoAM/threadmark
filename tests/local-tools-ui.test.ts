import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("configurações delegam IA e ferramentas ao Hermes sem API legada ativa", async () => {
  const [settings, app, navigation, client, api, sidebar, automations] = await Promise.all([
    readFile(new URL("../app/features/settings/components/settings-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/support-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/navigation.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/settings.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/layout/sidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/automations/components/automations-view.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(settings, /id: "tools", label: "Ferramentas"/);
  assert.doesNotMatch(settings, /id: "ai", label: "IA"/);
  assert.doesNotMatch(settings, /<ToolsSettingsSection|<AiSection/);

  assert.match(app, /initialTab=\{settingsInitialTab\}/);
  assert.match(app, /onTabChange=\{openSettingsTab\}/);
  assert.doesNotMatch(app, /<ThreadmarkAi|queueTicketDocumentation|onGenerateDocumentation=/);
  assert.doesNotMatch(sidebar, /Documentações/);
  assert.doesNotMatch(automations, /ConnectedAppsPanel|Apps conectados|createConnectedApp/);
  assert.match(automations, /Fluxos internos/);
  assert.match(navigation, /"tools"/);
  assert.match(navigation, /if \(value === "team"\) return "staff"/);
  assert.match(navigation, /value === "ai" \|\| value === "tools"/);
  assert.doesNotMatch(client, /\/api\/tools/);
  assert.doesNotMatch(api, /["']\/api\/tools/);
  assert.doesNotMatch(client, /\/api\/tools\/legacy-candidates/);
  assert.doesNotMatch(client, /\/api\/tools\/legacy-import/);
  assert.match(api, /requireRole\(context, \["owner", "admin"\]\)/);
});
