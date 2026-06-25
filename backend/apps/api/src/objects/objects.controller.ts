import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserAuthGuard } from '../auth/guards/auth.guards';
import { CurrentUserId } from '../common/decorators/current-actor.decorator';
import { jpegImageUploadOptions } from '../common/multer-options';
import { ObjectsService } from './objects.service';
import {
  CreateObjectBodyDto,
  GenerateObjectDto,
  GiftObjectDto,
  ObjectResponseDto,
} from './dto/objects.dto';

@ApiTags('objects')
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller('objects')
export class ObjectsController {
  constructor(private readonly objectsService: ObjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List objects owned by the current user' })
  @ApiResponse({ status: 200, type: [ObjectResponseDto] })
  getOwnedObjects(@CurrentUserId() userId: string): Promise<ObjectResponseDto[]> {
    return this.objectsService.getOwnedObjects(userId);
  }

  @Get(':objectId')
  @ApiOperation({ summary: 'Get a single object' })
  @ApiResponse({ status: 200, type: ObjectResponseDto })
  getObject(
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @CurrentUserId() userId: string,
  ): Promise<ObjectResponseDto> {
    return this.objectsService.getObject(objectId, userId);
  }

  @Post('generate')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Generate a 3D object from JPEG images',
    description:
      'Uploads 4–6 JPEG images, checks coin balance, forwards them to the Python SOG generator, and stores the result. PUBLIC = shop listing (2 coins), EXCLUSIVE = private only (5 coins).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'description', 'listingType', 'images'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        listingType: { type: 'string', enum: ['PUBLIC', 'EXCLUSIVE'] },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          minItems: 4,
          maxItems: 6,
        },
      },
    },
  })
  @ApiResponse({ status: 200, type: ObjectResponseDto })
  @UseInterceptors(FilesInterceptor('images', 6, jpegImageUploadOptions))
  generateObject(
    @CurrentUserId() userId: string,
    @Body() body: GenerateObjectDto,
    @UploadedFiles() images: Express.Multer.File[],
  ): Promise<ObjectResponseDto> {
    if (!images?.length) {
      throw new BadRequestException('Between 4 and 6 JPEG images are required');
    }
    return this.objectsService.generateObjectFromImages(
      userId,
      body.title,
      body.description,
      images,
      body.listingType,
    );
  }

  @Post('exclusive')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create an exclusive object (5 coins)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'description', 'images'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('images', 6, jpegImageUploadOptions))
  createExclusive(
    @CurrentUserId() userId: string,
    @Body() body: CreateObjectBodyDto,
    @UploadedFiles() images: Express.Multer.File[],
  ): Promise<ObjectResponseDto> {
    if (!images?.length) {
      throw new BadRequestException('Images are required');
    }
    return this.objectsService.createExclusiveObject(
      userId,
      body.title,
      body.description,
      images,
    );
  }

  @Post('public')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a public object (2 coins)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'description', 'images'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('images', 6, jpegImageUploadOptions))
  createPublic(
    @CurrentUserId() userId: string,
    @Body() body: CreateObjectBodyDto,
    @UploadedFiles() images: Express.Multer.File[],
  ): Promise<ObjectResponseDto> {
    if (!images?.length) {
      throw new BadRequestException('Images are required');
    }
    return this.objectsService.createPublicObject(
      userId,
      body.title,
      body.description,
      images,
    );
  }

  @Post(':objectId/gift')
  @ApiOperation({ summary: 'Gift an object to another user' })
  @ApiResponse({ status: 200, type: ObjectResponseDto })
  giftObject(
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @CurrentUserId() userId: string,
    @Body() body: GiftObjectDto,
  ): Promise<ObjectResponseDto> {
    return this.objectsService.giftObject(
      objectId,
      userId,
      body.recipientUserId,
    );
  }
}
