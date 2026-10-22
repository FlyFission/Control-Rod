/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** API paths the control plane serves at the same origin; the dev server forwards them. */
const apiPaths = ["/auth", "/captures", "/packages", "/office", "/events", "/metrics", "/health"];
const target = process.env["CONTROL_ROD_API"] ?? "http://localhost:7300";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(apiPaths.map((p) => [p, { target, changeOrigin: false }])),
  },
  build: { outDir: "dist", sourcemap: false },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost:3000/" } },
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
