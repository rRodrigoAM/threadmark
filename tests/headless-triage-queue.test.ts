import assert from "node:assert/strict";
import test from "node:test";

import type { TriageAnalysis } from "../server/agent/types.js";
import { createDatabase, type SupportDatabase } from "../server/db/index.js";
import { SupportStore } from "../server/domain/index.js";
import { TriageAiScheduler } from "../server/triage/index.js";

interface Fixture {
  database: SupportDatabase;
  store: SupportStore;
  groupId: string;
  customerId: string;
}

function fixture(): Fixture {
  const database = createDatabase(":memory:");
  const store = new SupportStore(database);
  const account = store.upsertAccount({
    id: "headless-triage-account",
    phoneNumber: "+554****1000",
    displayName: "Conta de triagem",
  });
  const client = store.upsertClient({
    id: "headless-triage-client",
    name: "Cliente de triagem",
    slug: "cliente-de-triagem-headless",
    kind: "ecommerce",
  });
  const group = store.upsertGroup({
    id: "headless-triage-group",
    accountId: account.id,
    clientId: client.id,
    externalJid: "120363001000@g.us",
    subject: "Conta + Cliente de triagem",
  });
  const customer = store.upsertParticipant({
    id: "headless-triage-customer",
    externalJid: "5511999991000@s.whatsapp.net",
    phoneE164: "+551****1000",
    displayName: "Pessoa cliente",
  });
  store.addGroupParticipant(group.id, customer.id);
  store.initializeTriageAiSettings({
    enabled: true,
    model: "hermes-triage-test",
    actor: "teste",
  });
  return { database, store, groupId: group.id, customerId: customer.id };
}

function addMessage(
  current: Fixture,
  id: string,
  occurredAt: string,
  text: string,
): string {
  return current.store.upsertMessage({
    id,
    externalId: `external-${id}`,
    providerMessageId: `provider-${id}`,
    groupId: current.groupId,
    senderId: current.customerId,
    occurredAt,
    text,
    messageType: "conversation",
    triageKind: "unclassified",
    triageState: "unreviewed",
    ingestionSource: "realtime_notify",
  }).id;
}

function analysis(messageIds: string[]): TriageAnalysis {
  return {
    groups: [{
      messageIds,
      kind: "demand",
      suggestedAction: "create",
      relatedTicketId: null,
      relatedSuggestionId: null,
      title: "Pedidos ausentes no dashboard",
      summary: "A conversa relata que os pedidos não aparecem no dashboard.",
      priority: "high",
      affectedEcommerce: null,
      categories: {
        contactReason: ["Problema"],
        productArea: ["Dashboard"],
        platform: [],
        symptom: ["Pedidos ausentes"],
      },
      reason: "As mensagens descrevem uma demanda operacional verificável.",
      confidence: 0.94,
    }],
  };
}

function rowCount(database: SupportDatabase, table: string): number {
  return (
    database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
  ).count;
}

test("fila headless agenda, deduplica, concede lease e registra sugestão do Hermes", () => {
  const current = fixture();
  try {
    const first = addMessage(
      current,
      "headless-first",
      "2026-09-02T12:00:00.000Z",
      "Os pedidos não aparecem no dashboard.",
    );
    const second = addMessage(
      current,
      "headless-second",
      "2026-09-02T12:00:30.000Z",
      "A loja afetada continua sem sincronizar.",
    );
    const scheduler = new TriageAiScheduler(current.store, { quietPeriodMs: 0 });

    assert.equal(scheduler.scheduleBatch("hermes-triage-test"), 1);
    assert.equal(scheduler.scheduleBatch("hermes-triage-test"), 0);
    assert.equal(rowCount(current.database, "triage_ai_jobs"), 1);
    assert.equal(rowCount(current.database, "triage_ai_job_messages"), 2);
    assert.equal(rowCount(current.database, "investigation_jobs"), 0);

    const claimed = current.store.claimNextTriageAiJob(60_000);
    assert.ok(claimed);
    if (!claimed) throw new Error("job de triagem headless não foi reivindicado");
    assert.equal(claimed.groupId, current.groupId);
    assert.equal(current.store.claimNextTriageAiJob(60_000), null);
    assert.equal(current.store.renewTriageAiJobLease(claimed.id, 60_000), true);
    assert.deepEqual(
      current.store.getTriageAiJobInput(claimed.id).candidateMessageIds,
      [first, second],
    );

    assert.equal(
      current.store.completeTriageAiJob(claimed.id, analysis([first, second]), {
        actor: "Hermes · Pessoa Operadora",
        model: "hermes-triage-test",
        allowAutoAttach: false,
      }),
      1,
    );
    assert.deepEqual(current.store.getTriageAiQueueStatus(), {
      queued: 0,
      running: 0,
      revision: null,
    });
    assert.deepEqual(
      current.database
        .prepare(
          `SELECT actor, event_type
           FROM triage_block_events
           WHERE event_type = 'suggestion_recorded'`,
        )
        .get(),
      { actor: "Hermes · Pessoa Operadora", event_type: "suggestion_recorded" },
    );
    assert.deepEqual(
      current.database
        .prepare("SELECT state, attempt_count FROM triage_ai_jobs WHERE id = ?")
        .get(claimed.id),
      { state: "completed", attempt_count: 1 },
    );
  } finally {
    current.database.close();
  }
});

test("novo contexto invalida job headless antigo antes de outra execução", () => {
  const current = fixture();
  try {
    const first = addMessage(
      current,
      "headless-stale-first",
      "2026-09-03T12:00:00.000Z",
      "O dashboard não carrega os pedidos.",
    );
    const scheduler = new TriageAiScheduler(current.store, { quietPeriodMs: 0 });
    assert.equal(scheduler.scheduleBatch("hermes-triage-test"), 1);
    const claimed = current.store.claimNextTriageAiJob(60_000);
    assert.ok(claimed);
    if (!claimed) throw new Error("job de triagem headless não foi reivindicado");

    const second = addMessage(
      current,
      "headless-stale-second",
      "2026-09-03T12:01:00.000Z",
      "A loja afetada é a Loja Exemplo Ômega.",
    );

    assert.deepEqual(
      current.database
        .prepare("SELECT state, error FROM triage_ai_jobs WHERE id = ?")
        .get(claimed.id),
      {
        state: "failed",
        error: "Nova mensagem recebida; contexto reagendado",
      },
    );
    assert.deepEqual(
      current.store.listTriageCandidates().map((candidate) => candidate.id),
      [first, second],
    );
    assert.equal(scheduler.scheduleBatch("hermes-triage-test"), 1);
    assert.equal(rowCount(current.database, "investigation_jobs"), 0);
  } finally {
    current.database.close();
  }
});
