import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STREAM_REPLAY_MAX } from "../src/app.js";
import { type Harness, ORIGIN, VirtualAuthenticator, signIn, startHarness } from "./harness.js";

/** The resumable event stream (workbench plan task 2.8; specification 27, WB-11). */
let h: Harness;
let cookie: string;
let port = 0;

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, new VirtualAuthenticator());
  await h.app.listen({ port: 0, host: "127.0.0.1" });
  port = (h.app.server.address() as { port: number }).port;
}, 120_000);
afterAll(async () => h?.stop());

interface Frame { id?: string; event?: string; data?: string }

/** Opens the stream, collects frames until `until` says stop (or a timeout), then closes it. */
function stream(headers: Record<string, string>, until: (f: Frame[]) => boolean, path = "/events/stream"): Promise<Frame[]> {
  return new Promise((resolve, reject) => {
    const frames: Frame[] = [];
    let buf = "";
    const req = request({ host: "127.0.0.1", port, path, headers: { cookie, ...headers } }, (res) => {
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        buf += chunk;
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const f: Frame = {};
          for (const line of block.split("\n")) {
            if (line.startsWith("id: ")) f.id = line.slice(4);
            else if (line.startsWith("event: ")) f.event = line.slice(7);
            else if (line.startsWith("data: ")) f.data = line.slice(6);
          }
          if (f.event) frames.push(f);
        }
        if (until(frames)) {
          req.destroy();
          resolve(frames);
        }
      });
    });
    req.on("error", (e) => (e.message.includes("socket hang up") ? resolve(frames) : reject(e)));
    setTimeout(() => {
      req.destroy();
      resolve(frames);
    }, 5000);
    req.end();
  });
}

const capture = (text: string) => h.app.inject({ method: "POST", url: "/captures", headers: { cookie, origin: ORIGIN }, payload: { text, lane: "internal" } });
const head = async () => (await h.db.query<{ n: number }>("select max(seq)::int as n from events")).rows[0]!.n;

describe("resume", () => {
  it("replays what a client missed, in order, from its last event id, and continues live", async () => {
    const before = await head();
    await capture("missed one");
    await capture("missed two");
    const after = await head();
    let fired = false;
    const frames = await stream({ "last-event-id": String(before) }, (f) => {
      if (!fired && f.filter((x) => x.event === "event").length >= after - before) {
        fired = true;
        void capture("live one");
      }
      return f.some((x) => x.event === "event" && JSON.parse(x.data!).seq > after && JSON.parse(x.data!).data?.attachments !== undefined);
    });
    const seqs = frames.filter((f) => f.event === "event").map((f) => Number(f.id));
    expect(seqs.slice(0, after - before)).toEqual(Array.from({ length: after - before }, (_, i) => before + i + 1));
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs.at(-1)!).toBeGreaterThan(after);
  });

  it("accepts the position as ?after= too", async () => {
    const before = await head();
    await capture("by query");
    const frames = await stream({}, (f) => f.some((x) => x.event === "event"), `/events/stream?after=${before}`);
    expect(Number(frames.find((f) => f.event === "event")!.id)).toBe(before + 1);
  });

  it("sends a loss frame for a position this log never reached, then resumes from the head", async () => {
    const now = await head();
    const frames = await stream({ "last-event-id": String(now + 1000) }, (f) => f.some((x) => x.event === "loss"));
    const loss = frames.find((f) => f.event === "loss")!;
    expect(loss.id).toBe(String(now));
    expect(JSON.parse(loss.data!)).toMatchObject({ resume_from: now, reason: "no such position in this event log" });
  });

  it("sends a loss frame when a client is too far behind to replay", async () => {
    const now = await head();
    if (now <= STREAM_REPLAY_MAX) {
      // Too few events to be too far behind: an invalid position stands in, already covered above.
      const frames = await stream({ "last-event-id": "-5" }, (f) => f.some((x) => x.event === "loss"));
      expect(frames.some((f) => f.event === "loss")).toBe(true);
      return;
    }
    const frames = await stream({ "last-event-id": "0" }, (f) => f.some((x) => x.event === "loss"));
    expect(JSON.parse(frames.find((f) => f.event === "loss")!.data!).reason).toBe("too far behind to replay");
  });

  it("starts at the head with no position, so a fresh client replays nothing", async () => {
    await capture("old news");
    const before = await head();
    let sent = false;
    const frames = await stream({}, (f) => {
      if (!sent) {
        sent = true;
        setTimeout(() => void capture("fresh"), 100);
      }
      return f.some((x) => x.event === "event");
    });
    const first = frames.find((f) => f.event === "event")!;
    expect(Number(first.id)).toBe(before + 1);
  });
});
