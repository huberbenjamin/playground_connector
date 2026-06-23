import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
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
    return { accessToken: this.authService.issueUserToken(user.id) };
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
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout (client-side token discard)' })
  logout(): void {
    return;
  }
}
