import { Body, Controller, Get, Post, Req, Res, UseGuards, HttpCode } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CredentialsDto, EmailDto, ResetDto } from './dto/auth.dto';
import { AuthGuard, SESSION_COOKIE } from './auth.guard';
import { AuthRequest } from './types/auth-request';
@ApiTags('Auth')
@Throttle({ default: { limit: 12, ttl: 60000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}
  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE') === 'true',
      sameSite: 'lax' as const,
      path: '/api',
    };
  }
  private async signIn(user: { id: string; email: string }, request: Request, response: Response) {
    await this.auth.logout(request.cookies?.[SESSION_COOKIE]);
    const session = await this.auth.createSession(user.id);
    response.cookie(SESSION_COOKIE, session.token, {
      ...this.cookieOptions(),
      expires: session.expiresAt,
    });
    return { id: user.id, email: user.email };
  }
  @Post('signup')
  async signup(
    @Body() body: CredentialsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.signIn(await this.auth.signup(body.email, body.password), req, res);
  }
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: CredentialsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.signIn(await this.auth.login(body.email, body.password), req, res);
  }
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    return { message: 'Logged out.' };
  }
  @Get('me')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  me(@Req() req: AuthRequest) {
    return { id: req.userId, email: req.email };
  }
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  forgot(@Body() body: EmailDto) {
    return this.auth.forgot(body.email);
  }
  @Post('reset-password')
  @HttpCode(200)
  reset(@Body() body: ResetDto) {
    return this.auth.reset(body.token, body.password);
  }
}
