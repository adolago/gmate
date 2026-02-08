#!/usr/bin/env node
/**
 * Merge multiple extracted question JSON files into one official-questions.json.
 *
 * Usage:
 *   node scripts/merge-extractions.js file1.json file2.json file3.json
 *
 * Output: data/official-questions.json (overwrites existing)
 *
 * Deduplicates by stem prefix (first 100 chars).
 */

const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/merge-extractions.js <file1.json> [file2.json] ...");
  console.error("  Merges extracted question files into data/official-questions.json");
  process.exit(1);
}

const all = [];
const seen = new Set();

for (const file of args) {
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${file}`);
    continue;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!Array.isArray(data)) {
    console.error(`Not an array: ${file}`);
    continue;
  }

  let added = 0;
  for (const q of data) {
    const key = (q.stem || "").slice(0, 100);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(q);
    added++;
  }
  console.log(`${file}: ${data.length} questions, ${added} new (${data.length - added} dupes)`);
}

const outPath = path.resolve(__dirname, "../data/official-questions.json");
fs.writeFileSync(outPath, JSON.stringify(all, null, 2));
console.log(`\nWrote ${all.length} questions to data/official-questions.json`);
