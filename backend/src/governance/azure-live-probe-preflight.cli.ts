import {
  azurePreflightExitCode,
  readAzureLiveProbePreflightInput,
  runAzureLiveProbePreflight
} from './azure-live-probe-preflight';

async function main(): Promise<void> {
  const output = await runAzureLiveProbePreflight(readAzureLiveProbePreflightInput(process.env));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = azurePreflightExitCode(output);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Azure live probe preflight failed unexpectedly.';
  process.stderr.write(`${JSON.stringify({ status: 'error', message }, null, 2)}\n`);
  process.exitCode = 1;
});
