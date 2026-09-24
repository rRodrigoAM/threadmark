import assert from "node:assert/strict";
import test from "node:test";
import { readFrontendFile as readFile } from "./helpers/frontend-source.js";

import { getNextKanbanTab } from "../app/lib/kanban-tabs.js";
import { getArchivedTicketOrigin } from "../app/lib/archived-ticket-origin.js";

test("arquivado mantém a origem visível mesmo com uma API ainda no contrato anterior", () => {
  assert.equal(
    getArchivedTicketOrigin({ archivedFromStatus: "cancelled", resolvedAt: null }),
    "cancelled",
  );
  assert.equal(
    getArchivedTicketOrigin({ archivedFromStatus: "resolved", resolvedAt: null }),
    "resolved",
  );
  assert.equal(
    getArchivedTicketOrigin({ resolvedAt: "2026-08-23T18:55:25.724Z" }),
    "resolved",
  );
  assert.equal(getArchivedTicketOrigin({ resolvedAt: null }), "cancelled");
});

test("card arquivado mantém o horário em uma linha própria alinhada à esquerda", async () => {
  const card = await readFile(
    new URL("../app/features/kanban/components/kanban-card.tsx", import.meta.url),
    "utf8",
  );

  assert.match(card, /archived\s*\?\s*"basis-full justify-start text-left"/);
  assert.match(card, /:\s*"ml-auto justify-end text-right"/);
});

test("Kanban separa tickets ativos dos arquivados sem contaminar a carga global", async () => {
  const [api, view] = await Promise.all([
    readFile(new URL("../app/lib/api.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/features/kanban/components/kanban-view.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(api, /const limit = 200/);
  assert.match(api, /offset \+= result\.items\.length/);
  assert.match(api, /offset >= result\.total/);
  assert.match(api, /status:\s*"archived"/);
  assert.match(api, /includeArchived:\s*"true"/);
  assert.match(api, /order:\s*"archived_desc"/);
  assert.match(api, /if \(query\) params\.set\("q", query\)/);
  assert.match(api, /offset:\s*String\(options\.offset \?\? 0\)/);
  assert.match(api, /status:\s*"resolved"/);
  assert.match(api, /order:\s*"resolved_desc"/);
  assert.match(view, /const KANBAN_PAGE_SIZE = 5/);
  assert.match(view, /getResolvedTickets\(\{/);
  assert.match(view, /resolvedTickets\.length < resolvedTotal/);
  assert.match(view, /visibleColumnTickets/);
  assert.match(view, /Carregar mais \(\$\{visibleColumnTickets\.length\} de \$\{columnTotal\}\)/);
  assert.match(
    view,
    /nextMode === "archived"[\s\S]*!archivedLoaded \|\| archivedQueryRef\.current !== query\.trim\(\)[\s\S]*void loadArchived\(true, query\)/,
  );
  assert.match(view, /archivedTickets\.length < archivedTotal/);
  assert.match(view, /Carregar mais \(\$\{visibleArchivedTickets\.length\} de \$\{archivedTotal\}\)/);
  assert.match(view, /limit: normalizedQuery \? 200 : KANBAN_PAGE_SIZE/);
  assert.match(view, /void loadArchived\(true, nextQuery\)/);
  assert.match(view, /Pesquisando em todos os arquivados/);
  assert.match(view, /em todos os tickets arquivados/);
  assert.match(view, /label: "Cancelados"/);
  assert.match(view, /statuses: \["cancelled"\]/);
  assert.doesNotMatch(view, /visibleCancelledTickets/);
});

test("Kanban pesquisa cards por título, grupo ou solicitante em cada visão", async () => {
  const [view, search, css] = await Promise.all([
    readFile(new URL("../app/features/kanban/components/kanban-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/ticket-search.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(view, /aria-label="Pesquisar cards por título, grupo ou solicitante"/);
  assert.match(view, /placeholder="Pesquisar por título, grupo ou solicitante"/);
  assert.match(view, /aria-label="Limpar pesquisa do Kanban"/);
  assert.match(view, /matchesTicketSearch\(ticket, query\)/);
  assert.match(view, /filteredActiveTickets/);
  assert.match(view, /filteredResolvedTickets/);
  assert.match(view, /filteredArchivedTickets/);
  assert.match(view, /function updateQuery\(nextQuery: string\)/);
  assert.doesNotMatch(view, /setSelectedIds\(new Set\(\)\)/);
  assert.match(view, /Nenhum resultado nesta coluna/);
  assert.match(view, /Nenhum card encontrado/);
  assert.match(search, /ticket\.title/);
  assert.match(search, /ticket\.client\.name/);
  assert.match(view, /w-full min-w-0 items-center/);
  assert.match(view, /sm:min-w-72 sm:flex-1/);
  assert.doesNotMatch(css, /\.kanban-search/);
});

test("Kanban remove seleção em lote sem deixar código morto e mantém API compatível", async () => {
  const [api, app, view] = await Promise.all([
    readFile(new URL("../app/lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/support-app.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/features/kanban/components/kanban-view.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(view, /role="tablist"/);
  assert.match(view, /role="tabpanel"/);
  assert.match(view, /Nenhum dado foi excluído|sem excluir mensagens/);
  assert.doesNotMatch(view, /deleteTicket|Excluir permanentemente|Deletar/);
  assert.doesNotMatch(view, /Selecionar encerrados|Selecionar para restaurar|Selecionar todos os visíveis/);
  assert.doesNotMatch(view, /selectionMode|selectedIds|bulkBusy|bulkError|selectionNotice/);
  assert.doesNotMatch(view, /KANBAN_BULK_SELECTION_LIMIT|kanban-selection/);
  assert.doesNotMatch(app, /onBulkStatusChange|handleBulkTicketStatusChange/);
  assert.doesNotMatch(api, /bulkUpdateTicketStatus/);
});

test("navegação das tabs segue o padrão ARIA com setas, Home e End", () => {
  assert.equal(getNextKanbanTab("active", "ArrowRight"), "archived");
  assert.equal(getNextKanbanTab("archived", "ArrowRight"), "active");
  assert.equal(getNextKanbanTab("active", "ArrowLeft"), "archived");
  assert.equal(getNextKanbanTab("archived", "ArrowLeft"), "active");
  assert.equal(getNextKanbanTab("archived", "Home"), "active");
  assert.equal(getNextKanbanTab("active", "End"), "archived");
  assert.equal(getNextKanbanTab("active", "Enter"), null);
});

test("coluna de Resolvidos mantém snapshot e paginação própria coerentes", async () => {
  const view = await readFile(
    new URL("../app/features/kanban/components/kanban-view.tsx", import.meta.url),
    "utf8",
  );

  assert.match(view, /void loadResolved\(true\)/);
  assert.match(view, /void loadResolved\(false\)/);
  assert.match(view, /resolvedRequestRef\.current !== requestId/);
  assert.match(view, /ticketStatusSnapshotRef/);
  assert.match(view, /const newlyResolved = tickets\.filter/);
  assert.match(view, /const reopenedIds = new Set/);
  assert.match(view, /loading \|\| resolvedLoaded \|\| resolvedLoading/);
});

test("Arquivados invalida páginas antigas e bloqueia operações durante recarga", async () => {
  const view = await readFile(
    new URL("../app/features/kanban/components/kanban-view.tsx", import.meta.url),
    "utf8",
  );

  assert.match(view, /const archivedRequestRef = useRef\(0\)/);
  assert.match(view, /archivedRequestRef\.current !== requestId/);
  assert.match(view, /void loadArchived\(true\)/);
  assert.match(view, /disabled=\{archivedLoading\}/);
});

test("tabs do Kanban têm roving tabindex e acionam navegação por teclado", async () => {
  const view = await readFile(
    new URL("../app/features/kanban/components/kanban-view.tsx", import.meta.url),
    "utf8",
  );

  assert.match(view, /tabIndex=\{mode === "active" \? 0 : -1\}/);
  assert.match(view, /tabIndex=\{mode === "archived" \? 0 : -1\}/);
  assert.match(view, /onKeyDown=\{\(event\) => handleTabKeyDown\(event, "active"\)\}/);
  assert.match(view, /onKeyDown=\{\(event\) => handleTabKeyDown\(event, "archived"\)\}/);
  assert.match(view, /event\.preventDefault\(\)/);
  assert.match(view, /\.current\?\.focus\(\)/);
});

test("Kanban ordena e identifica resolvidos e arquivados pelas datas corretas", async () => {
  const view = await readFile(
    new URL("../app/features/kanban/components/kanban-view.tsx", import.meta.url),
    "utf8",
  );

  assert.match(view, /ticket\.archivedAt \?\? ticket\.updatedAt/);
  assert.match(view, /ticket\.resolvedAt \?\? ticket\.updatedAt/);
  assert.match(view, /return `Arquivado \$\{relative\}`/);
  assert.match(view, /return `Resolvido \$\{relative\}`/);
  assert.match(view, /return `Cancelado \$\{relative\}`/);
  assert.match(
    view,
    /sortTickets\([\s\S]*new Date\(getKanbanTicketTimestamp\(right/,
  );
});

test("detalhe aberto de um arquivado permite restaurar o ticket", async () => {
  const [detail, statusPill] = await Promise.all([
    readFile(
      new URL("../app/features/tickets/components/ticket-detail.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/shared/status-pill.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(detail, /ticket\.status === "archived" \? \(/);
  assert.match(detail, /onClick=\{\(\) => onStatusChange\("resolved"\)\}/);
  assert.match(detail, /Restaurar ticket/);
  assert.match(detail, /ArchiveRestore/);
  assert.match(detail, /ticket\.status !== "resolved" && ticket\.status !== "cancelled" && ticket\.status !== "archived"/);
  assert.doesNotMatch(detail, /Status arquivado, restaure pelo Kanban/);
  assert.match(statusPill, /archived/);
  assert.match(statusPill, /archived: "bg-muted text-muted-foreground"/);
});

test("controles e grade de arquivados se adaptam a telas estreitas", async () => {
  const [view, card, css] = await Promise.all([
    readFile(new URL("../app/features/kanban/components/kanban-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/kanban/components/kanban-card.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(view, /flex min-w-0 flex-wrap items-center gap-2/);
  assert.match(view, /grid-cols-\[repeat\(auto-fill,minmax\(245px,1fr\)\)\]/);
  assert.match(view, /grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5/);
  assert.doesNotMatch(view, /min-w-\[920px\]/);
  assert.doesNotMatch(card, /selected && "border-primary\/70 bg-primary\/5 ring-2 ring-primary\/10"/);
  assert.match(card, /focus-visible:ring-2 focus-visible:ring-primary\/35/);
  assert.doesNotMatch(css, /\.kanban-/);
});
