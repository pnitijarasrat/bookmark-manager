import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { OWNER_KEY, type AuthenticatedRequest } from './owner.decorator.js';
import { TokenVerifier } from './token-verifier.js';

/**
 * Registered as the global APP_GUARD, with no opt-out: every route needs a
 * valid access token in the Authorization header. See DECISIONS.md, "Every
 * API route requires a token".
 */
@Injectable()
export class TokenGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException();
    request[OWNER_KEY] = await this.verifier.verify(match[1]);
    return true;
  }
}
