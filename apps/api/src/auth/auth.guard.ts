import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthRequest } from './types/auth-request';
import { AuthService } from './auth.service';
export const SESSION_COOKIE = 'kevnex_session';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const session = await this.auth.authenticate(request.cookies?.[SESSION_COOKIE]);
    request.userId = session.userId;
    request.email = session.user.email;
    return true;
  }
}
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthRequest>().userId,
);
