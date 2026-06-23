import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface StoredFile {
  relativePath: string;
  absolutePath: string;
}

@Injectable()
export class StorageService {
  private readonly root: string;
  private readonly sogDir: string;
  private readonly thumbnailDir: string;

  constructor(private readonly configService: ConfigService) {
    const storageRoot = this.configService.get<string>('STORAGE_ROOT', 'storage');
    this.root = path.isAbsolute(storageRoot)
      ? storageRoot
      : path.resolve(process.cwd(), storageRoot);
    this.sogDir = path.join(this.root, 'sog');
    this.thumbnailDir = path.join(this.root, 'thumbnails');
  }

  async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.sogDir, { recursive: true });
    await fs.mkdir(this.thumbnailDir, { recursive: true });
  }

  async saveSog(buffer: Buffer, extension = '.sog'): Promise<StoredFile> {
    await this.ensureDirectories();
    const filename = `${uuidv4()}${extension}`;
    const absolutePath = path.join(this.sogDir, filename);
    await fs.writeFile(absolutePath, buffer);
    return {
      relativePath: path.join('sog', filename),
      absolutePath,
    };
  }

  async saveThumbnail(buffer: Buffer, originalName: string): Promise<StoredFile> {
    await this.ensureDirectories();
    const ext = path.extname(originalName) || '.jpg';
    const filename = `${uuidv4()}${ext}`;
    const absolutePath = path.join(this.thumbnailDir, filename);
    await fs.writeFile(absolutePath, buffer);
    return {
      relativePath: path.join('thumbnails', filename),
      absolutePath,
    };
  }

  async deleteFile(relativePath: string): Promise<void> {
    const absolutePath = path.join(this.root, relativePath);
    try {
      await fs.unlink(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async deleteObjectFiles(sogPath: string, thumbnailPath: string): Promise<void> {
    await Promise.all([
      this.deleteFile(sogPath),
      this.deleteFile(thumbnailPath),
    ]);
  }

  getAbsolutePath(relativePath: string): string {
    return path.join(this.root, relativePath);
  }
}
