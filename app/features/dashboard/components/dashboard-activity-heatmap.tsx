import { useMemo } from "react";
import { cn } from "@/app/lib/utils";
import {
  buildDashboardHeatmap,
  dashboardHeatmapLevel,
} from "../domain/dashboard-heatmap";

const HEATMAP_MONTH_WINDOW = 12;
/** size-3.5 square (14px) + gap-1 (4px). */
const HEATMAP_WEEK_PX = 18;

const levelClasses = [
  "bg-muted",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
] as const;

const monthLabels = [
  "jan.",
  "fev.",
  "mar.",
  "abr.",
  "mai.",
  "jun.",
  "jul.",
  "ago.",
  "set.",
  "out.",
  "nov.",
  "dez.",
] as const;

function formatDayTitle(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function DashboardActivityHeatmap({
  data,
  referenceDate,
}: {
  data: Array<{ date: string; resolved: number }>;
  referenceDate: string;
}) {
  const heatmap = useMemo(
    () =>
      buildDashboardHeatmap(data, {
        referenceDate,
        monthCount: HEATMAP_MONTH_WINDOW,
      }),
    [data, referenceDate],
  );

  const totalLabel =
    heatmap.total === 1
      ? "1 ticket respondido"
      : `${heatmap.total.toLocaleString("pt-BR")} tickets respondidos`;
  const rangeLabel = heatmap.firstDate && heatmap.lastDate
    ? `entre ${formatDayTitle(heatmap.firstDate)} e ${formatDayTitle(heatmap.lastDate)}`
    : "nos últimos 12 meses";
  const lastLabel = heatmap.labels[heatmap.labels.length - 1];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        aria-label={`${totalLabel} ${rangeLabel}. Quanto mais escuro o quadrado, mais respostas no dia.`}
        className="overflow-x-auto pb-1"
        role="img"
      >
        <div className="flex w-fit flex-col gap-1.5">
          <div
            className="relative h-4 w-fit"
            style={{ width: heatmap.weeks.length * HEATMAP_WEEK_PX - 4 }}
          >
            {heatmap.labels.map((label, index) => {
              const showYear =
                label.month === 0 ||
                (index === 0 && lastLabel && label.year !== lastLabel.year);
              return (
                <span
                  className="absolute top-0 text-[10px] leading-4 font-medium whitespace-nowrap text-muted-foreground"
                  key={`${label.year}-${label.month}`}
                  style={{ left: label.weekIndex * HEATMAP_WEEK_PX }}
                >
                  {monthLabels[label.month]}
                  {showYear ? ` ${String(label.year).slice(2)}` : ""}
                </span>
              );
            })}
          </div>
          <div className="grid w-fit grid-flow-col grid-rows-7 gap-1">
            {heatmap.weeks.flatMap((week) =>
              week.map((day) => {
                const level = dashboardHeatmapLevel(day.count, heatmap.max);
                const squareClass = !day.inWindow
                  ? "bg-transparent"
                  : day.inPeriod
                    ? levelClasses[level]
                    : "bg-muted";
                return (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-3.5 rounded-[3px] transition-colors",
                      squareClass,
                    )}
                    key={day.date}
                    title={
                      day.inPeriod
                        ? `${day.count} ${day.count === 1 ? "ticket respondido" : "tickets respondidos"} em ${formatDayTitle(day.date)}`
                        : undefined
                    }
                  />
                );
              }),
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{totalLabel} neste período</span>
        <span className="inline-flex items-center gap-1.5">
          Menos
          {levelClasses.map((className) => (
            <span className={cn("size-3 rounded-[3px]", className)} key={className} />
          ))}
          Mais
        </span>
      </div>
    </div>
  );
}
