import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import { GenerateSogResponse } from '@marketplace/shared-types';
import { convertUploadsToPng } from './image-converter';

export const SERVER_TOKEN_HEADER = 'X-Server-Token';
const NGROK_SKIP_BROWSER_WARNING_HEADER = 'ngrok-skip-browser-warning';

function normalizeGeneratorBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/generate-sog')
    ? trimmed.slice(0, -'/generate-sog'.length)
    : trimmed;
}

function isJsonContentType(contentType: string): boolean {
  return contentType.includes('application/json');
}

@Injectable()
export class PythonGeneratorService implements OnModuleInit {
  private readonly logger = new Logger(PythonGeneratorService.name);
  private readonly baseUrl: string;
  private workerSecretToken!: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = normalizeGeneratorBaseUrl(
      this.configService.get<string>(
        'PYTHON_GENERATOR_URL',
        'http://localhost:8001',
      ),
    );
  }

  onModuleInit(): void {
    const token = this.configService.get<string>('WORKER_SECRET_TOKEN');
    if (!token) {
      throw new Error(
        'WORKER_SECRET_TOKEN is required for Python generator communication',
      );
    }
    this.workerSecretToken = token;
  }

  async generateSog(images: Express.Multer.File[]): Promise<Buffer> {
    let pngImages;
    try {
      pngImages = await convertUploadsToPng(images);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to convert uploads to PNG: ${message}`);
      throw new ServiceUnavailableException(
        `Failed to convert uploaded images to PNG: ${message}`,
      );
    }

    const formData = new FormData();

    for (const image of pngImages) {
      formData.append('images', image.buffer, {
        filename: image.filename,
        contentType: 'image/png',
      });
    }

    const headers: Record<string, string> = {
      ...formData.getHeaders(),
      [SERVER_TOKEN_HEADER]: this.workerSecretToken,
    };

    if (this.baseUrl.includes('ngrok')) {
      headers[NGROK_SKIP_BROWSER_WARNING_HEADER] = 'true';
    }

    const targetUrl = `${this.baseUrl}/generate-sog`;
    this.logger.log(
      `Calling Python generator at ${targetUrl} with ${pngImages.length} PNG image(s)`,
    );

    // Node fetch does not stream the `form-data` package correctly; send a full buffer.
    const body = new Uint8Array(formData.getBuffer());

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        body,
        headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not reach Python generator: ${message}`);
      throw new ServiceUnavailableException(
        `Could not reach Python generator at ${targetUrl}: ${message}`,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(
        `Python generator responded ${response.status}: ${text.slice(0, 500)}`,
      );
      throw new ServiceUnavailableException(
        `Python generator failed: ${response.status} ${text}`,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (isJsonContentType(contentType)) {
      return this.parseJsonSogResponse(response);
    }

    return this.parseBinarySogResponse(response);
  }

  private async parseBinarySogResponse(response: Response): Promise<Buffer> {
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
      this.logger.error('Python generator returned an empty binary response');
      throw new ServiceUnavailableException(
        'Python generator did not return a SOG file',
      );
    }

    this.logger.log(
      `Python generator returned binary SOG file (${buffer.length} bytes)`,
    );
    return buffer;
  }

  private async parseJsonSogResponse(response: Response): Promise<Buffer> {
    let data: GenerateSogResponse;
    try {
      data = (await response.json()) as GenerateSogResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Python generator returned invalid JSON: ${message}`);
      throw new ServiceUnavailableException(
        'Python generator returned an invalid (non-JSON) response',
      );
    }

    if (!data.sogFile) {
      this.logger.error(
        `Python generator returned no sogFile. Payload keys: ${Object.keys(
          data ?? {},
        ).join(', ')}`,
      );
      throw new ServiceUnavailableException(
        'Python generator did not return a SOG file',
      );
    }

    this.logger.log('Python generator returned base64 SOG file in JSON');
    return Buffer.from(data.sogFile, 'base64');
  }
}
