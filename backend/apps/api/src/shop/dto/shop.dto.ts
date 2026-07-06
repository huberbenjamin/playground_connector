import { ApiProperty } from '@nestjs/swagger';
import { ObjectType } from '@prisma/client';

export class ShopItemResponseDto {
  @ApiProperty()
  objectId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  creatorUserId!: string;

  @ApiProperty({
    description: 'Public HTTP path for the frontend image src',
    example: '/files/thumbnails/cat-rabbit.jpg',
  })
  thumbnailUrl!: string;

  @ApiProperty({
    description: 'Public HTTP path for the 3D SOG preview / purchase target',
    example: '/files/sog/cat-rabbit.sog',
  })
  sogUrl!: string;

  @ApiProperty({ enum: ObjectType })
  type!: ObjectType;

  @ApiProperty()
  createdAt!: string;
}
