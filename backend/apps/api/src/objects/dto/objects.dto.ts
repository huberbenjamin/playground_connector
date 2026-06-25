import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ObjectType } from '@prisma/client';
import { IsEnum, IsString, Matches, MinLength } from 'class-validator';
import { USER_ID_PATTERN } from '@marketplace/shared-types';

export enum UserListingType {
  PUBLIC = 'PUBLIC',
  EXCLUSIVE = 'EXCLUSIVE',
}

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

export class GenerateObjectDto extends CreateObjectBodyDto {
  @ApiProperty({
    enum: UserListingType,
    description: 'PUBLIC = visible in shop (2 coins), EXCLUSIVE = private ownership only (5 coins)',
    example: UserListingType.PUBLIC,
  })
  @IsEnum(UserListingType)
  listingType!: UserListingType;
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
