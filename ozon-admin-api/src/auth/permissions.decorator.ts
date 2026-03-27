import { SetMetadata } from '@nestjs/common';
import { AppPermission } from './role.types';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: AppPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
