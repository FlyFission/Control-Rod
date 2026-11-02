/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";

/** Written into every build output so a later build may safely clear it. */
const BUILD_MARKER = ".control-rod-build";

/**
 * API paths the control plane serves at the same origin; the dev and preview servers forward them.
 * Some are also pages of the app (/packages, /office): a browser loading one asks for HTML and gets
 * the app, as the control plane itself does in production.
 */
const apiPaths = [
  "/admin",
  "/auth",
  "/captures",
  "/events",
  "/health",
  "/metrics",
  "/office",
  "/packages",
  "/runs",
  "/runtimes",
  "/scrams",
];
/** Output and evidence files open as themselves, never as the app (as the control plane does). */
const OUTPUT_PATH = /^\/packages\/[^/?#]+\/(?:outputs\/|verification-evidence\/[^/?#]+\/)/;
const pageLoad = (req: { method?: string | undefined; url?: string | undefined; headers: { accept?: string | undefined } }) =>
  req.method === "GET" && req.headers.accept?.startsWith("text/html") && !OUTPUT_PATH.test(req.url ?? "") ? "/index.html" : undefined;
const target = process.env["CONTROL_ROD_API"] ?? "http://localhost:7300";

export default defineConfig(({ mode }) => {
  const draftBuild =
    (process.env["VITE_FLOOR_THEME_DRAFTS"] ??
      loadEnv(mode, process.cwd(), "VITE_")["VITE_FLOOR_THEME_DRAFTS"]) ===
    "true";
  let outDir = resolve("dist");
  let outsideRoot = false;
  // Set only once buildStart has accepted the output directory; a refused build must
  // never copy art into, or mark, a directory it does not own.
  let ownsOutput = false;
  return {
    plugins: [
      react(),
      {
        name: "floor-art-distribution",
        apply: "build",
        configResolved(config) {
          // Honour --outDir and build.outDir instead of assuming dist.
          outDir = resolve(config.root, config.build.outDir);
          const rel = relative(config.root, outDir);
          outsideRoot = rel.startsWith("..") || resolve(rel) === rel;
        },
        buildStart() {
          ownsOutput = false;
          // Vite keeps the contents of an output directory outside the project, so a draft
          // build followed by a release build into the same place would leave draft art and
          // the demo page behind. Clear outputs this build owns; refuse anything else.
          if (!outsideRoot || !existsSync(outDir)) {
            ownsOutput = true;
            return;
          }
          const entries = readdirSync(outDir);
          if (entries.length === 0) {
            ownsOutput = true;
            return;
          }
          if (!entries.includes(BUILD_MARKER))
            throw new Error(
              `Refusing to build into ${outDir}: it is not empty and was not created by a Control Rod build`,
            );
          for (const entry of entries)
            rmSync(resolve(outDir, entry), { recursive: true, force: true });
          ownsOutput = true;
        },
        closeBundle() {
          if (!ownsOutput) return;
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
          writeFileSync(
            resolve(out, BUILD_MARKER),
            JSON.stringify({ draft: draftBuild }) + "\n",
          );
        },
      },
    ],
    server: {
      port: 5173,
      proxy: Object.fromEntries(
        apiPaths.map((p) => [p, { target, changeOrigin: false, bypass: pageLoad }]),
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
