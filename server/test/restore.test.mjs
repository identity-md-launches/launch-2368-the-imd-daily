import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "imd-restore-test-"));
const bin = path.join(root, "bin");
fs.mkdirSync(bin);
// Execute the exact container command locally, mapping only its two mounted paths.
// This exercises restore.sh without Docker, a daemon or production credentials.
fs.writeFileSync(path.join(bin, "docker"), `#!/usr/bin/env node
const {spawnSync} = require('node:child_process');
const args = process.argv.slice(2);
const archive = args[args.indexOf('-v') + 1].split(':')[0];
const command = args[args.indexOf('-c') + 1]
  .replaceAll('/restore.tar.gz', archive).replaceAll('/data', process.env.IMD_RESTORE_TARGET);
const result = spawnSync('sh', ['-c', command], {stdio:'inherit'});
process.exit(result.status ?? 1);
`, { mode: 0o755 });
after(() => fs.rmSync(root, { recursive: true, force: true }));
const script = fileURLToPath(new URL("../restore.sh", import.meta.url));
const bytes = Buffer.from("%PDF-1.4 local restore test only");
const name = crypto.createHash("sha256").update(bytes).digest("hex") + ".pdf";
let sequence = 0;

function fixture({ badHash = false } = {}) {
  const dir = path.join(root, String(++sequence));
  const source = path.join(dir, "source");
  const target = path.join(dir, "target");
  fs.mkdirSync(path.join(source, "objects"), { recursive: true });
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(source, "objects", name), badHash ? "corrupt bytes" : bytes);
  fs.writeFileSync(path.join(source, "drafts.json"), '{"preserved":true}');
  const archive = path.join(dir, "backup.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", source, "objects", "drafts.json"]);
  return { target, archive };
}
function restore({ target, archive }) {
  return spawnSync("sh", [script, archive], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, IMD_RESTORE_TARGET: target },
  });
}

test("restore preserves object paths, bytes and draft metadata before reporting success", () => {
  const f = fixture();
  const result = restore(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /restored/);
  assert.deepEqual(fs.readFileSync(path.join(f.target, "objects", name)), bytes);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.target, "drafts.json"))), { preserved: true });
});

test("a hash mismatch fails and never prints success", () => {
  const result = restore(fixture({ badHash: true }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HASH MISMATCH/);
  assert.doesNotMatch(result.stdout, /restored/);
});

test("a corrupt archive propagates extraction failure", () => {
  const f = fixture();
  fs.writeFileSync(f.archive, "not an archive");
  const result = restore(f);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /restored/);
});

test("existing files are never overwritten and tar refusal is reported as failure", () => {
  const f = fixture();
  fs.mkdirSync(path.join(f.target, "objects"));
  const object = path.join(f.target, "objects", name);
  fs.writeFileSync(object, "existing content");
  const result = restore(f);
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(object, "utf8"), "existing content");
  assert.doesNotMatch(result.stdout, /restored/);
});

test("a missing archive is refused", () => {
  const result = spawnSync("sh", [script], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /backup file not found/);
});
