import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  categoryCreationFacets,
  isCategoryFacetVisible,
} from "../app/lib/category-facets.js";

test("catálogo oferece apenas facetas operacionais para novas categorias", () => {
  assert.deepEqual(categoryCreationFacets, [
    "reason",
    "product",
    "platform",
    "symptom",
  ]);
});

test("facetas legadas vazias somem sem esconder dados já cadastrados", () => {
  assert.equal(isCategoryFacetVisible("reason", 0), true);
  assert.equal(isCategoryFacetVisible("root_cause", 0), false);
  assert.equal(isCategoryFacetVisible("resolution", 0), false);
  assert.equal(isCategoryFacetVisible("root_cause", 1), true);
  assert.equal(isCategoryFacetVisible("resolution", 1), true);
});

test("catálogo resume o uso histórico e destaca categorias sem vínculos", async () => {
  const view = await readFile(
    new URL("../app/features/categories/components/categories-view.tsx", import.meta.url),
    "utf8",
  );

  assert.match(view, /Mais usadas nos tickets/);
  assert.match(view, /Vínculos acumulados em todo o histórico/);
  assert.match(view, /right\.ticketCount - left\.ticketCount/);
  assert.match(view, /Facetas com uso/);
  assert.match(view, /Ainda não há categorias em tickets/);
  assert.doesNotMatch(view, /Assuntos dos tickets criados no período/);
});

test("catálogo ocupa a coluna principal e pagina categorias para caber na tela", async () => {
  const view = await readFile(
    new URL("../app/features/categories/components/categories-view.tsx", import.meta.url),
    "utf8",
  );

  assert.match(view, /const CATEGORY_PAGE_SIZE = 14/);
  assert.match(view, /visibleCategoryCount > CATEGORY_PAGE_SIZE/);
  assert.match(view, /xl:col-start-1 xl:row-start-2/);
  assert.match(view, /xl:col-start-2 xl:row-start-2/);
  assert.match(view, /order-1 min-w-0 gap-4 border-primary/);
  assert.match(view, /Paginação do catálogo de categorias/);
  assert.match(view, /Página \{currentCategoryPage\} de \{totalCategoryPages\}/);
});
