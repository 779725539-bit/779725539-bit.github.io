#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const defaultSource = "/Users/zhanglin/.openclaw/agents/blackwidow/workspace/health/public/latest-public.json";
const source = process.env.HEALTH_PUBLIC_SUMMARY || defaultSource;
const target = path.join(repoRoot, "health", "latest-public.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(source)) {
  fail(`Missing public health summary: ${source}`);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(source, "utf8"));
} catch (error) {
  fail(`Public health summary is not valid JSON: ${error.message}`);
}

if (parsed.status !== "ready") {
  fail("Refusing to publish: summary.status must be \"ready\".");
}

const forbiddenKeys = [
  "raw",
  "samples",
  "route",
  "routes",
  "coordinates",
  "medications",
  "symptoms",
  "stateOfMind",
  "ecg",
  "heartRateSeries",
  "workoutRoute"
];

const serialized = JSON.stringify(parsed);
const forbidden = forbiddenKeys.find((key) => serialized.includes(`"${key}"`));
if (forbidden) {
  fail(`Refusing to publish: possible raw/private field detected: ${forbidden}`);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(parsed, null, 2)}\n`);
console.log(`Published public health summary to ${target}`);
