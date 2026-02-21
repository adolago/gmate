#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const legacyDirs = [
  path.join(repoRoot, 'src', 'app', 'progress'),
  path.join(repoRoot, 'src', 'app', 'questions'),
  path.join(repoRoot, 'src', 'app', 'review'),
  path.join(repoRoot, 'src', 'app', 'sessions'),
];

for (const dir of legacyDirs) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`cleanup warning for ${dir}:`, error.message);
  }
}
