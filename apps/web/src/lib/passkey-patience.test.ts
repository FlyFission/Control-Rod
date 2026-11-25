import { afterEach, describe, expect, it, vi } from "vitest";
import { PASSKEY_STUCK_MESSAGE, PasskeyStuckError, withPasskeyPatience } from "./decide.js";

describe("passkey patience", () => {
  afterEach(() => vi.useRealTimers());

  it("passes a normal answer through and never cancels", async () => {
    const cancel = vi.fn();
    await expect(withPasskeyPatience(async () => "signed", 1000, cancel)).resolves.toBe("signed");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("passes the browser's own refusal through unchanged", async () => {
    const cancel = vi.fn();
    const refused = new Error("NotAllowedError");
    await expect(withPasskeyPatience(() => Promise.reject(refused), 1000, cancel)).rejects.toBe(refused);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancels a ceremony the browser never answers and says nothing was signed", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stuck = withPasskeyPatience(() => new Promise<string>(() => {}), 1000, cancel);
    const seen = expect(stuck).rejects.toBeInstanceOf(PasskeyStuckError);
    await vi.advanceTimersByTimeAsync(1000);
    await seen;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(PASSKEY_STUCK_MESSAGE).toMatch(/Nothing was signed/);
  });

  it("still reports the stuck window when the browser refuses to cancel", async () => {
    vi.useFakeTimers();
    const stuck = withPasskeyPatience(() => new Promise<string>(() => {}), 10, () => { throw new Error("no"); });
    const seen = expect(stuck).rejects.toBeInstanceOf(PasskeyStuckError);
    await vi.advanceTimersByTimeAsync(10);
    await seen;
  });

  it("ignores a late answer after giving up", async () => {
    vi.useFakeTimers();
    let answer: (v: string) => void = () => {};
    const stuck = withPasskeyPatience(() => new Promise<string>((r) => { answer = r; }), 10, () => {});
    const seen = expect(stuck).rejects.toBeInstanceOf(PasskeyStuckError);
    await vi.advanceTimersByTimeAsync(10);
    answer("late");
    await seen;
  });
});
