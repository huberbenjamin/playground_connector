import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  PaginatedUsersResponseDto,
  UserResponseDto,
} from '../../common/dto/api-response.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @ApiOperation({ summary: 'List users with pagination' })
  @ApiResponse({ status: 200, type: PaginatedUsersResponseDto })
  async listUsers(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedUsersResponseDto> {
    return this.adminService.listUsers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUser(@Param('id') id: string): Promise<UserResponseDto> {
    return this.adminService.getUserById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user role or active status' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 403, description: 'Protected admin account' })
  async updateUser(
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.adminService.updateUser(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete user (deactivate)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 403, description: 'Protected admin account' })
  async deleteUser(@Param('id') id: string): Promise<UserResponseDto> {
    return this.adminService.softDeleteUser(id);
  }
}
