import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Dev-only proxies. Kalshi also needs a proxy in prod (no CORS header) —
    // see api/kalshi/[...path].ts. Polymarket is fetched directly in prod; these
    // proxies just keep `vite dev` working behind TLS-intercepting networks.
    proxy: {
      "/api/kalshi": {
        target: "https://api.elections.kalshi.com/trade-api/v2",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/kalshi/, ""),
      },
      "/pm-clob": {
        target: "https://clob.polymarket.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/pm-clob/, ""),
      },
      "/pm-gamma": {
        target: "https://gamma-api.polymarket.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/pm-gamma/, ""),
      },
    },
  },
});
