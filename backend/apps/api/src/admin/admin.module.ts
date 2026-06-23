import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UsersModule } from '../users/users.module';
import { ObjectsModule } from '../objects/objects.module';

@Module({
  imports: [UsersModule, ObjectsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
