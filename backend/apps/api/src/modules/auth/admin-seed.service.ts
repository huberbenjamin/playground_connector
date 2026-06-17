import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { hashPassword } from '../../common/utils/password.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedAdminAccount();
  }

  private async seedAdminAccount(): Promise<void> {
    const adminEmail = this.configService.get<string>('app.adminEmail');
    const adminPassword = this.configService.get<string>('app.adminPassword');

    if (!adminEmail || !adminPassword) {
      this.logger.warn('Admin credentials not configured; skipping admin seed');
      return;
    }

    const normalizedEmail = adminEmail.toLowerCase();

    const existingAdmin = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingAdmin) {
      this.logger.log(`Admin account already exists: ${normalizedEmail}`);
      return;
    }

    const passwordHash = await hashPassword(adminPassword);

    await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: 'System',
        lastName: 'Admin',
        role: UserRole.ADMIN,
        emailVerified: true,
      },
    });

    this.logger.log(`Seeded admin account: ${normalizedEmail}`);
  }
}
