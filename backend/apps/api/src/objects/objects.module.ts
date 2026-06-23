import { Module } from '@nestjs/common';
import { ObjectsRepository } from './objects.repository';
import { ObjectsService } from './objects.service';
import { ObjectsController } from './objects.controller';
import { UsersModule } from '../users/users.module';
import { PythonGeneratorModule } from '../python-generator/python-generator.module';

@Module({
  imports: [UsersModule, PythonGeneratorModule],
  controllers: [ObjectsController],
  providers: [ObjectsRepository, ObjectsService],
  exports: [ObjectsRepository, ObjectsService],
})
export class ObjectsModule {}
