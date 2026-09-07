import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn(), client: vi.fn(), file: vi.fn(), report: vi.fn(), query: vi.fn(), claims: vi.fn(), reserve: vi.fn() }));
vi.mock("@/lib/dashboard-data", () => ({ getDashboardData: mocks.load }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/server/management-report-export", () => ({ buildManagementReportExport: mocks.report }));
vi.mock("@/server/report-download", () => ({ buildReportDownload: mocks.file }));
import { GET, POST } from "./route";

beforeEach(() => {
  mocks.load.mockResolvedValue({organization:{id:"org-1",name:"Company"}});
  mocks.report.mockReturnValue({filters:{period:"All time"}});
  mocks.file.mockResolvedValue({filename:"report.pdf",contentType:"application/pdf",content:Buffer.from("%PDF-fixture")});
  mocks.claims.mockResolvedValue({data:{claims:{sub:"signed-in-user"}}});
  const query = {select:vi.fn().mockReturnThis(),eq:mocks.query.mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:{telegram_user_id:42}})};
  mocks.reserve.mockResolvedValue({data:true});
  mocks.client.mockResolvedValue({auth:{getClaims:mocks.claims},from:()=>query,rpc:mocks.reserve});
  vi.stubEnv("TELEGRAM_BOT_TOKEN","TEST_ONLY");
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const post = (body:object, origin="https://app.test") => new Request("https://app.test/api/reports/export",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});

it("returns a PDF attachment, passing filters into the server selection", async () => {
  const response = await GET(new Request("https://app.test/api/reports/export?format=pdf&dateFrom=2026-09-01"));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toContain("attachment");
  expect(mocks.load).toHaveBeenCalledWith("reports",expect.objectContaining({dateFrom:"2026-09-01"}));
  expect(await response.text()).toBe("%PDF-fixture");
});
it("sends only to the signed-in user's Telegram, ignoring an injected recipient", async () => {
  const send = vi.fn().mockResolvedValue(Response.json({ok:true})); vi.stubGlobal("fetch",send);
  const response = await POST(post({format:"pdf",chat_id:999999}));
  expect(response.status).toBe(200);
  expect(mocks.query).toHaveBeenCalledWith("id","signed-in-user");
  const body = send.mock.calls[0][1].body as FormData;
  expect(body.get("chat_id")).toBe("42");
  expect(body.get("document")).toBeInstanceOf(Blob);
});
it("rejects cross-origin sends before accessing customer data", async () => {
  expect((await POST(post({format:"csv"},"https://attacker.test"))).status).toBe(403);
  expect(mocks.load).not.toHaveBeenCalled();
});
it("does not expose a partial report when a later page fails", async () => {
  mocks.load.mockRejectedValue(new Error("database page unavailable"));
  const response = await GET(new Request("https://app.test/api/reports/export?format=csv"));
  expect(response.status).toBe(503);
  expect(mocks.file).not.toHaveBeenCalled();
});
it("does not generate a file for an unauthenticated visitor", async () => {
  mocks.load.mockResolvedValue("UNAUTHENTICATED");
  expect((await GET(new Request("https://app.test/api/reports/export?format=csv"))).status).toBe(401);
  expect(mocks.file).not.toHaveBeenCalled();
});
it("enforces the delivery cooldown without sending", async () => {
  mocks.reserve.mockResolvedValue({data:false}); const send=vi.fn();vi.stubGlobal("fetch",send);
  expect((await POST(post({format:"pdf"}))).status).toBe(429);
  expect(send).not.toHaveBeenCalled();
});
