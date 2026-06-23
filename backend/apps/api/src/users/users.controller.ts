import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAuthGuard } from '../auth/guards/auth.guards';
import { CurrentUserId } from '../common/decorators/current-actor.decorator';
import { UsersService } from './users.service';
import { CoinsResponseDto, UserMeResponseDto } from './dto/users.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, type: UserMeResponseDto })
  async getMe(@CurrentUserId() userId: string): Promise<UserMeResponseDto> {
    const user = await this.usersService.getMe(userId);
    return {
      userId: user.id,
      state: user.state,
      coins: user.coins,
      activatedAt: user.activatedAt?.toISOString() ?? null,
    };
  }

  @Get('coins')
  @ApiOperation({ summary: 'Get current user coin balance' })
  @ApiResponse({ status: 200, type: CoinsResponseDto })
  async getCoins(@CurrentUserId() userId: string): Promise<CoinsResponseDto> {
    const coins = await this.usersService.getCoins(userId);
    return { coins };
  }
}
