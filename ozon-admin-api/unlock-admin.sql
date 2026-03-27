UPDATE "UserAccount"
SET "failedLoginCount" = 0,
    "lockedUntil" = NULL,
    "mustChangePassword" = 0,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "username" = 'admin';
