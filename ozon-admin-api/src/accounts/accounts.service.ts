import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserAccount } from '@prisma/client';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { ChangeFirstPasswordDto } from './dto/change-first-password.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MINUTES = 15;

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listAccounts() {
    await this.ensureDefaultAdmin();
    const rows = await this.prisma.userAccount.findMany({
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => this.toViewModel(row));
  }

  async createAccount(body: CreateAccountDto, role?: string, actorUserId?: string) {
    await this.ensureDefaultAdmin();
    this.validatePasswordStrength(body.password);

    const username = body.username.trim().toLowerCase();
    const displayName = body.displayName?.trim() || username;

    const existed = await this.prisma.userAccount.findUnique({
      where: { username },
    });
    if (existed) {
      throw new BadRequestException('用户名已存在');
    }

    const created = await this.prisma.userAccount.create({
      data: {
        username,
        passwordHash: this.hashPassword(body.password.trim()),
        role: body.role,
        displayName,
        isActive: body.isActive === false ? false : true,
        mustChangePassword: true,
      },
    });

    await this.auditService.writeLog({
      module: 'accounts',
      action: 'create_account',
      role,
      operator: actorUserId || undefined,
      targetType: 'account',
      targetId: created.id,
      detail: `创建账号 ${username}（角色: ${body.role}）`,
    });

    return {
      message: '账号创建成功（首次登录需改密）',
      data: this.toViewModel(created),
    };
  }

  async updateAccount(
    id: number,
    body: UpdateAccountDto,
    role?: string,
    actorUserId?: string,
  ) {
    const existing = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('账号不存在');

    const actorId = this.parseActorId(actorUserId);
    const nextIsActive =
      body.isActive === undefined ? existing.isActive : Boolean(body.isActive);
    if (actorId !== null && actorId === id && !nextIsActive) {
      throw new BadRequestException('不能停用当前登录账号');
    }

    const updated = await this.prisma.userAccount.update({
      where: { id },
      data: {
        role: body.role ?? existing.role,
        displayName:
          body.displayName?.trim() !== undefined
            ? body.displayName?.trim() || existing.username
            : existing.displayName || existing.username,
        isActive: nextIsActive,
      },
    });

    await this.auditService.writeLog({
      module: 'accounts',
      action: 'update_account',
      role,
      operator: actorUserId || undefined,
      targetType: 'account',
      targetId: id,
      detail: `更新账号 ${updated.username}`,
    });

    return {
      message: '账号更新成功',
      data: this.toViewModel(updated),
    };
  }

  async resetPassword(
    id: number,
    body: ResetPasswordDto,
    role?: string,
    actorUserId?: string,
  ) {
    const existing = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('账号不存在');
    this.validatePasswordStrength(body.password);

    await this.prisma.userAccount.update({
      where: { id },
      data: {
        passwordHash: this.hashPassword(body.password.trim()),
        mustChangePassword: true,
      },
    });

    await this.auditService.writeLog({
      module: 'accounts',
      action: 'reset_password',
      role,
      operator: actorUserId || undefined,
      targetType: 'account',
      targetId: id,
      detail: `重置账号密码 ${existing.username}`,
    });

    return { message: '密码重置成功（下次登录需改密）' };
  }

  async unlockAccount(id: number, role?: string, actorUserId?: string) {
    const existing = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('账号不存在');

    await this.prisma.userAccount.update({
      where: { id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    await this.auditService.writeLog({
      module: 'accounts',
      action: 'unlock_account',
      role,
      operator: actorUserId || undefined,
      targetType: 'account',
      targetId: id,
      detail: `解锁账号 ${existing.username}`,
    });

    return { message: '账号已解锁' };
  }

  async deleteAccount(id: number, role?: string, actorUserId?: string) {
    const existing = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('账号不存在');

    const actorId = this.parseActorId(actorUserId);
    if (actorId !== null && actorId === id) {
      throw new BadRequestException('不能删除当前登录账号');
    }

    const adminCount = await this.prisma.userAccount.count({
      where: { role: 'admin' },
    });
    if (existing.role === 'admin' && adminCount <= 1) {
      throw new BadRequestException('系统至少需要保留一个管理员账号');
    }

    await this.prisma.userAccount.delete({ where: { id } });

    await this.auditService.writeLog({
      module: 'accounts',
      action: 'delete_account',
      role,
      operator: actorUserId || undefined,
      targetType: 'account',
      targetId: id,
      detail: `删除账号 ${existing.username}`,
    });

    return { message: '账号删除成功' };
  }

  async login(body: LoginDto, client?: { ip?: string; userAgent?: string }) {
    await this.ensureDefaultAdmin();
    const username = body.username.trim().toLowerCase();
    const account = await this.prisma.userAccount.findUnique({
      where: { username },
    });
    const clientInfo = this.buildClientInfo(client);

    if (!account) {
      await this.auditService.writeLog({
        module: 'accounts',
        action: 'login_failed',
        role: 'unknown',
        operator: username,
        targetType: 'account',
        detail: `账号不存在 ${username}${clientInfo}`,
      });
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (account.lockedUntil && account.lockedUntil.getTime() > Date.now()) {
      await this.auditService.writeLog({
        module: 'accounts',
        action: 'login_locked',
        role: account.role,
        operator: account.username,
        targetType: 'account',
        targetId: account.id,
        detail: `账号锁定中，拒绝登录${clientInfo}`,
      });
      throw new UnauthorizedException(
        `账号已锁定，请于 ${account.lockedUntil.toLocaleString()} 后重试`,
      );
    }

    if (!account.isActive) {
      await this.auditService.writeLog({
        module: 'accounts',
        action: 'login_failed',
        role: account.role,
        operator: account.username,
        targetType: 'account',
        targetId: account.id,
        detail: `账号已停用${clientInfo}`,
      });
      throw new UnauthorizedException('账号已停用');
    }

    if (!this.verifyPassword(body.password.trim(), account.passwordHash)) {
      const nextFailedCount = account.failedLoginCount + 1;
      const lockNow = nextFailedCount >= LOGIN_MAX_FAILURES;
      const lockedUntil = lockNow
        ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000)
        : null;

      await this.prisma.userAccount.update({
        where: { id: account.id },
        data: {
          failedLoginCount: nextFailedCount,
          lockedUntil,
        },
      });

      await this.auditService.writeLog({
        module: 'accounts',
        action: lockNow ? 'login_locked' : 'login_failed',
        role: account.role,
        operator: account.username,
        targetType: 'account',
        targetId: account.id,
        detail: lockNow
          ? `连续失败${nextFailedCount}次，账号锁定${LOGIN_LOCK_MINUTES}分钟${clientInfo}`
          : `密码错误，第${nextFailedCount}次失败${clientInfo}`,
      });

      if (lockNow) {
        throw new UnauthorizedException(
          `登录失败次数过多，账号已锁定${LOGIN_LOCK_MINUTES}分钟`,
        );
      }
      throw new UnauthorizedException(
        `用户名或密码错误，剩余尝试次数${LOGIN_MAX_FAILURES - nextFailedCount}`,
      );
    }

    const loggedIn = await this.prisma.userAccount.update({
      where: { id: account.id },
      data: {
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    await this.auditService.writeLog({
      module: 'accounts',
      action: 'login',
      role: account.role,
      operator: account.username,
      targetType: 'account',
      targetId: account.id,
      detail: `账号登录 ${account.username}${clientInfo}`,
    });

    return {
      message: loggedIn.mustChangePassword ? '首次登录请先修改密码' : '登录成功',
      data: this.toViewModel(loggedIn),
      requirePasswordChange: loggedIn.mustChangePassword,
    };
  }

  async changeFirstPassword(body: ChangeFirstPasswordDto) {
    const username = body.username.trim().toLowerCase();
    const account = await this.prisma.userAccount.findUnique({
      where: { username },
    });

    if (!account) {
      throw new UnauthorizedException('账号不存在');
    }
    if (!this.verifyPassword(body.password.trim(), account.passwordHash)) {
      throw new UnauthorizedException('原密码错误');
    }
    if (!account.mustChangePassword) {
      throw new BadRequestException('该账号无需首次改密');
    }

    this.validatePasswordStrength(body.newPassword);

    await this.prisma.userAccount.update({
      where: { id: account.id },
      data: {
        passwordHash: this.hashPassword(body.newPassword.trim()),
        mustChangePassword: false,
      },
    });

    await this.auditService.writeLog({
      module: 'accounts',
      action: 'change_first_password',
      role: account.role,
      operator: account.username,
      targetType: 'account',
      targetId: account.id,
      detail: `首次改密 ${account.username}`,
    });

    return { message: '密码修改成功，请重新登录' };
  }

  private async ensureDefaultAdmin() {
    const count = await this.prisma.userAccount.count();
    if (count > 0) return;

    await this.prisma.userAccount.create({
      data: {
        username: 'admin',
        passwordHash: this.hashPassword('admin123'),
        role: 'admin',
        displayName: '管理员',
        isActive: true,
        mustChangePassword: true,
      },
    });
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${hash}`;
  }

  private verifyPassword(password: string, stored: string) {
    const [algorithm, salt, hashHex] = stored.split('$');
    if (algorithm !== 'scrypt' || !salt || !hashHex) return false;
    const hashBuffer = Buffer.from(hashHex, 'hex');
    const candidate = scryptSync(password, salt, hashBuffer.length);
    return timingSafeEqual(candidate, hashBuffer);
  }

  private validatePasswordStrength(password: string) {
    const value = password.trim();
    if (value.length < 8) {
      throw new BadRequestException('密码至少 8 位');
    }
    if (!/[A-Z]/.test(value) || !/[a-z]/.test(value)) {
      throw new BadRequestException('密码需同时包含大小写字母');
    }
    if (!/\d/.test(value)) {
      throw new BadRequestException('密码需至少包含一个数字');
    }
    if (!/[^\w\s]/.test(value)) {
      throw new BadRequestException('密码需至少包含一个特殊字符');
    }
  }

  private parseActorId(value?: string) {
    if (!value) return null;
    const id = Number.parseInt(value, 10);
    if (Number.isNaN(id)) return null;
    return id;
  }

  private buildClientInfo(client?: { ip?: string; userAgent?: string }) {
    const ip = client?.ip?.trim();
    const userAgent = client?.userAgent?.trim();
    const parts: string[] = [];
    if (ip) parts.push(`IP: ${ip}`);
    if (userAgent) parts.push(`UA: ${userAgent}`);
    if (parts.length === 0) return '';
    return `（${parts.join(' | ')}）`;
  }

  private toViewModel(row: UserAccount) {
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      displayName: row.displayName || row.username,
      isActive: row.isActive,
      mustChangePassword: row.mustChangePassword,
      failedLoginCount: row.failedLoginCount,
      lockedUntil: row.lockedUntil,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

