/**
 * What a person does on the board, as reusable steps. Every locator goes by role and visible words,
 * the way a person (or a screen reader) finds things, so a step that breaks here breaks for people too.
 */
import type { Page } from "@playwright/test";
import { expect } from "./fixtures.js";
import type { Stack } from "./stack.js";

/** The fake intake (tests/e2e/fake/intake.sh) drafts two dependent packages for a "scope of work" request. */
export const SCOPE_REQUEST = "Write the scope of work for replacing pump P-101";
export const SURVEY = "Field survey summary";
export const SOW = "Scope of work";

export async function addCard(page: Page, text: string): Promise<void> {
  await page.getByRole("button", { name: "+ Quick add" }).click();
  const field = page.getByPlaceholder("What needs doing? Enter adds it");
  await field.fill(text);
  await field.press("Enter");
  await expect(captureCard(page, text)).toBeVisible();
  await page.keyboard.press("Escape");
}

export const captureCard = (page: Page, text: string) =>
  page.getByRole("article", { name: new RegExp(escape(text.slice(0, 60)), "i") });

export async function classify(page: Page, text: string, lane = "internal"): Promise<void> {
  const card = captureCard(page, text);
  await card.getByLabel("Data lane").selectOption(lane);
  await card.getByRole("button", { name: "Classify" }).click();
}

/** A package card on the board, by package id (titles repeat: every scripted intake drafts the same two). */
export const card = (page: Page, id: string) => page.locator(".bd-card").filter({ hasText: id }).first();

export interface Pkg { id: string; title: string; status: string; revision: number }
export async function packages(page: Page, stack: Stack): Promise<Pkg[]> {
  const r = await page.context().request.get(`${stack.url}/packages`);
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as Pkg[];
}

/**
 * Types a scope request on the board, classifies it, and waits for intake to draft its two packages.
 * Returns their ids. Unique text per call keeps tests that share a stack apart.
 */
export async function draftPair(page: Page, stack: Stack, tag: string): Promise<{ survey: string; sow: string; request: string }> {
  const before = new Set((await packages(page, stack)).map((p) => p.id));
  const request = `${SCOPE_REQUEST} (${tag} ${Date.now().toString(36)})`;
  await addCard(page, request);
  await classify(page, request);
  let fresh: Pkg[] = [];
  await expect.poll(async () => (fresh = (await packages(page, stack)).filter((p) => !before.has(p.id))).length, { timeout: 60000 }).toBe(2);
  const survey = fresh.find((p) => p.id.endsWith("-SURVEY"))!.id;
  const sow = fresh.find((p) => p.id.endsWith("-SOW"))!.id;
  await expect(card(page, survey)).toBeVisible({ timeout: 30000 });
  return { survey, sow, request };
}

/** Opens the review drawer from the card, presses Release, and waits until the release is recorded. */
export async function releaseFromBoard(page: Page, stack: Stack, id: string): Promise<void> {
  await card(page, id).locator(".bd-title").click();
  await drawer(page).getByRole("button", { name: "Release", exact: true }).click();
  await expect.poll(async () => (await decisionsOf(page, stack, id)).some((d) => d.kind === "release"), { timeout: 20000 }).toBe(true);
}

export async function decisionsOf(page: Page, stack: Stack, id: string): Promise<{ kind: string }[]> {
  const r = await page.context().request.get(`${stack.url}/packages/${id}`);
  return ((await r.json()) as { decisions: { kind: string }[] }).decisions;
}

/** A board column, by its heading ("Ready", "Being checked", "Ready to accept", "Accepted", ...). */
export const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

export async function openCase(page: Page, stack: Stack, id: string): Promise<void> {
  await page.goto(`${stack.url}/packages/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Waits, re-reading the page, until `text` shows. Runs happen in the daemon, so this is polling a real system. */
export async function waitForText(page: Page, text: string | RegExp, timeout = 60000): Promise<void> {
  await expect(page.getByText(text).first()).toBeVisible({ timeout });
}

export async function signOverride(page: Page, reason = "Live test: only the scripted runtime is installed on this machine."): Promise<void> {
  await page.getByLabel("Why may this pre-check run on the author's runtime?").fill(reason);
  await page.getByRole("button", { name: "Sign with passkey and proceed" }).click();
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The board's review drawer (cards carry their own action buttons too, so scope drawer buttons to it). */
export const drawer = (page: Page) => page.getByRole("complementary", { name: /^Review / });
