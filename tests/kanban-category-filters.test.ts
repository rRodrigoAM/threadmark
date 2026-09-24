import assert from "node:assert/strict";
import test from "node:test";
import { readFrontendFile as readFile } from "./helpers/frontend-source.js";
import type { TicketCategory, TicketSummary } from "../app/lib/types.js";

import {
  getKanbanFilterOptions,
  getVisibleKanbanFilterFacets,
  hasKanbanCategoryFilters,
  matchesKanbanCategoryFilters,
} from "../app/features/kanban/domain/kanban-category-filters.js";

function category(
  id: string,
  facet: "reason" | "platform",
  label: string,
): TicketCategory {
  return { id, facet, slug: id, label, color: null };
}

function ticket(categories: TicketCategory[]): TicketSummary {
  return { categories } as TicketSummary;
}

test("Kanban filtra tickets pela categoria selecionada em cada faceta", () => {
  const billing = category("cat-billing", "reason", "Cobrança");
  const shopify = category("cat-shopify", "platform", "Shopify");
  const item = ticket([billing, shopify]);

  assert.equal(matchesKanbanCategoryFilters(item, {}), true);
  assert.equal(
    matchesKanbanCategoryFilters(item, { reason: "cat-billing" }),
    true,
  );
  assert.equal(
    matchesKanbanCategoryFilters(item, { platform: "cat-shopify" }),
    true,
  );
  assert.equal(
    matchesKanbanCategoryFilters(item, { reason: "cat-other" }),
    false,
  );
  assert.equal(matchesKanbanCategoryFilters(item, { symptom: "none" }), true);
  assert.equal(matchesKanbanCategoryFilters(ticket([]), { reason: "none" }), true);
  assert.equal(matchesKanbanCategoryFilters(item, { reason: "all" }), true);
});

test("Kanban sempre expõe facetas principais e inclui demais facetas com categorias", () => {
  const categories = [
    category("cat-shopify", "platform", "Shopify"),
    category("cat-nuvemshop", "platform", "Nuvemshop"),
    category("cat-billing", "reason", "Cobrança"),
  ];

  assert.deepEqual(getVisibleKanbanFilterFacets(categories), [
    "reason",
    "symptom",
    "product",
    "platform",
  ]);
  assert.deepEqual(getVisibleKanbanFilterFacets([]), [
    "reason",
    "symptom",
    "product",
    "platform",
  ]);
  assert.equal(
    hasKanbanCategoryFilters({ reason: "all", platform: "all" }),
    false,
  );
  assert.equal(hasKanbanCategoryFilters({ reason: "cat-billing" }), true);
  assert.deepEqual(
    getKanbanFilterOptions(categories, "platform").map((item) => item.label),
    ["Nuvemshop", "Shopify"],
  );
});

test("barra do Kanban integra filtros de responsável e categorias", async () => {
  const [view, app] = await Promise.all([
    readFile(
      new URL(
        "../app/features/kanban/components/kanban-view.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/support-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(view, /aria-label="Filtrar tickets por responsável"/);
  assert.match(
    view,
    /aria-label=\{`Filtrar tickets por \$\{categoryFacetLabels\[facet\]\}`\}/,
  );
  assert.match(
    view,
    /Todos os \{categoryFacetLabels\[facet\]\.toLowerCase\(\)\}s/,
  );
  assert.match(view, /Sem \{categoryFacetLabels\[facet\]\.toLowerCase\(\)\}/);
  assert.match(view, /value="none"/);
  assert.match(view, /matchesCategories\(ticket\)/);
  assert.match(view, /Limpar filtros do Kanban/);
  assert.match(view, /setCategoryFilters\(\{\}\)/);
  assert.match(app, /categories=\{categoryCatalog\}/);
});
