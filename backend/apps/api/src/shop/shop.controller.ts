import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserAuthGuard } from '../auth/guards/auth.guards';
import { CurrentUserId } from '../common/decorators/current-actor.decorator';
import { ShopService } from './shop.service';
import { ShopItemResponseDto } from './dto/shop.dto';
import { ObjectResponseDto } from '../objects/dto/objects.dto';

@ApiTags('shop')
@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get()
  @ApiOperation({ summary: 'List all shop items (PUBLIC and ADMIN objects)' })
  @ApiResponse({ status: 200, type: [ShopItemResponseDto] })
  getShop(): Promise<ShopItemResponseDto[]> {
    return this.shopService.getShopItems();
  }

  @Post(':objectId/buy')
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Purchase a shop object (1 coin)' })
  @ApiResponse({ status: 200, type: ObjectResponseDto })
  buy(
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @CurrentUserId() userId: string,
  ): Promise<ObjectResponseDto> {
    return this.shopService.purchase(objectId, userId);
  }
}
