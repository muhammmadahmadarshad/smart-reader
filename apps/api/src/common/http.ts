import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  ValidationPipe,
  INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body = error instanceof HttpException ? error.getResponse() : null;
    const message = typeof body === 'string' ? body : (body as { message?: unknown })?.message;
    if (status === 500) Logger.error(error, 'API');
    response
      .status(status)
      .json({ statusCode: status, message: message || 'Something went wrong. Please try again.' });
  }
}
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const origin = config.getOrThrow<string>('APP_ORIGIN');
  if (config.getOrThrow<string>('SESSION_SECRET').length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  if (config.get('NODE_ENV') === 'production' && config.get('COOKIE_SECURE') !== 'true')
    throw new Error('Production requires COOKIE_SECURE=true and HTTPS');
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  // Same-origin mutations require a custom header that cross-origin forms cannot send.
  // No permissive CORS policy is enabled. This also protects login/logout from CSRF.
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.headers.origin !== origin || req.headers['x-kevnex-request'] !== '1')
    ) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Request origin could not be verified. Refresh and try again.',
      });
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableShutdownHooks();
}
