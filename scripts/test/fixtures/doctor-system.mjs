// Loaded with `node --import` by doctor.test.mjs, before scripts/cr.mjs. It stands in for the
// machine: CR_TEST_PLATFORM replaces os.platform(), CR_TEST_UID replaces process.getuid() and
// CR_TEST_NODE replaces the running Node's version, so the real `doctor` command can be run as
// root, as an ordinary user and on each platform. Which programs exist is set by the PATH the test
// passes; nothing here changes cr.mjs itself.
import { createRequire, syncBuiltinESMExports } from "node:module";

const require = createRequire(import.meta.url);
const os = require("node:os");

const platform = process.env.CR_TEST_PLATFORM;
if (platform) os.platform = () => platform;
const uid = process.env.CR_TEST_UID;
if (uid !== undefined) process.getuid = () => Number(uid);
const node = process.env.CR_TEST_NODE;
if (node) Object.defineProperty(process, "versions", { value: { ...process.versions, node: node.replace(/^v/, "") } });
syncBuiltinESMExports();
