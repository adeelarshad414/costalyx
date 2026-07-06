import {
  gcpPreflightExitCode,
  readGcpLiveProbePreflightInput,
  runGcpLiveProbePreflight
} from './gcp-live-probe-preflight';

async function main(): Promise<void> {
  const output = await runGcpLiveProbePreflight(readGcpLiveProbePreflightInput(process.env));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = gcpPreflightExitCode(output);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'GCP live probe preflight failed unexpectedly.';
  process.stderr.write(`${JSON.stringify({ status: 'error', message }, null, 2)}\n`);
  process.exitCode = 1;
});
