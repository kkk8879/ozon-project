import { UserRole } from '../lib/rbac';

export type AccountItem = {
  id: number;
  username: string;
  role: UserRole;
  displayName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAccountPayload = {
  username: string;
  password: string;
  role: UserRole;
  displayName?: string;
  isActive?: boolean;
};

export type UpdateAccountPayload = {
  role?: UserRole;
  displayName?: string;
  isActive?: boolean;
};
