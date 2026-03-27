import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';
import {
  AppPermission,
  AppRole,
  normalizeRole,
  roleHasPermissions,
} from './role.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      userRole?: AppRole;
    }>();
    const headerValue = request.headers['x-user-role'];
    const roleInput = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const userRole = normalizeRole(roleInput);
    request.userRole = userRole;

    const requiredPermissions = this.reflector.getAllAndOverride<AppPermission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredPermissions && requiredPermissions.length > 0) {
      if (roleHasPermissions(userRole, requiredPermissions)) {
        return true;
      }

      throw new ForbiddenException(
        `当前角色(${userRole})无权限执行该操作，要求权限: ${requiredPermissions.join(', ')}`,
      );
    }

    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (requiredRoles.includes(userRole)) {
      return true;
    }

    throw new ForbiddenException(
      `当前角色(${userRole})无权限执行该操作，要求角色: ${requiredRoles.join(', ')}`,
    );
  }
}
