import {
  categoryCreationFacets,
  categoryDisplayOrder,
} from "../../../lib/category-facets.js";
import type {
  CategoryFacetType,
  TicketCategory,
  TicketSummary,
} from "../../../lib/types.js";

export type KanbanCategoryFilters = Partial<Record<CategoryFacetType, string>>;

export const KANBAN_CATEGORY_FILTER_ALL = "all";
export const KANBAN_CATEGORY_FILTER_NONE = "none";

export function hasKanbanCategoryFilters(
  filters: KanbanCategoryFilters,
): boolean {
  return Object.values(filters).some(
    (value) => Boolean(value) && value !== KANBAN_CATEGORY_FILTER_ALL,
  );
}

export function matchesKanbanCategoryFilters(
  ticket: TicketSummary,
  filters: KanbanCategoryFilters,
): boolean {
  return (Object.entries(filters) as [
    CategoryFacetType,
    string | undefined,
  ][]).every(([facet, value]) => {
    if (!value || value === KANBAN_CATEGORY_FILTER_ALL) return true;
    if (value === KANBAN_CATEGORY_FILTER_NONE) {
      return !ticket.categories.some((category) => category.facet === facet);
    }
    return ticket.categories.some((category) => category.id === value);
  });
}

export function getVisibleKanbanFilterFacets(
  categories: TicketCategory[],
): CategoryFacetType[] {
  const availableFacets = new Set(categories.map((category) => category.facet));
  return categoryDisplayOrder.filter(
    (facet) => categoryCreationFacets.includes(facet) || availableFacets.has(facet),
  );
}

export function getKanbanFilterOptions(
  categories: TicketCategory[],
  facet: CategoryFacetType,
): TicketCategory[] {
  return categories
    .filter((category) => category.facet === facet)
    .toSorted((left, right) => left.label.localeCompare(right.label, "pt-BR"));
}
