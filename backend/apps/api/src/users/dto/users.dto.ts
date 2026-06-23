import { ApiProperty } from '@nestjs/swagger';
import { UserState } from '@prisma/client';

export class UserMeResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: UserState })
  state!: UserState;

  @ApiProperty()
  coins!: number;

  @ApiProperty({ nullable: true })
  activatedAt!: string | null;
}

export class CoinsResponseDto {
  @ApiProperty()
  coins!: number;
}
