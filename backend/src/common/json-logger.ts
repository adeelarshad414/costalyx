import type { LoggerService, LogLevel } from '@nestjs/common';

type Sink = Pick<NodeJS.WriteStream, 'write'>;

export interface JsonLoggerOptions {
  serviceName?: string;
  now?: () => Date;
  stdout?: Sink;
  stderr?: Sink;
}

export class JsonLogger implements LoggerService {
  private readonly serviceName: string;
  private readonly now: () => Date;
  private readonly stdout: Sink;
  private readonly stderr: Sink;

  constructor(options: JsonLoggerOptions = {}) {
    this.serviceName = options.serviceName ?? 'costalyx-backend';
    this.now = options.now ?? (() => new Date());
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
  }

  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, { trace: trace ? redactString(trace) : undefined });
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  private write(level: LogLevel | 'fatal', message: unknown, context?: string, extra: Record<string, unknown> = {}): void {
    const payload = removeUndefined({
      timestamp: this.now().toISOString(),
      level,
      service: this.serviceName,
      context,
      message: normalizeMessage(message),
      ...redactObject(extra)
    });
    const sink = level === 'error' || level === 'fatal' ? this.stderr : this.stdout;
    sink.write(`${JSON.stringify(payload)}\n`);
  }
}

export function createRuntimeLogger(): LoggerService | undefined {
  const format = process.env.COSTALYX_LOG_FORMAT;
  if (format === 'pretty') {
    return undefined;
  }
  if (format === 'json' || process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
    return new JsonLogger();
  }
  return undefined;
}

function normalizeMessage(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined
    };
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  return redactValue(value);
}

function redactObject(value: Record<string, unknown>): Record<string, unknown> {
  return redactValue(value) as Record<string, unknown>;
}

function redactValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (value instanceof Error) {
    return normalizeMessage(value);
  }
  if (Array.isArray(value)) {
    return depth >= 4 ? '[truncated]' : value.map((item) => redactValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= 4) {
      return '[truncated]';
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        isSecretKey(key) ? '[redacted]' : redactValue(nested, depth + 1)
      ])
    );
  }
  return String(value);
}

function redactString(value: string): string {
  return value
    .replace(secretJsonPattern, '$1"[redacted]"')
    .replace(bearerTokenPattern, '$1[redacted]')
    .replace(secretAssignmentPattern, '$1=[redacted]');
}

function removeUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, nested]) => nested !== undefined));
}

function isSecretKey(key: string): boolean {
  return /(authorization|api[_-]?key|secret|token|password|credential|access[_-]?key|private[_-]?key|client[_-]?secret|session[_-]?token)/i.test(
    key
  );
}

const secretAssignmentPattern =
  /\b([a-z0-9_.-]*(?:secret|token|password|credential|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|session[_-]?token)[a-z0-9_.-]*)\s*[:=]\s*[^,\s]+/gi;
const secretJsonPattern =
  /("(?:authorization|api[_-]?key|secret|token|password|credential|access[_-]?key|private[_-]?key|client[_-]?secret|session[_-]?token)"\s*:\s*)"[^"]*"/gi;
const bearerTokenPattern = /\b(authorization\s*[:=]\s*bearer\s+)[^,\s]+/gi;
