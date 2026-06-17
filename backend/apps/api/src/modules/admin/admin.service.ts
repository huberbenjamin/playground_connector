import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  PaginatedUsersResponseDto,
  UserResponseDto,
} from '../../common/dto/api-response.dto';
import { toUserResponseDto } from '../../common/dto/user-response.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async listUsers(query: PaginationQueryDto): Promise<PaginatedUsersResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    return {
      items: items.map(toUserResponseDto),
      total,
    };
  }

  async getUserById(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return toUserResponseDto(user);
  }

  async updateUser(id: string, dto: AdminUpdateUserDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (this.isSeededAdmin(user)) {
      if (dto.isActive === false) {
        throw new ForbiddenException(
          'The seeded admin account cannot be deactivated',
        );
      }
    }

    if (dto.isActive === undefined && dto.role === undefined) {
      throw new BadRequestException('At least one field must be provided');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
      },
    });

    return toUserResponseDto(updatedUser);
  }

  async softDeleteUser(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (this.isSeededAdmin(user)) {
      throw new ForbiddenException(
        'The seeded admin account cannot be deleted',
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return toUserResponseDto(updatedUser);
  }

  private isSeededAdmin(user: User): boolean {
    const adminEmail = this.configService.get<string>('app.adminEmail');
    return user.email.toLowerCase() === adminEmail?.toLowerCase();
  }
}
