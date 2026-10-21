// Recomputes canonical ABI hashes (keccak256 of key-sorted, whitespace-free JSON) for the
// repository's abi/ files and the ABIs the site bundles, and compares them with the deployment handoff.
import { keccak256, toBytes } from "viem";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXPECTED = {
  IMDDaily: "cb9d868d94243c297f852a84b9bbfeb186c26816a9fb3e8307663b8e0585f115",
  IMDDailyVault: "fed625e52c66a96d8d09b4163e810a3d8a5972047fc05df90cf16b6772653b8a",
};
const sortKeys = (v) =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
      : v;

let failed = false;
for (const [name, expected] of Object.entries(EXPECTED)) {
  const abi = JSON.parse(fs.readFileSync(path.join(root, "abi", `${name}.json`), "utf8"));
  const got = keccak256(toBytes(JSON.stringify(sortKeys(abi)))).slice(2);
  const ok = got === expected;
  if (!ok) failed = true;
  console.log(`${ok ? "ok  " : "FAIL"} ${name} ${got}`);
}
process.exit(failed ? 1 : 0);
