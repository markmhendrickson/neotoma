import { describe, expect, it } from "vitest";
import {
  querySettledWithoutData,
  showBackgroundQueryRefresh,
  showInitialQuerySkeleton,
  showRouteDetailSkeleton,
} from "./query_loading";

function querySlice(overrides: Partial<ReturnType<typeof baseQuery>>) {
  return { ...baseQuery(), ...overrides };
}

function baseQuery() {
  return {
    data: undefined as unknown,
    fetchStatus: "idle" as const,
    isPending: false,
    isPlaceholderData: false,
  };
}

describe("showInitialQuerySkeleton", () => {
  it("returns true while fetching with no data", () => {
    expect(
      showInitialQuerySkeleton(
        querySlice({ fetchStatus: "fetching", isPending: true }),
      ),
    ).toBe(true);
  });

  it("returns true for keepPreviousData placeholder rows", () => {
    expect(
      showInitialQuerySkeleton(
        querySlice({
          data: [{ id: "old" }],
          fetchStatus: "fetching",
          isPlaceholderData: true,
        }),
      ),
    ).toBe(true);
  });

  it("returns false when cached data is shown without placeholder", () => {
    expect(
      showInitialQuerySkeleton(
        querySlice({ data: [{ id: "x" }], fetchStatus: "idle" }),
      ),
    ).toBe(false);
  });
});

describe("showRouteDetailSkeleton", () => {
  it("returns true when data does not match the route id during fetch", () => {
    expect(
      showRouteDetailSkeleton(
        querySlice({
          data: { entity_id: "ent_a" },
          fetchStatus: "fetching",
        }),
        (d) => (d as { entity_id: string }).entity_id === "ent_b",
      ),
    ).toBe(true);
  });

  it("returns false when data matches the route", () => {
    expect(
      showRouteDetailSkeleton(
        querySlice({ data: { entity_id: "ent_a" }, fetchStatus: "idle" }),
        (d) => (d as { entity_id: string }).entity_id === "ent_a",
      ),
    ).toBe(false);
  });
});

describe("querySettledWithoutData", () => {
  it("is false while pending or fetching", () => {
    expect(querySettledWithoutData(querySlice({ isPending: true }))).toBe(false);
    expect(querySettledWithoutData(querySlice({ fetchStatus: "fetching" }))).toBe(false);
  });

  it("is true after fetch completes with no data", () => {
    expect(querySettledWithoutData(querySlice({ fetchStatus: "idle" }))).toBe(true);
  });
});

describe("showBackgroundQueryRefresh", () => {
  it("returns true when refetching with visible cache", () => {
    expect(
      showBackgroundQueryRefresh(
        querySlice({ data: {}, fetchStatus: "fetching" }),
      ),
    ).toBe(true);
  });
});
