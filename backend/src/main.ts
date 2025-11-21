import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env file before anything else
config({ path: resolve(__dirname, '../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger config
  const config = new DocumentBuilder()
    .setTitle('Loan Disbursement & Repayment API')
    .setDescription('API documentation for the loan system')
    .setVersion('1.0')
    .addTag('disbursements', 'Loan disbursement operations')
    .addTag('repayments', 'Repayment operations')
    .addTag('rollbacks', 'Rollback operations')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
      },
      'bearer',
    )
    .addSecurityRequirements('bearer')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
