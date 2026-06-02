/**
 * CORS pass-through proxy for the Kalshi public API.
 *
 * Kalshi's API does not send `Access-Control-Allow-Origin`, so the browser
 * blocks direct fetches. This Edge function forwards `/api/kalshi/<path>` to
 * `https://api.elections.kalshi.com/trade-api/v2/<path>` and adds the CORS
 * header. It holds no secrets and adds no logic — purely a shim.
 *
 * Polymarket already sends `access-control-allow-origin: *`, so it is fetched
 * directly from the browser and needs no proxy.
 */
export const config = { runtime: "edge" };

const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/kalshi/, "");
  const target = `${KALSHI}${path}${url.search}`;

  const upstream = await fetch(target, {
    headers: { accept: "application/json" },
  });
  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=15, stale-while-revalidate=30",
    },
  });
}
