import { Global, Module, OnModuleInit } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Global()
@Module({
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule implements OnModuleInit {
  constructor(private readonly storageService: StorageService) {}

  async onModuleInit(): Promise<void> {
    await this.storageService.ensureDirectories();
  }
}
