CREATE TABLE "SyncTaskLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "storeCount" INTEGER NOT NULL,
    "successStoreCount" INTEGER NOT NULL,
    "failedStoreCount" INTEGER NOT NULL,
    "syncedOrderCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "storesSnapshot" TEXT NOT NULL,
    "failureDetail" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
