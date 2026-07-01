import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserAuthGuard } from './guards/auth.guards';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { AuthenticatedActor, isUser } from '../common/types';
import {
  AccessTokenResponseDto,
  AdminLoginDto,
  LoginDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login with six-digit ID' })
  @ApiResponse({ status: 200, type: AccessTokenResponseDto })
  async login(@Body() dto: LoginDto): Promise<AccessTokenResponseDto> {
    const user = await this.usersService.login(dto.userId);
    const sessionId = await this.usersService.startSession(
      user.id,
      this.authService.getSessionExpiresAt(),
    );
    return {
      accessToken: this.authService.issueUserToken(user.id, sessionId),
    };
  }

  @Post('login-admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login with username and password' })
  @ApiResponse({ status: 200, type: AccessTokenResponseDto })
  adminLogin(@Body() dto: AdminLoginDto): AccessTokenResponseDto {
    const valid = this.authService.validateAdminCredentials(
      dto.username,
      dto.password,
    );
    if (!valid) {
      throw new UnauthorizedException('Invalid admin credentials');
    }
    return { accessToken: this.authService.issueAdminToken(dto.username) };
  }

  @Post('logout')
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout and invalidate the current user session' })
  async logout(@CurrentActor() actor: AuthenticatedActor): Promise<void> {
    if (!isUser(actor)) {
      throw new UnauthorizedException('User authentication required');
    }
    await this.usersService.endSession(actor.userId, actor.sessionId);
  }
}
