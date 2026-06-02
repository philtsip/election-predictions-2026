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
    // Mirror the prod Vercel Edge proxy so Kalshi works in `vite dev` too.
    proxy: {
      "/api/kalshi": {
        target: "https://api.elections.kalshi.com/trade-api/v2",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/kalshi/, ""),
      },
    },
  },
});
