import assert from "node:assert/strict";
import test from "node:test";
import { readFrontendFile as readFile } from "./helpers/frontend-source.js";

import {
  buildDashboardHeatmap,
  dashboardHeatmapLevel,
} from "../app/features/dashboard/domain/dashboard-heatmap.js";

test("heatmap mantém grade contínua com rótulo do mês ancorado na coluna", () => {
  const heatmap = buildDashboardHeatmap(
    [
      { date: "2026-09-23", created: 3, resolved: 2 },
      { date: "2026-09-24", created: 1, resolved: 0 },
      { date: "2026-09-25", created: 2, resolved: 4 },
    ],
    { referenceDate: "2026-09-25", monthCount: 1 },
  );

  assert.equal(heatmap.total, 6);
  assert.equal(heatmap.max, 4);
  assert.equal(heatmap.firstDate, "2026-09-23");
  assert.equal(heatmap.lastDate, "2026-09-25");
  assert.equal(heatmap.weeks.length, 4);
  assert.deepEqual(heatmap.labels, [{ year: 2026, month: 8, weekIndex: 0 }]);
  // September starts on Tuesday: August 31st is transparent leading padding.
  assert.deepEqual(heatmap.weeks[0]![0], {
    date: "2026-08-31",
    created: 0,
    count: 0,
    resolved: 0,
    inWindow: false,
    inPeriod: false,
  });
  assert.deepEqual(heatmap.weeks[0]![1], {
    date: "2026-09-01",
    created: 0,
    count: 0,
    resolved: 0,
    inWindow: true,
    inPeriod: false,
  });
  const periodWeek = heatmap.weeks[3]!;
  assert.equal(periodWeek.length, 7);
  assert.deepEqual(periodWeek[2], {
    date: "2026-09-23",
    created: 3,
    count: 2,
    resolved: 2,
    inWindow: true,
    inPeriod: true,
  });
});

test("heatmap usa janela fixa com meses vazios e mês atual por último", () => {
  const heatmap = buildDashboardHeatmap(
    [{ date: "2026-09-10", created: 5, resolved: 3 }],
    { referenceDate: "2026-09-25", monthCount: 4 },
  );

  assert.deepEqual(
    heatmap.labels.map((label) => [label.year, label.month, label.weekIndex]),
    [
      [2026, 5, 0],
      [2026, 6, 4],
      [2026, 7, 8],
      [2026, 8, 13],
    ],
  );
  assert.equal(heatmap.weeks.length, 17);
  assert.equal(heatmap.total, 3);
  assert.equal(heatmap.max, 3);
  const emptyMonths = heatmap.weeks
    .flatMap((week) => week)
    .filter(
      (day) =>
        day.date >= "2026-06-01" &&
        day.date <= "2026-08-31",
    );
  assert.ok(emptyMonths.length >= 90);
  assert.ok(emptyMonths.every((day) => day.inWindow && !day.inPeriod));
});

test("heatmap corta dias futuros do mês atual e o início da janela", () => {
  const heatmap = buildDashboardHeatmap(
    [{ date: "2026-09-24", created: 1, resolved: 1 }],
    { referenceDate: "2026-09-25", monthCount: 12 },
  );

  assert.equal(heatmap.labels.length, 12);
  assert.deepEqual(heatmap.labels[0], { year: 2025, month: 9, weekIndex: 0 });
  assert.deepEqual(heatmap.labels[11], { year: 2026, month: 8, weekIndex: 48 });
  assert.equal(heatmap.weeks.length, 52);
  const days = heatmap.weeks.flatMap((week) => week);
  assert.ok(
    days
      .filter((day) => day.date > "2026-09-25")
      .every((day) => !day.inWindow),
  );
  assert.ok(
    days
      .filter((day) => day.date >= "2025-10-01" && day.date <= "2026-09-25")
      .every((day) => day.inWindow),
  );
  assert.ok(
    days
      .filter((day) => day.date < "2025-10-01")
      .every((day) => !day.inWindow),
  );
});

test("heatmap atravessa a virada do mês na mesma coluna contínua", () => {
  const heatmap = buildDashboardHeatmap(
    [
      { date: "2026-08-28", created: 2, resolved: 1 },
      { date: "2026-08-29", created: 0, resolved: 0 },
      { date: "2026-08-30", created: 1, resolved: 0 },
      { date: "2026-08-31", created: 0, resolved: 0 },
      { date: "2026-09-01", created: 4, resolved: 2 },
      { date: "2026-09-02", created: 1, resolved: 1 },
    ],
    { referenceDate: "2026-09-30", monthCount: 2 },
  );

  const turnoverWeek = heatmap.weeks[5]!;
  assert.deepEqual(
    turnoverWeek.slice(0, 3).map((day) => [day.date, day.inWindow]),
    [
      ["2026-08-31", true],
      ["2026-09-01", true],
      ["2026-09-02", true],
    ],
  );
  assert.deepEqual(turnoverWeek.slice(0, 3).map((day) => day.inPeriod), [
    true,
    true,
    true,
  ]);
  assert.ok(heatmap.labels.some((label) => label.month === 8));
});

test("heatmap sem dados mantém a janela de meses", () => {
  const heatmap = buildDashboardHeatmap([], {
    referenceDate: "2026-09-25",
    monthCount: 3,
  });

  assert.equal(heatmap.labels.length, 3);
  assert.ok(heatmap.weeks.length > 0);
  assert.equal(heatmap.total, 0);
  assert.equal(heatmap.max, 0);
  assert.equal(heatmap.firstDate, null);
  assert.equal(heatmap.lastDate, null);
  assert.throws(
    () => buildDashboardHeatmap([], { referenceDate: "25/09/2026" }),
    /ISO/,
  );
});

test("nível do quadrado escurece conforme o volume diário", () => {
  assert.equal(dashboardHeatmapLevel(0, 4), 0);
  assert.equal(dashboardHeatmapLevel(1, 4), 1);
  assert.equal(dashboardHeatmapLevel(2, 4), 2);
  assert.equal(dashboardHeatmapLevel(3, 4), 3);
  assert.equal(dashboardHeatmapLevel(4, 4), 4);
  assert.equal(dashboardHeatmapLevel(9, 0), 0);
});

test("componente renderiza grade única com rótulos posicionados por semana", async () => {
  const component = await readFile(
    new URL(
      "../app/features/dashboard/components/dashboard-activity-heatmap.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(component, /HEATMAP_MONTH_WINDOW = 12/);
  assert.match(component, /HEATMAP_WEEK_PX = 18/);
  assert.match(component, /heatmap\.labels\.map/);
  assert.match(component, /label\.weekIndex \* HEATMAP_WEEK_PX/);
  assert.match(component, /grid-flow-col grid-rows-7/);
  assert.match(component, /monthLabels = \[/);
  assert.match(component, /"set\."/, );
  assert.match(component, /!day\.inWindow/);
});
