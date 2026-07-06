import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertNoDummyValuesInNonLocalEnvironment } from './config/startup-secrets';

async function bootstrapWorker() {
  assertNoDummyValuesInNonLocalEnvironment();
  await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
}

void bootstrapWorker();
