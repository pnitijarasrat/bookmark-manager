import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { VerifiedAccessToken, type AccessToken } from '../auth/owner.decorator.js';
import { ApiProblems } from '../http/api-problems.js';
import { MeDto } from './me.dto.js';
import { UserinfoClient } from './userinfo.client.js';

@ApiTags('Me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly userinfo: UserinfoClient) {}

  /**
   * The signed-in User's profile, from Auth0's /userinfo. Never includes the
   * `sub`.
   */
  @Get()
  @ApiProblems(401, 502)
  me(@VerifiedAccessToken() token: AccessToken): Promise<MeDto> {
    return this.userinfo.profile(token);
  }
}
