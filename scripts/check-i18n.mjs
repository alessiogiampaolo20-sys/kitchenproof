// CI gate (BLUEPRINT §18): fail if da/en keys are missing; it may lag [DEFAULT].
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(process.cwd(), "src/messages");
const load = (l) => JSON.parse(readFileSync(resolve(dir, `${l}.json`), "utf8"));

function flatten(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === "object"
      ? flatten(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

const da = new Set(flatten(load("da")));
const en = new Set(flatten(load("en")));
const it = new Set(flatten(load("it")));

const missing = (ref, target) => [...ref].filter((k) => !target.has(k));

const enMissing = missing(da, en);
const daMissing = missing(en, da);
const itMissing = missing(da, it);

let failed = false;
if (daMissing.length) {
  console.error(`✖ da is missing ${daMissing.length} key(s):\n  ${daMissing.join("\n  ")}`);
  failed = true;
}
if (enMissing.length) {
  console.error(`✖ en is missing ${enMissing.length} key(s):\n  ${enMissing.join("\n  ")}`);
  failed = true;
}
if (itMissing.length) {
  console.warn(`⚠ it lags behind da by ${itMissing.length} key(s) (allowed [DEFAULT])`);
}
if (failed) process.exit(1);
console.log(`✓ i18n complete: ${da.size} keys (da/en in sync, it missing ${itMissing.length})`);
