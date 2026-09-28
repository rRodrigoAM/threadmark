import { useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import { buildDashboardHeatmap } from "../domain/dashboard-heatmap";

const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
type ActiveDay = { date: string; resolved: number; x: number; y: number };

function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

export function DashboardRhythmHeatmap({
  data,
  referenceDate,
}: {
  data: Array<{ date: string; created: number; resolved: number }>;
  referenceDate: string;
}) {
  const heatmap = useMemo(() => buildDashboardHeatmap(data, { referenceDate }), [data, referenceDate]);
  const [activeDay, setActiveDay] = useState<ActiveDay | null>(null);

  function updateActiveDay(element: HTMLButtonElement, x: number, y: number) {
    setActiveDay({
      date: element.dataset.date ?? "",
      resolved: Number(element.dataset.resolved ?? 0),
      x,
      y,
    });
  }

  return (
    <>
      <div className="min-w-0 pb-1">
        <div className="flex w-full flex-col gap-3">
          <div className="relative h-4 w-full">
            {heatmap.labels.map((label) => (
              <span
                className="absolute top-0 text-[10px] leading-4 text-muted-foreground"
                key={`${label.year}-${label.month}`}
                style={{ left: `${(label.weekIndex / heatmap.weeks.length) * 100}%` }}
              >
                {months[label.month]}{label.month === 0 ? ` '${String(label.year).slice(-2)}` : ""}
              </span>
            ))}
          </div>
          <div
            aria-label="Tickets resolvidos por dia"
            className="grid w-full grid-flow-col grid-rows-7 gap-1"
            onPointerLeave={() => setActiveDay(null)}
            onPointerMove={(event) => {
              const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-date]");
              if (!target) return;
              const date = target.dataset.date ?? "";
              setActiveDay((current) => current?.date === date
                ? current
                : {
                    date,
                    resolved: Number(target.dataset.resolved ?? 0),
                    x: event.clientX,
                    y: event.clientY,
                  });
            }}
            role="group"
            style={{ gridTemplateColumns: `repeat(${heatmap.weeks.length}, minmax(0, 1fr))` }}
          >
            {heatmap.weeks.flatMap((week) => week.map((day) => {
              const intensity = Math.min(day.resolved, 25) * 4;
              return (
                <Button
                  aria-label={`${formatDate(day.date)}: ${day.resolved} ${day.resolved === 1 ? "ticket resolvido" : "tickets resolvidos"}`}
                  className={cn("w-full aspect-square rounded-[3px] transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none", !day.inWindow && "bg-transparent")}
                  data-date={day.inWindow ? day.date : undefined}
                  data-resolved={day.resolved}
                  disabled={!day.inWindow}
                  key={day.date}
                  onFocus={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    updateActiveDay(event.currentTarget, rect.x + rect.width / 2, rect.y);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setActiveDay(null);
                  }}
                  size="unstyled"
                  style={day.inWindow
                    ? { backgroundColor: `color-mix(in srgb, var(--primary) ${intensity}%, var(--muted))` }
                    : undefined}
                  type="button"
                  variant="unstyled"
                />
              );
            }))}
          </div>
          <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
            Menos
            {[0, 6, 12, 18, 25].map((count) => (
              <span
                aria-hidden="true"
                className="size-3 rounded-[3px]"
                key={count}
                style={{ backgroundColor: `color-mix(in srgb, var(--primary) ${Math.min(count, 25) * 4}%, var(--muted))` }}
              />
            ))}
            Mais
          </div>
        </div>
      </div>
      {activeDay ? (
        <div
          className="pointer-events-none fixed z-50 min-w-32 -translate-x-1/2 -translate-y-full rounded-lg border border-white/10 bg-[#0b0d12] px-3 py-2 text-xs text-white shadow-xl"
          role="status"
          style={{ left: activeDay.x, top: activeDay.y - 10 }}
        >
          <strong className="mb-1.5 block font-medium">{formatDate(activeDay.date)}</strong>
          <span className="flex items-center justify-between gap-5 text-slate-400">
            <span className="flex items-center gap-2"><i className="size-2 rounded-sm bg-[var(--chart-4)]" />Resolvidos</span>
            <b className="font-mono font-medium text-white">{activeDay.resolved.toLocaleString("pt-BR")}</b>
          </span>
        </div>
      ) : null}
    </>
  );
}
