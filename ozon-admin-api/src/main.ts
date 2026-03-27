import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appEnv } from './config/app-env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: appEnv.corsOrigins,
  });

  app.getHttpAdapter().getInstance().set('trust proxy', appEnv.trustProxy);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(appEnv.port, appEnv.host);

  const appUrl = await app.getUrl();
  console.log(`[bootstrap] ${appEnv.nodeEnv} server listening at ${appUrl}`);
}
void bootstrap();
