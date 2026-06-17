import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@playground/shared-types';
import { UserResponseDto } from './user-response.dto';

export class PaginatedUsersResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  items!: UserResponseDto[];

  @ApiProperty()
  total!: number;
}

export class MessageResponseDto {
  @ApiProperty()
  message!: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}

export { UserResponseDto };
