import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { USER_ID_PATTERN } from '@marketplace/shared-types';
import { AdminAuthGuard } from '../auth/guards/auth.guards';
import { adminObjectUploadOptions } from '../common/multer-options';
import { AdminService } from './admin.service';
import {
  AddCoinsDto,
  AdminObjectResponseDto,
  AdminStatsResponseDto,
  AdminUserIdResponseDto,
  AdminUserResponseDto,
} from './dto/admin.dto';
import { CreateAdminObjectBodyDto } from '../objects/dto/objects.dto';
import { ObjectResponseDto } from '../objects/dto/objects.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('user-ids')
  @ApiOperation({ summary: 'List all user IDs ordered by state and activation time' })
  @ApiResponse({ status: 200, type: [AdminUserIdResponseDto] })
  getUserIds(): Promise<AdminUserIdResponseDto[]> {
    return this.adminService.getUserIds();
  }

  @Get('users')
  @ApiOperation({ summary: 'List all users' })
  @ApiResponse({ status: 200, type: [AdminUserResponseDto] })
  getUsers(): Promise<AdminUserResponseDto[]> {
    return this.adminService.getUsers();
  }

  @Get('objects')
  @ApiOperation({ summary: 'List all objects' })
  @ApiResponse({ status: 200, type: [AdminObjectResponseDto] })
  getObjects(): Promise<AdminObjectResponseDto[]> {
    return this.adminService.getObjects();
  }

  @Post('users/:userId/add-coins')
  @ApiOperation({ summary: 'Add coins to a user' })
  addCoins(
    @Param('userId') userId: string,
    @Body() body: AddCoinsDto,
  ) {
    if (!USER_ID_PATTERN.test(userId)) {
      throw new BadRequestException('userId must be exactly six digits');
    }
    return this.adminService.addCoins(userId, body.amount);
  }

  @Post('objects')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create an admin object' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'description', 'sog', 'thumbnail'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        sog: { type: 'string', format: 'binary' },
        thumbnail: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'sog', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      adminObjectUploadOptions,
    ),
  )
  createObject(
    @Body() body: CreateAdminObjectBodyDto,
    @UploadedFiles()
    files: { sog?: Express.Multer.File[]; thumbnail?: Express.Multer.File[] },
  ): Promise<ObjectResponseDto> {
    const sogFile = files.sog?.[0];
    const thumbnailFile = files.thumbnail?.[0];
    if (!sogFile || !thumbnailFile) {
      throw new BadRequestException('Both sog and thumbnail files are required');
    }
    return this.adminService.createAdminObject(
      body.title,
      body.description,
      sogFile,
      thumbnailFile,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get platform statistics' })
  @ApiResponse({ status: 200, type: AdminStatsResponseDto })
  getStats(): Promise<AdminStatsResponseDto> {
    return this.adminService.getStats();
  }
}
