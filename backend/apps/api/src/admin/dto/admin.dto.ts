import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { UserState } from '@prisma/client';
import { ObjectType } from '@prisma/client';

export class AddCoinsDto {
  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  amount!: number;
}

export class AdminUserIdResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: UserState })
  state!: UserState;

  @ApiProperty({ nullable: true })
  activatedAt!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class AdminUserResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: UserState })
  state!: UserState;

  @ApiProperty()
  coins!: number;

  @ApiProperty({ nullable: true })
  activatedAt!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class AdminStatsResponseDto {
  @ApiProperty()
  activeUsers!: number;

  @ApiProperty()
  removedUsers!: number;

  @ApiProperty()
  pregeneratedUsers!: number;

  @ApiProperty()
  totalObjects!: number;

  @ApiProperty()
  publicObjects!: number;

  @ApiProperty()
  exclusiveObjects!: number;

  @ApiProperty()
  adminObjects!: number;
}

export class AdminObjectResponseDto {
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
}
