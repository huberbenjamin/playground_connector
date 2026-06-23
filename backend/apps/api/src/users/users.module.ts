import { Module } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserPoolService } from './user-pool.service';
import { UserCleanupService } from './user-cleanup.service';

@Module({
  controllers: [UsersController],
  providers: [
    UsersRepository,
    UsersService,
    UserPoolService,
    UserCleanupService,
  ],
  exports: [UsersRepository, UsersService, UserPoolService, UserCleanupService],
})
export class UsersModule {}
