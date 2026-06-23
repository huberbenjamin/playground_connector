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
import { imageUploadOptions } from '../common/multer-options';
import { ObjectsService } from './objects.service';
import {
  CreateObjectBodyDto,
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
  @UseInterceptors(FilesInterceptor('images', 6, imageUploadOptions))
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
  @UseInterceptors(FilesInterceptor('images', 6, imageUploadOptions))
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
