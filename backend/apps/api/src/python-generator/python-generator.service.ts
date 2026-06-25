import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import { GenerateSogResponse } from '@marketplace/shared-types';

@Injectable()
export class PythonGeneratorService {
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'PYTHON_GENERATOR_URL',
      'http://localhost:8001',
    );
  }

  async generateSog(images: Express.Multer.File[]): Promise<Buffer> {
    const formData = new FormData();

    for (const image of images) {
      formData.append('images', image.buffer, {
        filename: image.originalname,
        contentType: image.mimetype,
      });
    }

    const response = await fetch(`${this.baseUrl}/generate-sog`, {
      method: 'POST',
      body: formData as unknown as BodyInit,
      headers: formData.getHeaders(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(
        `Python generator failed: ${response.status} ${text}`,
      );
    }

    const data = (await response.json()) as GenerateSogResponse;

    if (!data.sogFile) {
      throw new ServiceUnavailableException(
        'Python generator did not return a SOG file',
      );
    }

    return Buffer.from(data.sogFile, 'base64');
  }
}
