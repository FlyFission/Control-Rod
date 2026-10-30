/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  mkdirSync,
} from "node:fs";
import { resolve } from "node:path";

/** API paths the control plane serves at the same origin; the dev server forwards them. */
const apiPaths = [
  "/auth",
  "/captures",
  "/packages",
  "/office",
  "/events",
  "/metrics",
  "/health",
];
const target = process.env["CONTROL_ROD_API"] ?? "http://localhost:7300";

export default defineConfig(({ mode }) => {
  const draftBuild =
    (process.env["VITE_FLOOR_THEME_DRAFTS"] ??
      loadEnv(mode, process.cwd(), "VITE_")["VITE_FLOOR_THEME_DRAFTS"]) ===
    "true";
  let outDir = resolve("dist");
  return {
    plugins: [
      react(),
      {
        name: "floor-art-distribution",
        apply: "build",
        configResolved(config) {
          // Honour --outDir and build.outDir instead of assuming dist.
          outDir = resolve(config.root, config.build.outDir);
        },
        closeBundle() {
          const publicRoot = resolve("public"),
            out = outDir;
          if (!existsSync(publicRoot)) return;
          for (const name of readdirSync(publicRoot))
            if (name !== "floor-themes")
              cpSync(resolve(publicRoot, name), resolve(out, name), {
                recursive: true,
              });
          const art = resolve(publicRoot, "floor-themes");
          if (!existsSync(art)) return;
          const records = JSON.parse(
            readFileSync(
              resolve("src/features/floor/themes/release-manifest.json"),
              "utf8",
            ),
          ) as { packId: string }[];
          if (!Array.isArray(records))
            throw new Error("Invalid theme release manifest");
          const ids = draftBuild
            ? readdirSync(art)
            : records.map((r) => r.packId);
          for (const id of ids) {
            if (!/^[a-z-]+$/.test(id))
              throw new Error("Invalid theme distribution ID");
            const manifest = JSON.parse(
              readFileSync(resolve(art, id, "assets.json"), "utf8"),
            ) as { assets: { path: string }[] };
            const destination = resolve(out, "floor-themes", id);
            mkdirSync(destination, { recursive: true });
            for (const asset of manifest.assets) {
              if (!/^[a-z0-9-]+\.[a-f0-9]{12}\.svg$/.test(asset.path))
                throw new Error("Invalid public theme asset path");
              cpSync(
                resolve(art, id, asset.path),
                resolve(destination, asset.path),
              );
            }
            for (const file of ["assets.json", "NOTICE.txt"])
              if (existsSync(resolve(art, id, file)))
                cpSync(resolve(art, id, file), resolve(destination, file));
          }
        },
      },
    ],
    server: {
      port: 5173,
      proxy: Object.fromEntries(
        apiPaths.map((p) => [p, { target, changeOrigin: false }]),
      ),
    },
    build: {
      outDir: "dist",
      copyPublicDir: false,
      sourcemap: false,
      rollupOptions: {
        input: draftBuild
          ? { app: "index.html", themes: "themes.html" }
          : { app: "index.html" },
      },
    },
    test: {
      environment: "jsdom",
      environmentOptions: { jsdom: { url: "http://localhost:3000/" } },
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
