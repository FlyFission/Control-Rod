import { describe, expect, it } from "vitest";
import { PgLogTail, pgStartFailure } from "../src/pg-start-error.js";

// The bundled PostgreSQL package rejects with no reason; these are the server's own log lines.
describe("pgStartFailure", () => {
  it("shows PostgreSQL's own error and the shared-memory advice instead of 'undefined'", () => {
    const tail = new PgLogTail();
    tail.push(
      "2026-11-24 LOG:  starting PostgreSQL 17\nFATAL:  could not create shared memory segment: No space left on device\n" +
        "DETAIL:  Failed system call was shmget(key=10216519, size=56, 03600).\nLOG:  database system is shut down\n",
    );
    const text = pgStartFailure("/home/u/.controlrod/pg", 7301, tail.all(), undefined);
    expect(text).not.toContain("undefined");
    expect(text).toContain("could not create shared memory segment");
    expect(text).toContain("shared memory");
    expect(text).toContain("controlrod start");
    expect(text).not.toContain("starting PostgreSQL 17");
  });

  it("names the process holding a lock file and keeps the data", () => {
    const log = ['FATAL:  lock file "postmaster.pid" already exists', "HINT:  Is another postmaster (PID 4242) running in data directory?"];
    const text = pgStartFailure("/d/pg", 7301, log, undefined);
    expect(text).toContain("process 4242");
    expect(text).toContain("kill 4242");
    expect(text).toContain("not affected");
  });

  it("says the port is in use", () => {
    expect(pgStartFailure("/d/pg", 7301, ['LOG:  could not bind IPv4 address "127.0.0.1": Address already in use'], undefined)).toContain(
      "Port 7301 is already in use",
    );
  });

  it("falls back to the error when PostgreSQL printed nothing", () => {
    expect(pgStartFailure("/d/pg", 7301, [], new Error("spawn ENOENT"))).toContain("spawn ENOENT");
    expect(pgStartFailure("/d/pg", 7301, [], undefined)).toContain("no output");
  });

  it("keeps only the last lines", () => {
    const tail = new PgLogTail(3);
    tail.push("a\nb\nc\nd\n");
    expect(tail.all()).toEqual(["b", "c", "d"]);
  });
});
