import assert from "node:assert/strict";
import test from "node:test";

import { createDatabase } from "../server/db/index.js";
import { SupportStore } from "../server/domain/support-store.js";
import { createTestApiApp } from "../server/index.js";

test("API importa mensagens externas como mensagens do ticket de forma idempotente", async () => {
  const database = createDatabase(":memory:");
  try {
    const store = new SupportStore(database);
    const account = store.upsertAccount({
      phoneNumber: "+5500000000000",
      displayName: "Conta de teste",
    });
    const client = store.upsertClient({
      name: "Santo Luk",
      slug: "santo-luk-external-import",
      kind: "ecommerce",
    });
    const group = store.upsertGroup({
      accountId: account.id,
      clientId: client.id,
      externalJid: "external-import@g.us",
      subject: "Adstart interno / produto",
    });
    const ticket = store.createManualTicket({
      clientRequestId: "external-import-ticket",
      groupId: group.id,
      title: "Configurar e-commerce",
      summary: "Conversa originada no Intercom.",
      priority: "normal",
    });
    const numberLookup = store.listTickets({
      query: String(ticket.number),
      includeArchived: true,
    });
    assert.deepEqual(numberLookup.items.map((item) => item.id), [ticket.id]);
    const app = createTestApiApp(store);
    const numberResponse = await app.request(`/api/tickets/by-number/${ticket.number}`);
    assert.equal(numberResponse.status, 200);
    const numberPayload = (await numberResponse.json()) as { id: string; number: number };
    assert.deepEqual(numberPayload, { id: ticket.id, number: ticket.number });
    const input = {
      sourceType: "intercom_conversation",
      sourceConversationId: "215475831157843",
      messages: [
        {
          id: "53434216678",
          author: "Robson Da Silva",
          authorRole: "customer",
          body: "Bom dia, gostaria de ajuda para configurar meu ecommerce.",
          occurredAt: "2026-09-08T12:35:01.000Z",
        },
        {
          id: "53434401009",
          author: "Rodrigo",
          authorRole: "support",
          body: "Olá, tudo bem?",
          occurredAt: "2026-09-08T12:37:41.000Z",
        },
      ],
    };

    const firstResponse = await app.request(`/api/tickets/${ticket.id}/external-messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-threadmark-actor-id": "operator-weslem",
        "x-threadmark-agent-client": "hermes",
      },
      body: JSON.stringify(input),
    });
    assert.equal(firstResponse.status, 200);
    const firstPayload = (await firstResponse.json()) as {
      importedCount: number;
      ticket: {
        id: string;
        messageCount: number;
        firstMessageAt: string;
        lastMessageAt: string;
        updatedAt: string;
      };
    };
    assert.equal(firstPayload.importedCount, 2);
    assert.equal(firstPayload.ticket.id, ticket.id);
    assert.equal(firstPayload.ticket.messageCount, 2);

    const duplicateInput = {
      ...input,
      messages: input.messages.map((message, index) => ({
        ...message,
        body: `Conteúdo alterado ${index}`,
        occurredAt: index === 0 ? "2020-01-01T00:00:00.000Z" : "2030-01-01T00:00:00.000Z",
      })),
    };
    const duplicateResponse = await app.request(
      `/api/tickets/${ticket.id}/external-messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-threadmark-actor-id": "operator-weslem",
          "x-threadmark-agent-client": "hermes",
        },
        body: JSON.stringify(duplicateInput),
      },
    );
    assert.equal(duplicateResponse.status, 200);
    const duplicatePayload = (await duplicateResponse.json()) as {
      importedCount: number;
      ticket: {
        messageCount: number;
        firstMessageAt: string;
        lastMessageAt: string;
        updatedAt: string;
      };
    };
    assert.equal(duplicatePayload.importedCount, 0);
    assert.equal(duplicatePayload.ticket.messageCount, 2);
    assert.deepEqual(
      {
        firstMessageAt: duplicatePayload.ticket.firstMessageAt,
        lastMessageAt: duplicatePayload.ticket.lastMessageAt,
        updatedAt: duplicatePayload.ticket.updatedAt,
      },
      {
        firstMessageAt: firstPayload.ticket.firstMessageAt,
        lastMessageAt: firstPayload.ticket.lastMessageAt,
        updatedAt: firstPayload.ticket.updatedAt,
      },
    );

    const detail = store.getTicketDetail(ticket.id);
    const messages = detail.timeline.filter((item) => item.type === "message");
    assert.deepEqual(
      messages.map((message) => ({
        externalId: message.externalId,
        author: message.sender.displayName,
        isStaff: message.sender.isStaff,
        text: message.text,
      })),
      [
        {
          externalId: "53434216678",
          author: "Robson Da Silva",
          isStaff: false,
          text: "Bom dia, gostaria de ajuda para configurar meu ecommerce.",
        },
        {
          externalId: "53434401009",
          author: "Rodrigo",
          isStaff: true,
          text: "Olá, tudo bem?",
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("importação externa normaliza timestamps para UTC antes de ordenar", () => {
  const database = createDatabase(":memory:");
  try {
    const store = new SupportStore(database);
    const account = store.upsertAccount({
      phoneNumber: "+550****0001",
      displayName: "Conta UTC",
    });
    const client = store.upsertClient({
      name: "Cliente UTC",
      slug: "cliente-utc-external-import",
      kind: "ecommerce",
    });
    const group = store.upsertGroup({
      accountId: account.id,
      clientId: client.id,
      externalJid: "external-import-utc@g.us",
      subject: "Grupo UTC",
    });
    const ticket = store.createManualTicket({
      clientRequestId: "external-import-ticket-utc",
      groupId: group.id,
      title: "Ordenar mensagens por instante",
      summary: "Timestamps com offsets diferentes.",
      priority: "normal",
    });

    store.importExternalSourceMessagesToTicket(ticket.id, {
      sourceType: "intercom_conversation",
      sourceConversationId: "utc-ordering",
      actor: "operator-weslem",
      messages: [
        {
          id: "later",
          author: "Suporte",
          authorRole: "support",
          body: "Instante posterior",
          occurredAt: "2026-09-08T12:00:00.000Z",
        },
        {
          id: "earlier-with-offset",
          author: "Cliente",
          authorRole: "customer",
          body: "Instante anterior",
          occurredAt: "2026-09-08T13:00:00.000+02:00",
        },
      ],
    });

    const messages = store
      .getTicketDetail(ticket.id)
      .timeline.filter((item) => item.type === "message");
    assert.deepEqual(
      messages.map((message) => ({
        id: message.externalId,
        occurredAt: message.occurredAt,
      })),
      [
        {
          id: "earlier-with-offset",
          occurredAt: "2026-09-08T11:00:00.000Z",
        },
        {
          id: "later",
          occurredAt: "2026-09-08T12:00:00.000Z",
        },
      ],
    );
  } finally {
    database.close();
  }
});
