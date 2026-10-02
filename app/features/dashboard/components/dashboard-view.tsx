import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ChartPie,
  CheckCircle2,
  Clock3,
  Download,
  Gauge,
  Inbox,
  LoaderCircle,
  MessageSquareWarning,
  MessagesSquare,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Tag,
  TimerReset,
  TrendingUp,
  UserMinus,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getDashboard, getDashboardExport } from "@/app/lib/api";
import {
  dashboardDateRangeError,
  dashboardPeriodOptions,
  dashboardRangeKey,
  formatDashboardRangeLabel,
  getDashboardPresetRange,
  type DashboardDateRange,
  type DashboardPeriodId,
} from "@/app/lib/dashboard-period";
import {
  formatNumber,
  getClientName,
  statusLabels,
} from "@/app/lib/format";
import type { DashboardData, TicketSummary } from "@/app/lib/types";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { EmptyState, LoadingState } from "@/app/components/shared/ui-states";
import { cn } from "@/app/lib/utils";
import {
  DashboardDailyChart,
  DashboardHorizontalBars,
  DashboardMetricCard,
  DashboardStatusDonut,
} from "./dashboard-charts";
import { DashboardRhythmHeatmap } from "./dashboard-rhythm-heatmap";

type DashboardViewMode = "you" | "team";
const teamAssigneeFilter = "all";

function dashboardRequestKey(
  range: DashboardDateRange,
  assigneeId: string | readonly string[],
): string {
  const normalizedAssignee = typeof assigneeId === "string"
    ? assigneeId
    : [...new Set(assigneeId)].toSorted().join(",");
  return `${dashboardRangeKey(range)}:${normalizedAssignee}`;
}

type MetricComparison = {
  current: number | null;
  previous: number | null;
};

function comparisonPresentation(
  metric: MetricComparison | undefined,
  favorableDirection?: "higher" | "lower",
): { label: string; tone: "positive" | "negative" | "neutral" } | null {
  if (!metric || metric.current === null || metric.previous === null) return null;
  const delta = metric.current - metric.previous;
  if (delta === 0) return { label: "Sem variação", tone: "neutral" };
  if (metric.previous === 0) {
    return { label: "Novo vs. anterior", tone: "neutral" };
  }
  const percentage = Math.abs((delta / metric.previous) * 100);
  const direction = delta > 0 ? "↑" : "↓";
  const favorable = favorableDirection === "higher"
    ? delta > 0
    : favorableDirection === "lower"
      ? delta < 0
      : null;
  return {
    label: `${direction} ${percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. anterior`,
    tone: favorable === null ? "neutral" : favorable ? "positive" : "negative",
  };
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${formatNumber(Math.round(minutes))} min`;
  if (minutes < 1_440) {
    return `${(minutes / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  }
  return `${(minutes / 1_440).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
}

function DashboardPanelHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex min-h-9 items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </header>
  );
}

export function DashboardView({
  dashboard,
  loading,
  onOpenInbox,
  onOpenTicket,
  timeZone,
  currentUserId,
}: {
  dashboard: DashboardData | null;
  loading: boolean;
  onOpenInbox: () => void;
  onOpenTicket: (id: string) => void;
  timeZone: string;
  currentUserId: string | null;
}) {
  const initialRange = useMemo(
    () => getDashboardPresetRange("last_7_days", new Date(), timeZone),
    [timeZone],
  );
  const [selectedPeriod, setSelectedPeriod] =
    useState<DashboardPeriodId>("last_7_days");
  const [viewMode, setViewMode] = useState<DashboardViewMode>("team");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [range, setRange] = useState<DashboardDateRange>(initialRange);
  const [draftFrom, setDraftFrom] = useState(initialRange.from ?? "");
  const [draftTo, setDraftTo] = useState(initialRange.to ?? "");
  const [customError, setCustomError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [filterLoading, setFilterLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [loadedDashboard, setLoadedDashboard] = useState<{
    requestKey: string;
    viewMode: DashboardViewMode;
    data: DashboardData;
  } | null>(null);
  const [heatmapResult, setHeatmapResult] = useState<
    | {
        assigneeId: string;
        referenceDate: string;
        status: "success";
        data: DashboardData["ticketsByDay"];
      }
    | {
        assigneeId: string;
        referenceDate: string;
        status: "error";
        error: string;
      }
    | null
  >(null);
  const [heatmapRetryVersion, setHeatmapRetryVersion] = useState(0);
  const rangeFrom = range.from;
  const rangeTo = range.to;
  const selectedAssignee = useMemo<string | readonly string[]>(() => {
    if (viewMode === "you" && currentUserId) return currentUserId;
    return selectedAssigneeIds.length
      ? [...selectedAssigneeIds].toSorted()
      : teamAssigneeFilter;
  }, [currentUserId, selectedAssigneeIds, viewMode]);
  const selectedAssigneeLabel = viewMode === "you" && currentUserId
    ? "Você"
    : selectedAssigneeIds.length === 0
      ? "Toda a equipe"
      : selectedAssigneeIds.length === 1
        ? dashboard?.assigneeMetrics.find(
            (metric) => metric.assignee?.id === selectedAssigneeIds[0],
          )?.assignee?.displayName ?? "1 responsável selecionado"
        : `${selectedAssigneeIds.length} responsáveis selecionados`;
  const activeRangeKey = dashboardRangeKey(range);
  const activeRequestKey = dashboardRequestKey(range, selectedAssignee);
  const today = initialRange.to ?? "";
  const heatmapReferenceDate = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date()),
    [timeZone],
  );
  const heatmapRange = useMemo(() => {
    const [year, month] = heatmapReferenceDate.split("-").map(Number);
    const firstMonth = new Date(Date.UTC(year, month - 12, 1));
    return {
      from: `${firstMonth.getUTCFullYear()}-${String(firstMonth.getUTCMonth() + 1).padStart(2, "0")}-01`,
      to: heatmapReferenceDate,
    };
  }, [heatmapReferenceDate]);
  const currentHeatmapResult = heatmapResult?.assigneeId === currentUserId &&
    heatmapResult.referenceDate === heatmapReferenceDate
    ? heatmapResult
    : null;
  const heatmapError = currentHeatmapResult?.status === "error"
    ? currentHeatmapResult.error
    : !currentUserId
      ? "Não foi possível identificar o usuário atual."
      : null;

  useEffect(() => {
    let active = true;
    const requestedRange = { from: rangeFrom, to: rangeTo };
    const requestedKey = dashboardRequestKey(requestedRange, selectedAssignee);
    void getDashboard(requestedRange, selectedAssignee)
      .then((data) => {
        if (active) setLoadedDashboard({ requestKey: requestedKey, viewMode, data });
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os indicadores deste período.",
        );
      })
      .finally(() => {
        if (active) setFilterLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dashboard, rangeFrom, rangeTo, reloadVersion, selectedAssignee, viewMode]);

  useEffect(() => {
    if (viewMode !== "you" || !currentUserId) return;
    let active = true;
    void getDashboard(heatmapRange, currentUserId)
      .then((data) => {
        if (active) {
          setHeatmapResult({
            assigneeId: currentUserId,
            referenceDate: heatmapReferenceDate,
            status: "success",
            data: data.ticketsByDay,
          });
        }
      })
      .catch((error) => {
        if (!active) return;
        setHeatmapResult({
          assigneeId: currentUserId,
          referenceDate: heatmapReferenceDate,
          status: "error",
          error: error instanceof Error
            ? error.message
            : "Não foi possível carregar o histórico anual de atendimento.",
        });
      });
    return () => {
      active = false;
    };
  }, [
    currentUserId,
    heatmapRange,
    heatmapReferenceDate,
    heatmapRetryVersion,
    viewMode,
  ]);

  const hasActiveDashboard = loadedDashboard?.requestKey === activeRequestKey;
  const currentDashboard = hasActiveDashboard
    ? loadedDashboard.data
    : loadedDashboard?.data ?? (
        activeRangeKey === "all:all" && viewMode === "team"
          ? dashboard
          : null
      );
  const visibleViewMode = hasActiveDashboard
    ? viewMode
    : loadedDashboard?.viewMode ?? viewMode;
  const isViewTransitioning = visibleViewMode !== viewMode;
  const effectiveRange = hasActiveDashboard && currentDashboard?.period
    ? { from: currentDashboard.period.from, to: currentDashboard.period.to }
    : range;
  const rangeLabel = formatDashboardRangeLabel(effectiveRange, timeZone);

  function loadRange(nextRange: DashboardDateRange) {
    setFilterLoading(true);
    setLoadError(null);
    if (dashboardRangeKey(nextRange) === activeRangeKey) {
      setReloadVersion((current) => current + 1);
      return;
    }
    setRange(nextRange);
  }

  function retryDashboard() {
    setFilterLoading(true);
    setLoadError(null);
    setReloadVersion((current) => current + 1);
  }

  function selectViewMode(nextMode: DashboardViewMode) {
    if (nextMode === viewMode) return;
    setFilterLoading(true);
    setLoadError(null);
    setExportError(null);
    setViewMode(nextMode);
  }

  function toggleAssignee(assigneeId: string) {
    setFilterLoading(true);
    setLoadError(null);
    setExportError(null);
    setSelectedAssigneeIds((current) => current.includes(assigneeId)
      ? current.filter((id) => id !== assigneeId)
      : [...current, assigneeId]);
  }

  function selectPeriod(period: DashboardPeriodId) {
    setSelectedPeriod(period);
    setCustomError(null);
    setExportError(null);
    if (period === "custom") {
      const fallback = getDashboardPresetRange("last_7_days", new Date(), timeZone);
      setDraftFrom(range.from ?? fallback.from ?? "");
      setDraftTo(range.to ?? fallback.to ?? "");
      return;
    }
    const nextRange = getDashboardPresetRange(period, new Date(), timeZone);
    setDraftFrom(nextRange.from ?? "");
    setDraftTo(nextRange.to ?? "");
    loadRange(nextRange);
  }

  function applyCustomRange() {
    const error = dashboardDateRangeError(draftFrom, draftTo);
    setCustomError(error);
    if (error) return;
    const nextRange = { from: draftFrom, to: draftTo };
    loadRange(nextRange);
  }

  async function exportDashboard() {
    if (!currentDashboard || exporting) return;
    setExporting(true);
    setExported(false);
    setExportError(null);
    try {
      const result = await getDashboardExport(range, selectedAssignee);
      const objectUrl = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = result.fileName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      setExported(true);
      window.setTimeout(() => setExported(false), 1_800);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Não foi possível exportar este período.",
      );
    } finally {
      setExporting(false);
    }
  }

  const toolbar = (
    <Card
      aria-label="Filtrar indicadores por período e responsável"
      className="mb-4 grid gap-3 p-3 py-3 shadow-sm lg:grid-cols-[minmax(210px,1fr)_auto]"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <CalendarDays size={18} />
        </span>
        <div className="flex min-w-0 flex-col">
          <strong className="text-sm font-semibold text-foreground">Período dos indicadores</strong>
          <small className="mt-0.5 text-[13px] leading-5 text-muted-foreground">Tickets criados e resoluções</small>
          <div aria-label="Filtros ativos" className="mt-1.5 flex min-w-0 flex-wrap gap-1.5" role="group">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs leading-4 text-foreground">
              <CalendarDays aria-hidden="true" className="shrink-0 text-muted-foreground" size={12} />
              <span className="truncate" title={rangeLabel}>{rangeLabel}</span>
            </span>
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs leading-4 text-foreground">
              <UsersRound aria-hidden="true" className="shrink-0 text-primary" size={12} />
              <span className="truncate" title={selectedAssigneeLabel}>{selectedAssigneeLabel}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-2 lg:justify-end">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-medium text-muted-foreground">Período</span>
          <Select
            onValueChange={(value) => selectPeriod(value as DashboardPeriodId)}
            value={selectedPeriod}
          >
            <SelectTrigger aria-label="Selecionar período do dashboard" className="h-9 w-full min-w-40 text-sm sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dashboardPeriodOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-medium text-muted-foreground">Visualização</span>
          <Select
            onValueChange={(value) => selectViewMode(value as DashboardViewMode)}
            value={viewMode}
          >
            <SelectTrigger aria-label="Selecionar visualização do dashboard" className="h-9 w-full min-w-44 text-sm sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="team">Toda equipe</SelectItem>
              <SelectItem disabled={!currentUserId} value="you">Você</SelectItem>
            </SelectContent>
          </Select>
        </label>
        {selectedPeriod === "custom" ? (
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[13px] font-medium text-muted-foreground">De</span>
              <Input
                className="h-9 w-36 text-sm"
                max={draftTo || today}
                onChange={(event) => {
                  setDraftFrom(event.target.value);
                  setCustomError(null);
                }}
                type="date"
                value={draftFrom}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[13px] font-medium text-muted-foreground">Até</span>
              <Input
                className="h-9 w-36 text-sm"
                max={today}
                min={draftFrom || undefined}
                onChange={(event) => {
                  setDraftTo(event.target.value);
                  setCustomError(null);
                }}
                type="date"
                value={draftTo}
              />
            </label>
            <Button onClick={applyCustomRange} size="lg" type="button" variant="outline">
              Aplicar
            </Button>
          </div>
        ) : null}
        <Button
          aria-label={`Exportar dashboard de ${rangeLabel} em CSV`}
          disabled={!currentDashboard || filterLoading || exporting}
          onClick={() => void exportDashboard()}
          size="lg"
          type="button"
          variant="default"
        >
          {exporting ? <LoaderCircle className="animate-spin" size={15} /> : <Download size={15} />}
          {exporting ? "Exportando…" : exported ? "Exportado" : "Exportar CSV"}
        </Button>
      </div>
      <div aria-live="polite" className="flex min-h-4 min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground empty:hidden lg:col-span-2">
        {filterLoading ? <span className="inline-flex min-w-0 items-center gap-1"><LoaderCircle className="animate-spin" size={12} /> Atualizando indicadores…</span> : null}
        {customError ? <span className="text-destructive" role="alert">{customError}</span> : null}
        {exportError ? <span className="text-destructive" role="alert">{exportError}</span> : null}
      </div>
    </Card>
  );

  if (!currentDashboard) {
    return (
      <div className="min-h-full w-full p-4 sm:p-5">
        {toolbar}
        {loading || filterLoading ? (
          <LoadingState label="Calculando indicadores do período…" />
        ) : (
          <div className="grid place-items-center">
            <EmptyState
              title="Dashboard indisponível"
              description={loadError ?? "Ligue o serviço local para consultar as métricas do atendimento."}
            />
            <Button className="-mt-3" onClick={retryDashboard} type="button" variant="outline">
              <RefreshCw size={14} /> Tentar novamente
            </Button>
          </div>
        )}
      </div>
    );
  }

  const statusColors = {
    new: "var(--chart-1)",
    triage: "var(--chart-5)",
    in_progress: "var(--chart-2)",
    waiting_customer: "var(--chart-3)",
    blocked: "var(--destructive)",
    resolved: "var(--chart-4)",
    cancelled: "var(--color-rose-500)",
    archived: "var(--muted-foreground)",
  } satisfies Record<TicketSummary["status"], string>;
  const statusItems = currentDashboard.statusCounts
    .filter((item) => item.count > 0)
    .map((item) => ({
      label: statusLabels[item.status],
      value: item.count,
      color: statusColors[item.status],
    }));
  const categoryItems = currentDashboard.topCategories.slice(0, 6).map((item) => ({
    label: item.category.label,
    value: item.count,
    color: item.category.color ?? undefined,
  }));
  const chartPeriodDescription = currentDashboard.period
    ? "Criações e resoluções dentro do período"
    : "Todo o período · gráfico dos últimos 14 dias";
  const rankingItems = currentDashboard.topGroups.map((group) => ({
    id: group.groupId,
    label: group.groupSubject,
    count: group.count,
  }));
  const comparisonRange = currentDashboard.comparison
    ? formatDashboardRangeLabel(
        {
          from: currentDashboard.comparison.previousPeriod.from,
          to: currentDashboard.comparison.previousPeriod.to,
        },
        timeZone,
      )
    : null;
  const overviewMetrics = [
    {
      label: "Tickets criados",
      value: formatNumber(currentDashboard.totals.tickets),
      note: `${currentDashboard.totals.open} ainda abertos neste recorte`,
      tone: "violet",
      icon: <Inbox size={20} />,
      comparison: comparisonPresentation(currentDashboard.comparison?.created),
    },
    {
      label: "Resolvidos no período",
      value: formatNumber(currentDashboard.totals.resolved),
      note: "Resoluções concluídas dentro do recorte",
      tone: "green",
      icon: <CheckCircle2 size={20} />,
      comparison: comparisonPresentation(
        currentDashboard.comparison?.resolved,
        "higher",
      ),
    },
    {
      label: "Backlog no fechamento",
      value: formatNumber(currentDashboard.operations.backlog),
      note: "Tickets ainda abertos ao fim do recorte",
      tone: "blue",
      icon: <Gauge size={20} />,
      comparison: comparisonPresentation(currentDashboard.comparison?.backlog, "lower"),
    },
    {
      label: "Tempo mediano de resolução",
      value: formatDuration(currentDashboard.operations.medianResolutionMinutes),
      note: "Tempo típico entre abertura e resolução",
      tone: "neutral",
      icon: <TimerReset size={20} />,
      comparison: comparisonPresentation(
        currentDashboard.comparison?.medianResolutionMinutes,
        "lower",
      ),
    },
  ];
  const healthMetrics = [
    {
      label: "Sem responsável",
      value: currentDashboard.operations.unassignedBacklog,
      note: "Tickets abertos sem uma pessoa atribuída",
      icon: <UserMinus size={16} />,
      comparison: comparisonPresentation(
        currentDashboard.comparison?.unassignedBacklog,
        "lower",
      ),
    },
    {
      label: "Em revisão",
      value: currentDashboard.totals.needsReview,
      note: "Tickets que ainda precisam de validação humana",
      icon: <MessageSquareWarning size={16} />,
      comparison: null,
    },
    {
      label: "Tickets reabertos",
      value: currentDashboard.operations.reopened,
      note: "Voltaram ao atendimento após uma resolução",
      icon: <RotateCcw size={16} />,
      comparison: comparisonPresentation(
        currentDashboard.comparison?.reopened,
        "lower",
      ),
    },
    {
      label: "Backlog há mais de 7 dias",
      value: currentDashboard.aging.find((bucket) => bucket.id === "over_seven_days")?.count ?? 0,
      note: "Tickets ainda abertos desde a semana passada ou antes",
      icon: <TimerReset size={16} />,
      comparison: null,
    },
  ];
  const selectedAssigneeSet = new Set(selectedAssigneeIds);
  const widgetContent = {
    overview: (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overviewMetrics.map((metric) => (
          <DashboardMetricCard key={metric.label} {...metric} />
        ))}
      </div>
    ),
    health: (
      <Card className="min-w-0 gap-4 p-4 py-4 shadow-sm">
        <DashboardPanelHeader
          action={comparisonRange ? (
            <Badge className="shrink-0" variant="outline">
              anterior: {comparisonRange}
            </Badge>
          ) : undefined}
          description="Sinais acionáveis que merecem atenção da equipe"
          icon={<ShieldAlert size={17} />}
          title="Saúde da operação"
        />
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
          {healthMetrics.map((metric) => (
            <div className="min-w-0 rounded-xl border bg-muted/20 p-3" key={metric.label}>
              <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                <span className="text-primary">{metric.icon}</span>
                {metric.label}
              </div>
              <strong className="mt-2 block text-xl font-semibold tracking-tight text-foreground">
                {formatNumber(metric.value)}
              </strong>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{metric.note}</p>
              {metric.comparison ? (
                <Badge
                  className={cn(
                    "mt-2 border-0",
                    metric.comparison.tone === "positive" && "bg-emerald-500/10 text-emerald-700",
                    metric.comparison.tone === "negative" && "bg-red-500/10 text-red-700",
                  )}
                  variant="secondary"
                >
                  {metric.comparison.label}
                </Badge>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    ),
    team: visibleViewMode === "team" ? (
      <Card className="min-w-0 gap-4 p-4 py-4 shadow-sm">
        <DashboardPanelHeader
          action={(
            <Badge className="shrink-0" variant="secondary">
              {selectedAssigneeIds.length
                ? `${selectedAssigneeIds.length} selecionados`
                : `${currentDashboard.assigneeMetrics.filter((metric) => metric.assignee).length} pessoas`}
            </Badge>
          )}
          description="Selecione uma ou mais pessoas para filtrar os indicadores"
          icon={<UsersRound size={17} />}
          title="Atendimento por responsável"
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Selecionar responsáveis para filtrar o dashboard">
          {currentDashboard.assigneeMetrics.map((metric) => {
            const key = metric.assignee?.id ?? "unassigned";
            const displayName = metric.assignee?.displayName ?? "Sem responsável";
            const selected = metric.assignee
              ? selectedAssigneeSet.has(metric.assignee.id)
              : false;
            const initials = metric.assignee
              ? metric.assignee.displayName
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toLocaleUpperCase("pt-BR"))
                  .join("")
              : "—";
            const cardContent = (
              <>
                <span className="row-span-2 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initials}
                </span>
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <strong className="truncate text-sm font-semibold text-foreground">{displayName}</strong>
                  <Badge className="shrink-0" variant="outline">
                    {metric.assignee
                      ? metric.assignee.active ? "Ativo" : "Inativo"
                      : "Fila"}
                  </Badge>
                </span>
                <span className="grid min-w-0 grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <span className="flex flex-col"><b className="text-sm text-foreground">{formatNumber(metric.created)}</b>Criados</span>
                  <span className="flex flex-col"><b className="text-sm text-foreground">{formatNumber(metric.open)}</b>Abertos</span>
                  <span className="flex flex-col"><b className="text-sm text-foreground">{formatNumber(metric.resolved)}</b>Resolvidos</span>
                </span>
              </>
            );
            const cardClassName = cn(
              "grid min-h-24 min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border bg-background p-3 text-left shadow-xs",
              metric.assignee && "cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected && "border-primary bg-primary/5 ring-1 ring-primary/20",
            );
            return metric.assignee ? (
              <Button
                aria-label={`Filtrar indicadores por ${displayName}`}
                aria-pressed={selected}
                className={cardClassName}
                key={key}
                onClick={() => toggleAssignee(metric.assignee!.id)}
                size="unstyled"
                type="button"
                variant="unstyled"
              >
                {cardContent}
              </Button>
            ) : (
              <div className={cardClassName} key={key}>{cardContent}</div>
            );
          })}
        </div>
        {!currentDashboard.assigneeMetrics.length ? (
          <p className="flex min-h-20 items-center justify-center text-sm text-muted-foreground">
            Adicione pessoas à equipe para acompanhar a distribuição dos tickets.
          </p>
        ) : null}
      </Card>
    ) : null,
    activity: visibleViewMode === "you" ? (
      <Card className="min-w-0 gap-4 p-4 py-4 shadow-sm">
        <DashboardPanelHeader
          action={(
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <i className="size-2 rounded-sm bg-[var(--chart-4)]" />Resolvidos
            </span>
          )}
          description="Tickets resolvidos por dia nos últimos 12 meses"
          icon={<TrendingUp size={17} />}
          title="Seu ritmo de atendimento"
        />
        {heatmapError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-3 text-sm text-destructive" role="alert">
            <span>{heatmapError}</span>
            <Button
              onClick={() => {
                setHeatmapResult(null);
                setHeatmapRetryVersion((current) => current + 1);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw size={13} /> Tentar novamente
            </Button>
          </div>
        ) : currentHeatmapResult?.status !== "success" ? (
          <p className="text-sm text-muted-foreground" role="status">
            <LoaderCircle className="mr-2 inline size-4 animate-spin" />
            Carregando histórico dos últimos 12 meses…
          </p>
        ) : (
          <DashboardRhythmHeatmap
            data={currentHeatmapResult.data}
            referenceDate={heatmapReferenceDate}
          />
        )}
      </Card>
    ) : null,
    rhythm: (
      <Card className="min-w-0 gap-4 p-4 py-4 shadow-sm">
        <DashboardPanelHeader
          action={(
            <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-sm bg-[var(--chart-1)]" />Criados</span>
              <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-sm bg-[var(--chart-4)]" />Resolvidos</span>
            </div>
          )}
          description={chartPeriodDescription}
          icon={<TrendingUp size={17} />}
          title="Tickets criados x resolvidos"
        />
        {currentDashboard.ticketsByDay.length ? (
          <DashboardDailyChart data={currentDashboard.ticketsByDay} />
        ) : (
          <p className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">Não houve criação ou resolução neste período.</p>
        )}
      </Card>
    ),
    audit: (
      <Card className="min-w-0 gap-4 bg-linear-to-br from-card to-amber-50/40 p-4 py-4 shadow-sm lg:h-[280px]">
        <DashboardPanelHeader
          description="Proteção geral contra mensagens perdidas"
          icon={<ShieldAlert size={17} />}
          title="Auditoria da fila geral"
        />
        <div className={cn(
          "flex items-center gap-2.5 rounded-lg border p-3 text-emerald-700",
          currentDashboard.totals.orphanDemands
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-emerald-200 bg-emerald-50",
        )}>
          {currentDashboard.totals.orphanDemands ? <AlertTriangle size={25} /> : <CheckCircle2 size={25} />}
          <div className="flex flex-col">
            <strong className="text-sm font-semibold">{currentDashboard.totals.orphanDemands ? `${currentDashboard.totals.orphanDemands} conversas` : "Fila em dia"}</strong>
            <span className="mt-0.5 text-xs text-muted-foreground">{currentDashboard.totals.orphanDemands ? "podem conter demandas sem ticket" : "Nenhuma demanda órfã detectada"}</span>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">Esta fila é global: não muda com o período nem com os responsáveis selecionados.</p>
        <Button className="w-full" onClick={onOpenInbox} type="button" variant="outline">Revisar na Inbox <ArrowRight size={15} /></Button>
      </Card>
    ),
    status: (
      <Card className="min-w-0 gap-4 p-4 py-4 shadow-sm">
        <DashboardPanelHeader
          description="Tickets criados ou resolvidos no período, no status atual"
          icon={<ChartPie size={17} />}
          title="Status dos tickets do período"
        />
        {statusItems.length ? <DashboardStatusDonut items={statusItems} /> : <p className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">Sem tickets categorizados.</p>}
      </Card>
    ),
    categories: (
      <Card className="min-w-0 gap-4 p-4 py-4 shadow-sm lg:h-[280px]">
        <DashboardPanelHeader
          description="Assuntos dos tickets criados no período"
          icon={<Clock3 size={17} />}
          title="Categorias mais frequentes"
        />
        {categoryItems.length ? <DashboardHorizontalBars items={categoryItems} /> : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5 text-center">
            <span aria-hidden="true" className="mb-2 grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Tag size={17} />
            </span>
            <strong className="text-sm font-medium text-foreground">Sem categorias neste período</strong>
            <p className="mt-1 max-w-xs text-[13px] leading-5 text-muted-foreground">Tickets classificados aparecerão aqui quando houver dados.</p>
          </div>
        )}
      </Card>
    ),
    groups: (
      <Card className="min-w-0 gap-4 p-4 py-4 shadow-sm lg:h-[280px]">
        <DashboardPanelHeader
          description="Grupos com mais tickets no período"
          icon={<MessagesSquare size={17} />}
          title="Tickets por grupo"
        />
        <ol className="grid list-none gap-1.5 p-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {rankingItems.slice(0, 5).map((item, index) => (
            <li className="grid min-h-8 grid-cols-[24px_minmax(0,1fr)_28px] items-center gap-2" key={item.id}>
              <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
              <strong className="truncate text-[13px] font-medium text-foreground">{item.label}</strong>
              <b className="text-right text-[13px] text-muted-foreground">{item.count}</b>
            </li>
          ))}
        </ol>
        {!rankingItems.length ? <p className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">Sem tickets neste agrupamento.</p> : null}
      </Card>
    ),
    recent: (
      <Card className="min-w-0 gap-4 p-4 py-4 shadow-sm lg:h-[280px]">
        <DashboardPanelHeader
          description="Últimas demandas criadas no recorte"
          icon={<Inbox size={17} />}
          title="Tickets recentes do período"
        />
        <div className="grid gap-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {currentDashboard.recentTickets.slice(0, 6).map((ticket: TicketSummary) => (
            <Button
              aria-label={`Abrir ticket #${ticket.number}: ${ticket.title} · ${getClientName(ticket)} · ${statusLabels[ticket.status]}`}
              className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-left text-[13px] hover:bg-muted/60"
              key={ticket.id}
              onClick={() => onOpenTicket(ticket.id)}
              size="unstyled"
              type="button"
              variant="unstyled"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <small className="shrink-0 text-xs font-semibold text-primary">#{ticket.number}</small>
                  <strong className="truncate font-medium text-foreground" title={ticket.title}>{ticket.title}</strong>
                </span>
                <small className="truncate text-[13px] leading-4 text-muted-foreground" title={getClientName(ticket)}>{getClientName(ticket)}</small>
              </span>
              <Badge
                className="max-w-36 truncate whitespace-nowrap text-[11px]"
                variant={ticket.status === "resolved" ? "secondary" : ticket.status === "new" || ticket.status === "triage" ? "default" : "outline"}
              >
                {statusLabels[ticket.status]}
              </Badge>
              <ArrowRight aria-hidden="true" className="shrink-0 text-muted-foreground" size={14} />
            </Button>
          ))}
          {!currentDashboard.recentTickets.length ? <p className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">Nenhum ticket criado neste período.</p> : null}
        </div>
      </Card>
    ),
  } satisfies Record<string, ReactNode>;
  return (
    <div aria-busy={filterLoading} className="min-h-full w-full p-4 sm:p-5">
      {toolbar}
      {loadError ? (
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          <span className="min-w-0 break-words">{loadError} Os indicadores exibidos podem estar desatualizados.</span>
          <Button onClick={retryDashboard} size="sm" type="button" variant="outline">
            Tentar novamente
          </Button>
        </div>
      ) : null}
      <section
        className={cn(
          "grid grid-flow-row-dense items-start gap-3 rounded-xl border border-border bg-linear-to-br from-primary/13 via-card to-primary/[6.5%] p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 lg:grid-cols-12",
          isViewTransitioning && "opacity-70 transition-opacity duration-200",
        )}
        inert={isViewTransitioning}
        key={visibleViewMode}
      >
        <div className="lg:col-span-12">{widgetContent.overview}</div>
        {visibleViewMode === "team" ? (
          <>
            <div className="lg:col-span-12">{widgetContent.health}</div>
            <div className="lg:col-span-12">{widgetContent.team}</div>
          </>
        ) : null}
        {visibleViewMode === "you" ? (
          <div className="lg:col-span-12">{widgetContent.activity}</div>
        ) : null}
        <div className="lg:col-span-12">{widgetContent.rhythm}</div>
        {visibleViewMode === "team" ? (
          <div className="lg:col-span-4">{widgetContent.audit}</div>
        ) : null}
        <div className="lg:col-span-4">{widgetContent.status}</div>
        {visibleViewMode === "team" ? (
          <div className="lg:col-span-4">{widgetContent.categories}</div>
        ) : null}
        <div className={cn("lg:col-span-4", visibleViewMode === "team" && "lg:col-span-6")}>
          {widgetContent.groups}
        </div>
        <div className={cn("lg:col-span-4", visibleViewMode === "team" && "lg:col-span-6")}>
          {widgetContent.recent}
        </div>
      </section>
    </div>
  );
}
