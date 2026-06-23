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

  @ApiProperty()
  thumbnailPath!: string;

  @ApiProperty({ enum: ObjectType })
  type!: ObjectType;

  @ApiProperty()
  createdAt!: string;
}
