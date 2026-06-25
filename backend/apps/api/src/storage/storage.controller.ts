import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createReadStream, existsSync } from 'fs';
import { Response } from 'express';
import { StorageService } from './storage.service';

@ApiTags('files')
@Controller('files')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get(':folder/:filename')
  @ApiOperation({ summary: 'Download a stored thumbnail or SOG file' })
  @ApiParam({ name: 'folder', enum: ['thumbnails', 'sog'] })
  @ApiParam({ name: 'filename', example: 'object01.jpg' })
  @ApiResponse({ status: 200, description: 'File stream' })
  @ApiResponse({ status: 404, description: 'File not found' })
  getFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    let relativePath: string;
    try {
      relativePath = this.storageService.resolveSafeRelativePath(folder, filename);
    } catch {
      throw new NotFoundException('File not found');
    }

    const absolutePath = this.storageService.getAbsolutePath(relativePath);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException('File not found');
    }

    res.setHeader(
      'Content-Type',
      this.storageService.getContentType(relativePath),
    );
    res.setHeader('Cache-Control', 'public, max-age=3600');

    return new StreamableFile(createReadStream(absolutePath));
  }
}
