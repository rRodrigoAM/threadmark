import { ArrowRightLeft, BarChart3, ChevronLeft, ChevronRight, CircleDot, Layers3, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { getCategoryName } from "@/app/lib/format";
import { type CategoryFacetType, type TicketCategoryCatalog } from "@/app/lib/types";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Combobox } from "@/app/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { EmptyState, LoadingState } from "@/app/components/shared/ui-states";
import {
  categoryDisplayOrder,
  categoryFacetLabels,
} from "@/app/lib/category-facets";

function createFacetBuckets() {
  return {
    reason: [],
    product: [],
    platform: [],
    symptom: [],
    root_cause: [],
    resolution: [],
  } as Record<CategoryFacetType, TicketCategoryCatalog[]>;
}

const CATEGORY_PAGE_SIZE = 14;

export function CategoriesView({
  categories,
  loading,
  onCreate,
  onUpdate,
  onDelete,
}: {
  categories: TicketCategoryCatalog[];
  loading: boolean;
  onCreate: (input: {
    facet: CategoryFacetType;
    label: string;
    color?: string;
  }) => Promise<unknown>;
  onUpdate: (categoryId: string, input: {
    facet: CategoryFacetType;
    label: string;
    color?: string | null;
  }) => Promise<unknown>;
  onDelete: (categoryId: string, replacementCategoryId?: string) => Promise<unknown>;
}) {
  const [selectedFacet, setSelectedFacet] = useState<CategoryFacetType | "all">("all");
  const [categoryPage, setCategoryPage] = useState(1);
  const [newCategoryFacet, setNewCategoryFacet] = useState<CategoryFacetType>("reason");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("");
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [categoryToEdit, setCategoryToEdit] = useState<TicketCategoryCatalog | null>(null);
  const [editFacet, setEditFacet] = useState<CategoryFacetType>("reason");
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<TicketCategoryCatalog | null>(null);
  const [replacementCategoryId, setReplacementCategoryId] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const categoriesByFacet = useMemo(() => {
    const buckets = createFacetBuckets();
    for (const category of categories) {
      buckets[category.facet].push(category);
    }
    return buckets;
  }, [categories]);

  const totalTicketBindings = useMemo(
    () => categories.reduce((sum, category) => sum + category.ticketCount, 0),
    [categories],
  );

  const unlinkedCount = useMemo(
    () => categories.filter((category) => category.ticketCount === 0).length,
    [categories],
  );

  const totalCatalog = categories.length;
  const mostUsedCategories = useMemo(
    () => categories
      .filter((category) => category.ticketCount > 0)
      .toSorted((left, right) =>
        right.ticketCount - left.ticketCount || left.label.localeCompare(right.label, "pt-BR"),
      )
      .slice(0, 5),
    [categories],
  );
  const mostUsedCount = mostUsedCategories[0]?.ticketCount ?? 0;
  const facetsInUse = useMemo(
    () => new Set(
      categories
        .filter((category) => category.ticketCount > 0)
        .map((category) => category.facet),
    ).size,
    [categories],
  );
  const visibleCategoryCount = selectedFacet === "all"
    ? totalCatalog
    : categoriesByFacet[selectedFacet].length;
  const orderedVisibleCategories = useMemo(() => {
    const filtered = selectedFacet === "all"
      ? categories
      : categories.filter((category) => category.facet === selectedFacet);
    return filtered.toSorted((left, right) =>
      categoryDisplayOrder.indexOf(left.facet) - categoryDisplayOrder.indexOf(right.facet) ||
      right.ticketCount - left.ticketCount ||
      left.label.localeCompare(right.label, "pt-BR"),
    );
  }, [categories, selectedFacet]);
  const totalCategoryPages = Math.max(1, Math.ceil(visibleCategoryCount / CATEGORY_PAGE_SIZE));
  const currentCategoryPage = Math.min(categoryPage, totalCategoryPages);
  const paginatedCategories = orderedVisibleCategories.slice(
    (currentCategoryPage - 1) * CATEGORY_PAGE_SIZE,
    currentCategoryPage * CATEGORY_PAGE_SIZE,
  );
  const visibleFacets = categoryDisplayOrder.filter((facetType) =>
    paginatedCategories.some((category) => category.facet === facetType),
  );
  const replacementOptions = useMemo(() => {
    if (!categoryToDelete) return [];
    return categories
      .filter(
        (category) =>
          category.id !== categoryToDelete.id &&
          category.facet === categoryToDelete.facet,
      )
      .sort((left, right) => left.label.localeCompare(right.label, "pt-BR"))
      .map((category) => ({
        value: category.id,
        label: getCategoryName(category),
        description: `${category.ticketCount} vínculo${category.ticketCount === 1 ? "" : "s"}`,
      }));
  }, [categories, categoryToDelete]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedLabel = label.trim();
    if (!normalizedLabel || isSubmitting) return;

    setIsSubmitting(true);
    setCreateError(null);
    try {
      await onCreate({
        facet: newCategoryFacet,
        label: normalizedLabel,
        color: color.trim() || undefined,
      });
      setLabel("");
      setColor("");
      setIsCreateFormOpen(false);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Não foi possível criar a categoria.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreateForm = () => {
    setNewCategoryFacet(selectedFacet === "all" ? "reason" : selectedFacet);
    setLabel("");
    setColor("");
    setCreateError(null);
    setIsCreateFormOpen(true);
  };

  const openEditDialog = (category: TicketCategoryCatalog) => {
    setCategoryToEdit(category);
    setEditFacet(category.facet);
    setEditLabel(category.label);
    setEditColor(category.color ?? "");
    setEditError(null);
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!categoryToEdit || !editLabel.trim() || isUpdating) return;
    setIsUpdating(true);
    setEditError(null);
    try {
      await onUpdate(categoryToEdit.id, {
        facet: editFacet,
        label: editLabel.trim(),
        color: editColor.trim() || null,
      });
      setCategoryToEdit(null);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Não foi possível atualizar a categoria.",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const confirmDelete = async () => {
    if (!categoryToDelete || isDeleting) return;
    if (categoryToDelete.ticketCount > 0 && !replacementCategoryId) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(categoryToDelete.id, replacementCategoryId || undefined);
      setCategoryToDelete(null);
      setReplacementCategoryId("");
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Não foi possível excluir a categoria.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) return <LoadingState label="Organizando taxonomia…" />;

  return (
    <div className="grid min-h-full min-w-0 content-start gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)] xl:items-start">
      <Card className="flex flex-col items-start gap-3 self-start rounded-xl border border-border bg-linear-to-br from-primary/10 via-card to-primary/5 p-4 text-foreground shadow-sm sm:flex-row sm:items-center xl:col-span-2" variant="unstyled">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
          <Layers3 size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Taxonomia multidimensional</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Crie o catálogo persistido no SQLite. Categorias de motivo, produto,
            plataforma e sintoma também ficam disponíveis para a IA classificar os
            tickets.
          </p>
        </div>
        <b className="whitespace-nowrap rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          {totalCatalog} categoria{totalCatalog === 1 ? "" : "s"} · {totalTicketBindings} vínculos
        </b>
      </Card>

      <section aria-label="Uso e revisão do catálogo" className="order-2 grid min-w-0 content-start gap-3 xl:order-none xl:col-start-2 xl:row-start-2">
        <Card className="order-2 min-w-0 gap-4 p-4 py-4 shadow-sm">
          <header className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-foreground">Mais usadas nos tickets</h3>
              <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">Vínculos acumulados em todo o histórico, comparados entre facetas.</p>
            </div>
            <b className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {totalTicketBindings} vínculo{totalTicketBindings === 1 ? "" : "s"}
            </b>
          </header>

          {mostUsedCategories.length ? (
            <ol aria-label="Categorias ordenadas por quantidade de tickets vinculados" className="grid list-none gap-3 p-0">
              {mostUsedCategories.map((category) => (
                <li className="grid min-w-0 gap-1.5" key={category.id}>
                  <div className="flex min-w-0 items-center gap-2">
                    <i aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" style={{ backgroundColor: category.color ?? undefined }} />
                    <strong className="min-w-0 truncate text-sm font-medium text-foreground" title={getCategoryName(category)}>{getCategoryName(category)}</strong>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{categoryFacetLabels[category.facet]}</span>
                    <b className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-foreground">
                      {category.ticketCount.toLocaleString("pt-BR")} <span className="font-normal text-muted-foreground">{category.ticketCount === 1 ? "ticket" : "tickets"}</span>
                    </b>
                  </div>
                  <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted/70">
                    <span
                      className="block h-full min-w-1 rounded-full bg-primary transition-[width] duration-300"
                      style={{
                        width: `${Math.max(8, (category.ticketCount / mostUsedCount) * 100)}%`,
                        backgroundColor: category.color ?? undefined,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5 text-center">
              <Tags aria-hidden="true" className="mb-2 text-muted-foreground" size={20} />
              <strong className="text-sm font-medium text-foreground">Ainda não há categorias em tickets</strong>
              <p className="mt-1 max-w-sm text-[13px] leading-5 text-muted-foreground">Quando a equipe classificar tickets, as categorias mais usadas aparecerão aqui.</p>
            </div>
          )}
        </Card>

        <Card className="order-1 min-w-0 gap-4 border-primary/15 bg-linear-to-br from-primary/13 via-card to-primary/[6.5%] p-4 py-4 shadow-sm">
          <header className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <CircleDot size={18} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Revisão do catálogo</h3>
              <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">Categorias ainda sem uso</p>
            </div>
          </header>
          <div className="flex min-w-0 items-end gap-3">
            <strong className="text-4xl font-semibold leading-none tracking-tight text-foreground">{unlinkedCount.toLocaleString("pt-BR")}</strong>
            <p className="pb-0.5 text-sm leading-5 text-muted-foreground">
              {totalCatalog === 0
                ? "Nenhuma categoria cadastrada ainda."
                : unlinkedCount === 0
                  ? "Todas as categorias já aparecem em tickets."
                  : `de ${totalCatalog} categoria${totalCatalog === 1 ? "" : "s"} sem vínculo com tickets.`}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2.5 text-[13px]">
            <span className="text-muted-foreground">Facetas com uso</span>
            <b className="font-semibold tabular-nums text-foreground">{facetsInUse} de {categoryDisplayOrder.length}</b>
          </div>
        </Card>
      </section>

      <Card className="order-1 min-w-0 gap-0 overflow-hidden py-0 shadow-sm xl:order-none xl:col-start-1 xl:row-start-2">
        <header className="flex min-w-0 flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Tags size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">Catálogo de categorias</h2>
            <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
              {visibleCategoryCount} categoria{visibleCategoryCount === 1 ? "" : "s"}
              {selectedFacet === "all" ? " em todas as facetas" : ` em ${categoryFacetLabels[selectedFacet]}`}
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:shrink-0">
            <Select
              onValueChange={(value) => {
                setSelectedFacet(value as CategoryFacetType | "all");
                setCategoryPage(1);
              }}
              value={selectedFacet}
            >
              <SelectTrigger aria-label="Filtrar categorias por faceta" className="h-9 min-w-0 flex-1 text-sm sm:w-48 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as facetas</SelectItem>
                {categoryDisplayOrder.map((facetType) => (
                  <SelectItem key={facetType} value={facetType}>{categoryFacetLabels[facetType]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="shrink-0 gap-1.5" onClick={openCreateForm} size="lg" type="button">
              <Plus size={15} /> Nova categoria
            </Button>
          </div>
        </header>

        {isCreateFormOpen ? (
          <form className="grid gap-3 border-b border-border bg-muted/20 px-4 py-4" onSubmit={submit}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Adicionar categoria</h3>
                <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">Escolha a faceta e defina como ela aparecerá nos tickets.</p>
              </div>
              <Button aria-label="Fechar criação de categoria" className="shrink-0" disabled={isSubmitting} onClick={() => setIsCreateFormOpen(false)} size="icon-xs" type="button" variant="ghost">
                <X />
              </Button>
            </div>
            <div className="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(150px,180px)_minmax(0,1fr)_88px_auto]">
              <label className="grid min-w-0 gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Faceta</span>
                <Select disabled={isSubmitting} onValueChange={(value) => setNewCategoryFacet(value as CategoryFacetType)} value={newCategoryFacet}>
                  <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categoryDisplayOrder.map((facetType) => (
                      <SelectItem key={facetType} value={facetType}>{categoryFacetLabels[facetType]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid min-w-0 gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Nome</span>
                <Input
                  autoFocus
                  className="h-9 text-sm"
                  disabled={isSubmitting}
                  maxLength={120}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Ex.: Meta Ads, Falha no checkout"
                  value={label}
                />
              </label>
              <label className="grid min-w-0 gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Cor</span>
                <Input
                  aria-label="Cor da nova categoria"
                  className="h-9 w-full min-w-0 cursor-pointer p-1"
                  disabled={isSubmitting}
                  onChange={(event) => setColor(event.target.value)}
                  type="color"
                  value={color || "#5b56d4"}
                />
              </label>
              <Button className="w-full sm:w-auto" disabled={isSubmitting || !label.trim()} size="lg" type="submit">
                {isSubmitting ? "Adicionando…" : "Adicionar"}
              </Button>
            </div>
            {createError ? <p className="text-xs text-destructive" role="alert">{createError}</p> : null}
          </form>
        ) : null}

        <div className="grid min-w-0 gap-5 p-3 sm:p-4">
          {visibleCategoryCount === 0 ? (
            <EmptyState
              title={totalCatalog === 0 ? "Nenhuma categoria cadastrada" : `Sem categorias em ${categoryFacetLabels[selectedFacet as CategoryFacetType]}`}
              description={totalCatalog === 0
                ? "Use “Nova categoria” para começar a organizar a taxonomia."
                : "Adicione a primeira categoria desta faceta pelo botão acima."}
            />
          ) : visibleFacets.map((facetType) => {
            const items = paginatedCategories.filter((category) => category.facet === facetType);
            return (
              <section aria-label={categoryFacetLabels[facetType]} className="min-w-0" key={facetType}>
                <header className="mb-1 flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{categoryFacetLabels[facetType]}</h3>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{items.length}</span>
                </header>
                <div className="grid">
                  {items.map((category) => (
                    <article className="grid min-h-11 min-w-0 grid-cols-[8px_minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-b border-border/70 py-1 last:border-b-0" key={category.id}>
                      <i aria-hidden="true" className="size-2 rounded-full bg-primary" style={{ backgroundColor: category.color ?? undefined }} />
                      <span className="min-w-0 truncate text-sm font-medium text-foreground" title={getCategoryName(category)}>{getCategoryName(category)}</span>
                      <small className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{category.ticketCount} vínculo{category.ticketCount === 1 ? "" : "s"}</small>
                      <Button
                        aria-label={`Editar categoria ${getCategoryName(category)}`}
                        className="text-muted-foreground hover:text-primary"
                        onClick={() => openEditDialog(category)}
                        size="icon-xs"
                        title="Editar categoria"
                        type="button"
                        variant="ghost"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        aria-label={`Excluir categoria ${getCategoryName(category)}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setCategoryToDelete(category);
                          setReplacementCategoryId("");
                          setDeleteError(null);
                        }}
                        size="icon-xs"
                        title="Excluir categoria"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 />
                      </Button>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {visibleCategoryCount > CATEGORY_PAGE_SIZE ? (
          <footer aria-label="Paginação do catálogo de categorias" className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs tabular-nums text-muted-foreground">
              Mostrando {(currentCategoryPage - 1) * CATEGORY_PAGE_SIZE + 1}–{Math.min(currentCategoryPage * CATEGORY_PAGE_SIZE, visibleCategoryCount)} de {visibleCategoryCount} categorias
            </p>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <Button
                aria-label="Página anterior do catálogo"
                disabled={currentCategoryPage === 1}
                onClick={() => setCategoryPage((page) => Math.max(1, Math.min(page, totalCategoryPages) - 1))}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-24 text-center text-xs tabular-nums text-muted-foreground">Página {currentCategoryPage} de {totalCategoryPages}</span>
              <Button
                aria-label="Próxima página do catálogo"
                disabled={currentCategoryPage === totalCategoryPages}
                onClick={() => setCategoryPage((page) => Math.min(totalCategoryPages, page + 1))}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <ChevronRight />
              </Button>
            </div>
          </footer>
        ) : null}
      </Card>

      <Dialog
        open={Boolean(categoryToEdit)}
        onOpenChange={(open) => {
          if (!open && !isUpdating) {
            setCategoryToEdit(null);
            setEditError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <form className="grid gap-4" onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Editar categoria</DialogTitle>
              <DialogDescription>
                Nome, faceta e cor aparecem atualizados nos tickets vinculados sem regravar cada ticket.
              </DialogDescription>
            </DialogHeader>
            <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground">
              <span>Faceta</span>
              <Select disabled={isUpdating} onValueChange={(value) => setEditFacet(value as CategoryFacetType)} value={editFacet}>
                <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoryDisplayOrder.map((facetType) => (
                    <SelectItem key={facetType} value={facetType}>{categoryFacetLabels[facetType]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground">
              <span>Nome</span>
              <Input
                autoFocus
                disabled={isUpdating}
                maxLength={120}
                onChange={(event) => setEditLabel(event.target.value)}
                value={editLabel}
              />
            </label>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium text-foreground">Cor</span>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Cor da categoria editada"
                  className="h-9 w-16 cursor-pointer p-1"
                  disabled={isUpdating}
                  onChange={(event) => setEditColor(event.target.value)}
                  type="color"
                  value={editColor || "#5b56d4"}
                />
                <Button disabled={isUpdating || !editColor} onClick={() => setEditColor("")} size="sm" type="button" variant="outline">
                  Usar cor automática
                </Button>
              </div>
            </div>
            {editError ? <p className="text-sm text-destructive" role="alert">{editError}</p> : null}
            <DialogFooter>
              <Button disabled={isUpdating} onClick={() => setCategoryToEdit(null)} type="button" variant="outline">Cancelar</Button>
              <Button disabled={isUpdating || !editLabel.trim()} type="submit">
                {isUpdating ? "Salvando…" : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(categoryToDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setCategoryToDelete(null);
            setReplacementCategoryId("");
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Excluir categoria</DialogTitle>
            <DialogDescription>
              {categoryToDelete?.ticketCount
                ? `“${getCategoryName(categoryToDelete)}” está vinculada a ${categoryToDelete.ticketCount} ticket${categoryToDelete.ticketCount === 1 ? "" : "s"}. Substitua os vínculos antes da exclusão.`
                : `“${categoryToDelete ? getCategoryName(categoryToDelete) : ""}” ainda não foi utilizada e será excluída definitivamente.`}
            </DialogDescription>
          </DialogHeader>

          {categoryToDelete?.ticketCount ? (
            <div className="grid gap-3 rounded-xl border border-border bg-muted/35 p-3">
              <div className="flex items-start gap-2">
                <ArrowRightLeft className="mt-0.5 shrink-0 text-primary" size={16} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Migrar tickets para</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Somente categorias da mesma faceta ({categoryFacetLabels[categoryToDelete.facet]}) podem substituir esta classificação.
                  </p>
                </div>
              </div>
              <Combobox
                disabled={isDeleting}
                emptyMessage="Crie outra categoria nesta faceta antes de excluir."
                onValueChange={setReplacementCategoryId}
                options={replacementOptions}
                placeholder="Selecione a categoria substituta…"
                searchPlaceholder="Buscar categoria…"
                value={replacementCategoryId}
              />
            </div>
          ) : null}

          {deleteError ? <p className="text-xs text-destructive">{deleteError}</p> : null}

          <DialogFooter>
            <Button
              disabled={isDeleting}
              onClick={() => setCategoryToDelete(null)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={
                isDeleting ||
                Boolean(categoryToDelete?.ticketCount && !replacementCategoryId)
              }
              onClick={() => void confirmDelete()}
              type="button"
              variant="destructive"
            >
              <Trash2 />
              {isDeleting
                ? "Excluindo…"
                : categoryToDelete?.ticketCount
                  ? "Migrar e excluir"
                  : "Excluir definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
