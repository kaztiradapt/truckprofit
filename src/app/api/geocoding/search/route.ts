import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NominatimResult = {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string | undefined>;
};

function cityFromAddress(address: NominatimResult["address"]): string | null {
  if (!address) return null;
  return address.city
    ?? address.town
    ?? address.village
    ?? address.municipality
    ?? address.county
    ?? address.state
    ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return Response.json({ error: "Требуется вход." }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3 || query.length > 200) {
    return Response.json({ error: "Введите минимум 3 символа адреса." }, { status: 400 });
  }

  const baseUrl = process.env.GEOCODING_BASE_URL?.trim() || "https://nominatim.openstreetmap.org";
  const url = new URL("search", `${baseUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("accept-language", "ru,kk,en");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Referer: "https://fleet-economics.vercel.app/",
        "User-Agent": process.env.GEOCODING_USER_AGENT?.trim() || "TruckProfit/0.1 (https://fleet-economics.vercel.app)",
      },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return Response.json({ error: "Сервис поиска адресов временно недоступен." }, { status: 503 });
    }

    const raw = await response.json() as NominatimResult[];
    const results = raw.flatMap((item) => {
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      if (!item.display_name || !Number.isFinite(latitude) || !Number.isFinite(longitude)
        || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return [];
      return [{
        id: String(item.place_id ?? `${latitude}:${longitude}`),
        label: item.display_name,
        city: cityFromAddress(item.address),
        latitude,
        longitude,
      }];
    });

    return Response.json(
      { results },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch {
    return Response.json({ error: "Не удалось выполнить поиск адреса." }, { status: 503 });
  }
}

