import { Module } from '@nestjs/common';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { ObjectsModule } from '../objects/objects.module';

@Module({
  imports: [ObjectsModule],
  controllers: [ShopController],
  providers: [ShopService],
})
export class ShopModule {}
