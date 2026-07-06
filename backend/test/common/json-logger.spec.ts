import { createRuntimeLogger, JsonLogger } from '../../src/common/json-logger';

class MemorySink {
  lines: string[] = [];

  write(chunk: string): boolean {
    this.lines.push(chunk);
    return true;
  }
}

describe('JsonLogger', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;
  const originalLogFormat = process.env.COSTALYX_LOG_FORMAT;

  afterEach(() => {
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('APP_ENV', originalAppEnv);
    restoreEnv('COSTALYX_LOG_FORMAT', originalLogFormat);
  });

  it('writes one structured JSON log line with service, level, context, and timestamp', () => {
    const stdout = new MemorySink();
    const logger = new JsonLogger({
      serviceName: 'costalyx-test',
      now: () => new Date('2026-07-06T00:00:00.000Z'),
      stdout,
      stderr: new MemorySink()
    });

    logger.log('scheduler enabled', 'CloudConnectionSchedulerService');

    expect(stdout.lines).toHaveLength(1);
    expect(JSON.parse(stdout.lines[0])).toEqual({
      timestamp: '2026-07-06T00:00:00.000Z',
      level: 'log',
      service: 'costalyx-test',
      context: 'CloudConnectionSchedulerService',
      message: 'scheduler enabled'
    });
  });

  it('sends errors to stderr and redacts secret-shaped values in strings, objects, and traces', () => {
    const stderr = new MemorySink();
    const logger = new JsonLogger({
      now: () => new Date('2026-07-06T00:00:00.000Z'),
      stdout: new MemorySink(),
      stderr
    });

    logger.error(
      {
        event: 'provider probe failed',
        accessKey: 'AKIA_DO_NOT_LOG',
        authorization: 'Bearer object-token',
        nested: { clientSecret: 'client-secret-value' },
        detail: 'AWS_SECRET_ACCESS_KEY=env-secret Authorization: Bearer header-token token=do-not-log'
      },
      'password=trace-secret',
      'CloudProbe'
    );

    const payload = JSON.parse(stderr.lines[0]);
    expect(payload).toMatchObject({
      level: 'error',
      context: 'CloudProbe',
      trace: 'password=[redacted]'
    });
    expect(JSON.stringify(payload)).not.toContain('AKIA_DO_NOT_LOG');
    expect(JSON.stringify(payload)).not.toContain('object-token');
    expect(JSON.stringify(payload)).not.toContain('client-secret-value');
    expect(JSON.stringify(payload)).not.toContain('env-secret');
    expect(JSON.stringify(payload)).not.toContain('header-token');
    expect(JSON.stringify(payload)).not.toContain('do-not-log');
    expect(JSON.stringify(payload)).toContain('[redacted]');
  });

  it('selects JSON logging for production/json modes and keeps local pretty mode available', () => {
    delete process.env.NODE_ENV;
    delete process.env.APP_ENV;
    delete process.env.COSTALYX_LOG_FORMAT;
    expect(createRuntimeLogger()).toBeUndefined();

    process.env.COSTALYX_LOG_FORMAT = 'json';
    expect(createRuntimeLogger()).toBeInstanceOf(JsonLogger);

    process.env.COSTALYX_LOG_FORMAT = 'pretty';
    process.env.NODE_ENV = 'production';
    expect(createRuntimeLogger()).toBeUndefined();

    delete process.env.COSTALYX_LOG_FORMAT;
    process.env.APP_ENV = 'production';
    expect(createRuntimeLogger()).toBeInstanceOf(JsonLogger);
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
