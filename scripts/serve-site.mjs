#!/usr/bin/env node
/**
 * Serves the static landing site locally (default http://localhost:7310), building
 * `site/dist/` first so fonts, agent marks, SVGs, and screenshots are served from one root
 * with zero external requests.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, normalize, resolve, sep } from "node:path";
import { buildSite } from "./build-site.mjs";

const DIST = buildSite();
const PORT = Number(process.env.SITE_PORT || 7310);
// Loopback by default: a local preview should not be reachable from the network.
const HOST = process.env.SITE_HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
  "": "text/plain; charset=utf-8",
};

const server = createServer((req, res) => {
  let rel;
  try {
    const urlPath = new URL(req.url || "/", "http://localhost").pathname;
    rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.(\/|\\|$))+/, "");
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }
  let filePath = resolve(DIST, "." + (rel === "/" ? "/index.html" : rel));
  if (filePath !== DIST && !filePath.startsWith(DIST + sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = resolve(filePath, "index.html");
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-cache",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'",
  });
  res.end(readFileSync(filePath));
});

server.listen(PORT, HOST, () => {
  console.log(`Control Rod landing page listening on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
});
