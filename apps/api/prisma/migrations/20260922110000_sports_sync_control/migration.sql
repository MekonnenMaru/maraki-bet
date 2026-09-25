-- Local Maraki config fields (provider data stays on external IDs)
ALTER TABLE `Sport`
  ADD COLUMN `provider` VARCHAR(32) NOT NULL DEFAULT 'oddspapi',
  ADD COLUMN `visible` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `displayOrder` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lastSyncedAt` DATETIME(3) NULL;

CREATE INDEX `Sport_enabled_displayOrder_idx` ON `Sport`(`enabled`, `displayOrder`);

ALTER TABLE `Tournament`
  ADD COLUMN `provider` VARCHAR(32) NOT NULL DEFAULT 'oddspapi',
  ADD COLUMN `visible` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `displayOrder` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lastSyncedAt` DATETIME(3) NULL;

CREATE INDEX `Tournament_enabled_visible_idx` ON `Tournament`(`enabled`, `visible`);

ALTER TABLE `Participant`
  ADD COLUMN `provider` VARCHAR(32) NOT NULL DEFAULT 'oddspapi',
  ADD COLUMN `lastSyncedAt` DATETIME(3) NULL;

ALTER TABLE `Fixture`
  ADD COLUMN `provider` VARCHAR(32) NOT NULL DEFAULT 'oddspapi',
  ADD COLUMN `manualStatusOverride` VARCHAR(32) NULL,
  ADD COLUMN `visible` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `bettingEnabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `lastSyncedAt` DATETIME(3) NULL;

CREATE INDEX `Fixture_visible_bettingEnabled_idx` ON `Fixture`(`visible`, `bettingEnabled`);

ALTER TABLE `Market`
  ADD COLUMN `provider` VARCHAR(32) NOT NULL DEFAULT 'oddspapi',
  ADD COLUMN `enabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `visible` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `bettingEnabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `displayOrder` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lastSyncedAt` DATETIME(3) NULL;

CREATE INDEX `Market_enabled_visible_idx` ON `Market`(`enabled`, `visible`);

ALTER TABLE `Outcome`
  ADD COLUMN `provider` VARCHAR(32) NOT NULL DEFAULT 'oddspapi',
  ADD COLUMN `lastSyncedAt` DATETIME(3) NULL;

CREATE TABLE `SyncConfiguration` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `masterEnabled` BOOLEAN NOT NULL DEFAULT true,
  `automaticEnabled` BOOLEAN NOT NULL DEFAULT false,
  `scheduleType` VARCHAR(16) NOT NULL DEFAULT 'INTERVAL',
  `intervalValue` INTEGER NOT NULL DEFAULT 5,
  `intervalUnit` VARCHAR(16) NOT NULL DEFAULT 'MINUTES',
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'Africa/Addis_Ababa',
  `retryEnabled` BOOLEAN NOT NULL DEFAULT true,
  `maxRetries` INTEGER NOT NULL DEFAULT 3,
  `lastRunAt` DATETIME(3) NULL,
  `nextRunAt` DATETIME(3) NULL,
  `lastSuccessAt` DATETIME(3) NULL,
  `lastError` VARCHAR(500) NULL,
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SyncJob` (
  `id` VARCHAR(191) NOT NULL,
  `type` VARCHAR(16) NOT NULL,
  `trigger` VARCHAR(16) NOT NULL,
  `scope` VARCHAR(32) NOT NULL,
  `scopeId` VARCHAR(64) NULL,
  `status` VARCHAR(16) NOT NULL,
  `resourcesJson` JSON NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  `durationMs` INTEGER NULL,
  `createdCount` INTEGER NOT NULL DEFAULT 0,
  `updatedCount` INTEGER NOT NULL DEFAULT 0,
  `skippedCount` INTEGER NOT NULL DEFAULT 0,
  `failedCount` INTEGER NOT NULL DEFAULT 0,
  `errorMessage` TEXT NULL,
  `resultJson` JSON NULL,
  `startedBy` VARCHAR(64) NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SyncJob_startedAt_idx` ON `SyncJob`(`startedAt`);
CREATE INDEX `SyncJob_status_startedAt_idx` ON `SyncJob`(`status`, `startedAt`);

CREATE TABLE `AuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(64) NULL,
  `actorName` VARCHAR(64) NULL,
  `action` VARCHAR(64) NOT NULL,
  `resource` VARCHAR(64) NOT NULL,
  `resourceId` VARCHAR(64) NULL,
  `oldValue` JSON NULL,
  `newValue` JSON NULL,
  `ip` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AuditLog_createdAt_idx` ON `AuditLog`(`createdAt`);
CREATE INDEX `AuditLog_resource_resourceId_idx` ON `AuditLog`(`resource`, `resourceId`);

INSERT INTO `SyncConfiguration` (`id`, `masterEnabled`, `automaticEnabled`, `scheduleType`, `intervalValue`, `intervalUnit`, `timezone`, `retryEnabled`, `maxRetries`, `updatedAt`)
VALUES (1, true, false, 'INTERVAL', 5, 'MINUTES', 'Africa/Addis_Ababa', true, 3, CURRENT_TIMESTAMP(3));
