import { Module } from '@nestjs/common';
import { PythonGeneratorService } from './python-generator.service';

@Module({
  providers: [PythonGeneratorService],
  exports: [PythonGeneratorService],
})
export class PythonGeneratorModule {}
