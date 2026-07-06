import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createRuntimeLogger } from './common/json-logger';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { assertNoDummyValuesInNonLocalEnvironment } from './config/startup-secrets';

async function bootstrap() {
  assertNoDummyValuesInNonLocalEnvironment();

  const runtimeLogger = createRuntimeLogger();
  const app = await NestFactory.create(AppModule, runtimeLogger ? { logger: runtimeLogger } : undefined);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableCors({ origin: true, credentials: false });

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
}

void bootstrap();
