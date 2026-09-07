import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "test-user" } } }) } }) }));
vi.mock("@/domain/google-polyline", () => ({ decodeGooglePolyline: () => [[73, 49], [80, 46]] }));
vi.mock("@/server/osrm-routing", () => ({ osrmRoutes: vi.fn() }));
import { osrmRoutes } from "@/server/osrm-routing";
import { GET } from "./route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

it.each(["empty", "failure"])("retains Google's only valid route on secondary %s", async (mode) => {
  vi.stubEnv("GOOGLE_ROUTES_API_KEY", "test");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ routes: [{ distanceMeters: 1317000, duration: "54000s", polyline: { encodedPolyline: "test" } }] })));
  if (mode === "failure") vi.mocked(osrmRoutes).mockRejectedValue(new Error("Timeout"));
  else vi.mocked(osrmRoutes).mockResolvedValue(null);
  const response = await GET(new Request("https://test.invalid/api/routing?origin=49,73&destination=46,80"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ provider: "google", routes: [{ distanceKm: 1317 }] });
});
