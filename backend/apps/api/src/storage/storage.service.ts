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

  toPublicUrl(relativePath: string): string {
    const normalized = relativePath.split(path.sep).join('/');
    return `/files/${normalized}`;
  }

  resolveSafeRelativePath(folder: string, filename: string): string {
    const allowedFolders = new Set(['sog', 'thumbnails']);
    if (!allowedFolders.has(folder)) {
      throw new Error('INVALID_STORAGE_FOLDER');
    }

    if (
      !filename ||
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      throw new Error('INVALID_STORAGE_FILENAME');
    }

    return path.join(folder, filename);
  }

  getContentType(relativePath: string): string {
    const extension = path.extname(relativePath).toLowerCase();
    switch (extension) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.sog':
        return 'application/octet-stream';
      default:
        return 'application/octet-stream';
    }
  }
}
