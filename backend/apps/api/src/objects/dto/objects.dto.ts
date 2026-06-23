import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ObjectType } from '@prisma/client';
import { IsString, Matches, MinLength } from 'class-validator';
import { USER_ID_PATTERN } from '@marketplace/shared-types';

export class ObjectResponseDto {
  @ApiProperty()
  objectId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  creatorUserId!: string;

  @ApiProperty()
  sogPath!: string;

  @ApiProperty()
  thumbnailPath!: string;

  @ApiProperty({ enum: ObjectType })
  type!: ObjectType;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional()
  ownedSince?: string;
}

export class CreateObjectBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  description!: string;
}

export class GiftObjectDto {
  @ApiProperty({ example: '654321' })
  @IsString()
  @Matches(USER_ID_PATTERN, { message: 'recipientUserId must be exactly six digits' })
  recipientUserId!: string;
}

export class CreateAdminObjectBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  description!: string;
}
