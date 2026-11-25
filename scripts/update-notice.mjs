import { fileURLToPath } from "node:url";
import { writeUpdateNotice } from "./lib/update.mjs";

const [home, runningCommit] = process.argv.slice(2);
if (!home || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(runningCommit)) process.exit(1);
await writeUpdateNotice(fileURLToPath(new URL("..", import.meta.url)), home, runningCommit);
