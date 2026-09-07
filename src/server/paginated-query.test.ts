import { expect, it } from "vitest";
import { fetchAllRows, fetchRowsByIds } from "./paginated-query";

it("loads beyond the former 500/2000 limits, even with a lower API page cap", async () => {
  const source = Array.from({ length: 2537 }, (_, id) => ({ id }));
  const result = await fetchAllRows(() => ({ range: async (from, to) => ({ data: source.slice(from, Math.min(to + 1, from + 100)), error: null }) }));
  expect(result.data).toEqual(source);
});
it("does not emit partial totals after a later page fails", async () => {
  const result = await fetchAllRows(() => ({ range: async (from) => from === 0 ? { data: [1], error: null } : { data: null, error: { message: "failed" } } }));
  expect(result.data).toBeNull();
  expect(result.error).not.toBeNull();
});
it("fails explicitly on the safety ceiling", async () => {
  const result = await fetchAllRows(() => ({ range: async () => ({ data: [1, 2], error: null }) }), 1);
  expect(result.error?.code).toBe("REPORT_TOO_LARGE");
});
it("batches related IDs without dropping rows", async () => {
  const ids = Array.from({ length: 501 }, (_, i) => String(i));
  const result = await fetchRowsByIds(ids, (batch) => ({ range: async (from, to) => ({ data: batch.slice(from, to + 1), error: null }) }));
  expect(result.data).toEqual(ids);
});
