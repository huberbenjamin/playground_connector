import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ObjectsModule } from './objects/objects.module';
import { ShopModule } from './shop/shop.module';
import { AdminModule } from './admin/admin.module';
import { PythonGeneratorModule } from './python-generator/python-generator.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    StorageModule,
    PythonGeneratorModule,
    AuthModule,
    UsersModule,
    ObjectsModule,
    ShopModule,
    AdminModule,
  ],
})
export class AppModule {}
