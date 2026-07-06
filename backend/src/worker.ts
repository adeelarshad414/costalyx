import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createRuntimeLogger } from './common/json-logger';
import { assertNoDummyValuesInNonLocalEnvironment } from './config/startup-secrets';

async function bootstrapWorker() {
  assertNoDummyValuesInNonLocalEnvironment();
  const runtimeLogger = createRuntimeLogger();
  await NestFactory.createApplicationContext(
    AppModule,
    runtimeLogger ? { logger: runtimeLogger } : { logger: ['log', 'error', 'warn'] }
  );
}

void bootstrapWorker();
