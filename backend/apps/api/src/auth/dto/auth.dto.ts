import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { USER_ID_PATTERN } from '@marketplace/shared-types';

export class LoginDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(USER_ID_PATTERN, { message: 'userId must be exactly six digits' })
  userId!: string;
}

export class AdminLoginDto {
  @ApiProperty({ example: 'admin1' })
  @IsString()
  username!: string;

  @ApiProperty({ example: 'admin1pass' })
  @IsString()
  password!: string;
}

export class AccessTokenResponseDto {
  @ApiProperty()
  accessToken!: string;
}
