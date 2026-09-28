export interface DashboardHeatmapDay {
  date: string;
  count: number;
  created: number;
  resolved: number;
  /** False for padding squares outside the rolling month window. */
  inWindow: boolean;
  /** False for window days outside the selected period (no tooltip/level). */
  inPeriod: boolean;
}

/** Month label anchored to the week column where the month starts. */
export interface DashboardHeatmapLabel {
  year: number;
  /** Zero-based month index. */
  month: number;
  /** Index of the continuous week column containing the first day of the month. */
  weekIndex: number;
}

export interface DashboardHeatmapData {
  /** Continuous week columns from Monday to Sunday. */
  weeks: DashboardHeatmapDay[][];
  labels: DashboardHeatmapLabel[];
  total: number;
  max: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface DashboardHeatmapOptions {
  /** ISO date (YYYY-MM-DD) that defines the current month. */
  referenceDate: string;
  /** Defaults to 12 months. */
  monthCount?: number;
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const dayMs = 86_400_000;

function parseDashboardDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDashboardDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mondayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

export function buildDashboardHeatmap(
  items: Array<{ date: string; resolved: number; created?: number }>,
  options: DashboardHeatmapOptions,
): DashboardHeatmapData {
  if (!isoDatePattern.test(options.referenceDate)) {
    throw new Error("A data de referência do heatmap deve ser ISO (YYYY-MM-DD).");
  }
  const monthCount = Math.max(1, Math.floor(options.monthCount ?? 12));
  const counts = new Map(
    items
      .filter((item) => isoDatePattern.test(item.date))
      .map((item) => [item.date, {
        created: item.created ?? 0,
        resolved: item.resolved,
        count: item.resolved,
      }] as const),
  );

  const reference = parseDashboardDate(options.referenceDate);
  const endMonth = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1),
  );
  const startMonth = new Date(
    Date.UTC(
      endMonth.getUTCFullYear(),
      endMonth.getUTCMonth() - monthCount + 1,
      1,
    ),
  );
  const lastOfEndMonth = new Date(
    Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() + 1, 0),
  );
  const windowEnd = new Date(
    Date.UTC(
      endMonth.getUTCFullYear(),
      endMonth.getUTCMonth(),
      Math.min(lastOfEndMonth.getUTCDate(), reference.getUTCDate()),
    ),
  );
  const gridStart = new Date(startMonth);
  gridStart.setUTCDate(gridStart.getUTCDate() - mondayIndex(gridStart));

  const weeks: DashboardHeatmapDay[][] = [];
  let week: DashboardHeatmapDay[] = [];
  const cursor = new Date(gridStart);
  while (cursor.getTime() <= windowEnd.getTime()) {
    const date = formatDashboardDate(cursor);
    const inWindow =
      cursor.getTime() >= startMonth.getTime() &&
      cursor.getTime() <= windowEnd.getTime();
    week.push({
      date,
      count: counts.get(date)?.count ?? 0,
      created: counts.get(date)?.created ?? 0,
      resolved: counts.get(date)?.resolved ?? 0,
      inWindow,
      inPeriod: inWindow && counts.has(date),
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (week.length) {
    while (week.length < 7) {
      week.push({
        date: formatDashboardDate(cursor),
        count: 0,
        created: 0,
        resolved: 0,
        inWindow: false,
        inPeriod: false,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  const labels: DashboardHeatmapLabel[] = [];
  const labelCursor = new Date(startMonth);
  while (labelCursor.getTime() <= windowEnd.getTime()) {
    const weekIndex = Math.floor(
      (labelCursor.getTime() - gridStart.getTime()) / dayMs / 7,
    );
    labels.push({
      year: labelCursor.getUTCFullYear(),
      month: labelCursor.getUTCMonth(),
      weekIndex,
    });
    labelCursor.setUTCMonth(labelCursor.getUTCMonth() + 1);
  }

  const windowStartKey = formatDashboardDate(startMonth);
  const windowEndKey = formatDashboardDate(windowEnd);
  const windowCounts = [...counts.entries()].filter(
    ([date]) => date >= windowStartKey && date <= windowEndKey,
  );
  const windowDates = windowCounts.map(([date]) => date).toSorted();

  return {
    weeks,
    labels,
    total: windowCounts.reduce((sum, [, counts]) => sum + counts.count, 0),
    max: Math.max(0, ...windowCounts.map(([, counts]) => counts.count)),
    firstDate: windowDates[0] ?? null,
    lastDate: windowDates[windowDates.length - 1] ?? null,
  };
}

export function dashboardHeatmapLevel(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}
