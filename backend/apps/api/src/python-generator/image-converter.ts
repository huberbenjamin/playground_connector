import { basename, extname } from 'path';
import sharp from 'sharp';

export interface PngImagePayload {
  buffer: Buffer;
  filename: string;
}

function toPngFilename(originalName: string, index: number): string {
  const baseName = basename(originalName, extname(originalName)) || `image-${index + 1}`;
  return `${baseName}.png`;
}

export async function convertUploadToPng(
  image: Express.Multer.File,
  index: number,
): Promise<PngImagePayload> {
  const pngBuffer = await sharp(image.buffer).png().toBuffer();

  return {
    buffer: pngBuffer,
    filename: toPngFilename(image.originalname, index),
  };
}

export async function convertUploadsToPng(
  images: Express.Multer.File[],
): Promise<PngImagePayload[]> {
  return Promise.all(images.map((image, index) => convertUploadToPng(image, index)));
}
