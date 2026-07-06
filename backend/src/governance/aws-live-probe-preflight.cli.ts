import {
  awsPreflightExitCode,
  readAwsLiveProbePreflightInput,
  runAwsLiveProbePreflight
} from './aws-live-probe-preflight';

async function main(): Promise<void> {
  const output = await runAwsLiveProbePreflight(readAwsLiveProbePreflightInput(process.env));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = awsPreflightExitCode(output);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'AWS live probe preflight failed unexpectedly.';
  process.stderr.write(`${JSON.stringify({ status: 'error', message }, null, 2)}\n`);
  process.exitCode = 1;
});
