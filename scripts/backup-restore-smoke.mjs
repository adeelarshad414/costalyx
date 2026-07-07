#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const sourceDb = process.env.COSTALYX_BACKUP_SOURCE_DB ?? 'costalyx_dev';
const restoreDb = process.env.COSTALYX_RESTORE_SMOKE_DB ?? `costalyx_restore_smoke_${Date.now()}`;
const user = process.env.POSTGRES_USER ?? 'costalyx';

function run(args, options = {}) {
  const result = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', ...args], {
    encoding: options.encoding ?? 'utf8',
    input: options.input,
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr : result.stderr?.toString('utf8');
    throw new Error(stderr?.trim() || `docker compose exec postgres ${args.join(' ')} failed`);
  }
  return result.stdout;
}

function cleanup() {
  spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'dropdb', '-U', user, '--if-exists', restoreDb], {
    encoding: 'utf8'
  });
}

try {
  console.log(`Creating logical backup from ${sourceDb}...`);
  const dump = run(['pg_dump', '-U', user, '-d', sourceDb, '--format=custom'], { encoding: 'buffer' });
  if (!Buffer.isBuffer(dump) || dump.length < 1024) {
    throw new Error('Backup dump was unexpectedly small.');
  }

  cleanup();
  console.log(`Creating restore smoke database ${restoreDb}...`);
  run(['createdb', '-U', user, restoreDb]);

  console.log('Restoring logical backup into smoke database...');
  run(['pg_restore', '-U', user, '-d', restoreDb, '--clean', '--if-exists'], { input: dump });

  const tableCount = String(
    run(['psql', '-U', user, '-d', restoreDb, '-Atc', "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"])
  ).trim();
  const costRecordCount = String(
    run(['psql', '-U', user, '-d', restoreDb, '-Atc', "SELECT count(*) FROM public.cost_records;"])
  ).trim();

  if (Number(tableCount) < 10) {
    throw new Error(`Restore smoke found only ${tableCount} public tables.`);
  }
  if (Number(costRecordCount) < 1) {
    throw new Error('Restore smoke found no cost records; seed demo data before running this check.');
  }

  console.log(`Backup/restore smoke passed: restored ${tableCount} public tables and ${costRecordCount} cost records.`);
} finally {
  cleanup();
}
