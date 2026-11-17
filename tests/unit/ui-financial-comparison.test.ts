import { describe, expect, it } from "vitest";
import { comparisonSeries } from "@/lib/charts/comparison";
import { portfolioValueSeries } from "@/lib/portfolio/series";

const day = 86_400_000;
const point = (dayNumber: number, p: number) => ({ t: dayNumber * day, p });

describe("financial comparison", () => {
  it("uses the common window and the last known observation, never a future one", () => {
    const result = comparisonSeries([
      { id: "a", source: "closes", points: [point(1, 10), point(3, 30), point(5, 50)] },
      { id: "b", source: "closes", points: [point(2, 20), point(4, 40), point(6, 60)] },
    ]);
    expect(result.bounds).toEqual({ start: 2 * day, end: 5 * day });
    expect(result.series[0]!.points[0]).toMatchObject({ t: 2 * day, p: 10, observedAt: day });
    expect(result.series[1]!.points.at(-1)).toMatchObject({ t: 5 * day, p: 40, observedAt: 4 * day });
  });

  it("marks stale observations as gaps and rejects disjoint windows", () => {
    const result = comparisonSeries([
      { id: "a", source: "closes", points: [point(1, 10), point(10, 20)] },
      { id: "b", source: "closes", points: [point(1, 5), point(6, 6), point(10, 7)] },
    ]);
    expect(result.series[0]!.hasGaps).toBe(true);
    expect(result.series[0]!.points.find((row) => row.t === 6 * day)?.gap).toBe(true);
    expect(comparisonSeries([{ id: "a", points: [point(1, 1), point(2, 2)] }, { id: "b", points: [point(3, 1), point(4, 2)] }]).bounds).toBeNull();
  });

  it("values the complete current composition without forcing the last value to today's total", () => {
    const positions = [{ shares: 2 }, { shares: 3 }];
    const histories = [[point(1, 10), point(2, 12)], [point(1, 5), point(2, 6)]];
    const values = portfolioValueSeries(positions, histories, 4, 999, ["closes", "closes"]);
    expect(values.map((row) => row.p)).toEqual([39, 46]);
    expect(portfolioValueSeries(positions, [histories[0]!, []], 4, 999)).toEqual([]);
  });
});
