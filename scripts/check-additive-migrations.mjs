import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const migrationRoot = 'backend/migrations';
const forbidden = /\b(drop|truncate|alter\s+table\s+\S+\s+drop|alter\s+table\s+\S+\s+alter\s+column\s+\S+\s+type)\b/i;

function walk(dir) {
  try {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  } catch {
    return [];
  }
}

const sqlFiles = walk(migrationRoot).filter((path) => path.endsWith('.sql') && !path.endsWith('.rollback.sql'));
const violations = sqlFiles.filter((path) => forbidden.test(readFileSync(path, 'utf8')));

if (violations.length > 0) {
  console.error(`Non-additive migration statements found:\n${violations.join('\n')}`);
  process.exit(1);
}

console.log(`Additive migration check passed (${sqlFiles.length} migration files scanned).`);
