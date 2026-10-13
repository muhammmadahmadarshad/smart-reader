import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './common/http';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Smart Reader API')
      .setVersion('1.0')
      .addCookieAuth('kevnex_session')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  await app.listen(Number(app.get(ConfigService).get('PORT', '3014')), '0.0.0.0');
}
bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
