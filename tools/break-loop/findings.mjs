#!/usr/bin/env node
// Merges one live run's findings into the ledger and says what the loop should do next.
//
//   node tools/break-loop/findings.mjs merge   [--run <dir>]   fold this run's findings into the ledger
//   node tools/break-loop/findings.mjs next                    print the worst open finding as JSON
//   node tools/break-loop/findings.mjs set <key-prefix> <status> [note]
//                                                              status: open | fixed | wontfix | owner
//   node tools/break-loop/findings.mjs summary                 a table for a pull request or a reply
//
// `merge` exits 0 when this run found nothing the ledger did not already know, and 10 when it found
// something new (or a fixed finding came back), so a loop can stop on 0.
//
// Ledger: apps/web/e2e/live/ledger.json, committed. Keys are normalized (ids and numbers removed),
// so the same problem in two runs is one entry. A finding seen again after "fixed" reopens, and
// counts as new: a fix that did not hold is the most important thing a pass can find.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const ledgerPath = join(root, "apps/web/e2e/live/ledger.json");
const SEVERITY = { critical: 0, major: 1, minor: 2 };
const PASS = { break: 0, functional: 1, a11y: 2, persona: 3 };

const load = () => (existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : { version: 1, findings: {} });
const save = (l) => {
  const sorted = Object.fromEntries(Object.entries(l.findings).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(ledgerPath, `${JSON.stringify({ ...l, findings: sorted }, null, 2)}\n`);
};
const rank = (f) => [f.status === "open" ? 0 : 1, SEVERITY[f.severity] ?? 3, PASS[f.pass] ?? 4, -(f.browsers?.length ?? 0), f.first_seen];
const cmp = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };

function readRun(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

const [cmd = "summary", ...rest] = process.argv.slice(2);
const ledger = load();
const today = new Date().toISOString().slice(0, 10);

if (cmd === "merge") {
  const at = rest.indexOf("--run");
  const dir = at >= 0 ? resolve(rest[at + 1]) : join(root, "apps/web/test-results/live-findings");
  const run = readRun(dir);
  let fresh = 0;
  for (const f of run) {
    const known = ledger.findings[f.key];
    if (!known) {
      ledger.findings[f.key] = { severity: f.severity, pass: f.pass, title: f.title, detail: f.detail, test: f.test, browsers: [f.browser], evidence: f.evidence ?? [], status: "open", first_seen: today, last_seen: today, seen: 1, notes: [] };
      fresh++;
      continue;
    }
    if (known.status === "fixed") {
      known.status = "open";
      known.notes.push(`${today}: seen again after being marked fixed`);
      fresh++;
    }
    known.last_seen = today;
    known.seen += 1;
    known.detail = f.detail;
    if (!known.browsers.includes(f.browser)) known.browsers.push(f.browser);
    if ((SEVERITY[f.severity] ?? 3) < (SEVERITY[known.severity] ?? 3)) known.severity = f.severity;
  }
  save(ledger);
  const open = Object.values(ledger.findings).filter((f) => f.status === "open").length;
  console.log(`run: ${run.length} findings, ${fresh} new or reopened; ledger: ${open} open`);
  process.exit(fresh > 0 ? 10 : 0);
}

if (cmd === "next") {
  const [key, f] = Object.entries(ledger.findings).filter(([, f]) => f.status === "open").sort(([, a], [, b]) => cmp(a, b))[0] ?? [];
  console.log(JSON.stringify(key ? { key, ...f } : null, null, 2));
  process.exit(key ? 0 : 1);
}

if (cmd === "set") {
  const [prefix, status, ...note] = rest;
  if (!prefix || !["open", "fixed", "wontfix", "owner"].includes(status)) {
    console.error("usage: set <key-prefix> <open|fixed|wontfix|owner> [note]");
    process.exit(2);
  }
  const hits = Object.keys(ledger.findings).filter((k) => k.startsWith(prefix));
  if (hits.length !== 1) {
    console.error(`${hits.length} findings match "${prefix}"; give a longer prefix`);
    process.exit(2);
  }
  const f = ledger.findings[hits[0]];
  f.status = status;
  if (note.length) f.notes.push(`${today}: ${note.join(" ")}`);
  save(ledger);
  console.log(`${hits[0]} -> ${status}`);
  process.exit(0);
}

if (cmd === "summary") {
  const all = Object.entries(ledger.findings).sort(([, a], [, b]) => cmp(a, b));
  console.log("| Status | Severity | Pass | Finding | Browsers | Test |\n|---|---|---|---|---|---|");
  for (const [, f] of all) console.log(`| ${f.status} | ${f.severity} | ${f.pass} | ${f.title.replace(/\|/g, "/")} | ${f.browsers.join(", ")} | ${f.test.replace(/\|/g, "/")} |`);
  process.exit(0);
}

console.error(`unknown command ${cmd}`);
process.exit(2);
