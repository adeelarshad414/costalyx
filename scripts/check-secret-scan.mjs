#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const scans = [
  ['current tree', ['dir', '--no-banner', '--redact=100', '.']],
  ['git history', ['detect', '--no-banner', '--redact=100', '--source', '.']]
];

for (const [label, args] of scans) {
  console.log(`Running gitleaks ${label} scan...`);
  const result = spawnSync('gitleaks', args, { stdio: 'inherit' });

  if (result.error?.code === 'ENOENT') {
    console.error('gitleaks is required for npm run security:secrets. Install gitleaks 8.x and rerun.');
    process.exit(127);
  }

  if (result.status !== 0) {
    console.error(`gitleaks ${label} scan failed. Review redacted findings and update fixtures or .gitleaks.toml.`);
    process.exit(result.status ?? 1);
  }
}

console.log('gitleaks current-tree and git-history scans passed.');
