-- Durable sync progress + pause/stop controls
ALTER TABLE `SyncJob`
  ADD COLUMN `progressPct` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `currentStep` VARCHAR(64) NULL,
  ADD COLUMN `progressMessage` VARCHAR(255) NULL,
  ADD COLUMN `pauseRequested` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `cancelRequested` BOOLEAN NOT NULL DEFAULT false;
