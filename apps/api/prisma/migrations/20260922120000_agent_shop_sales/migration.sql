-- Agent → Shop → Sale (cashier) hierarchy with per-entity permissions

CREATE TABLE `AgentProfile` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `displayName` VARCHAR(128) NOT NULL,
  `code` VARCHAR(32) NULL,
  `phone` VARCHAR(32) NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  `permissionsJson` JSON NULL,
  `notes` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `AgentProfile_userId_key`(`userId`),
  UNIQUE INDEX `AgentProfile_code_key`(`code`),
  INDEX `AgentProfile_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Shop` (
  `id` VARCHAR(191) NOT NULL,
  `agentId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `code` VARCHAR(32) NULL,
  `address` VARCHAR(255) NULL,
  `phone` VARCHAR(32) NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  `permissionsJson` JSON NULL,
  `notes` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `Shop_agentId_status_idx`(`agentId`, `status`),
  UNIQUE INDEX `Shop_agentId_code_key`(`agentId`, `code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ShopSale` (
  `id` VARCHAR(191) NOT NULL,
  `shopId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(64) NOT NULL,
  `code` VARCHAR(32) NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  `permissionsJson` JSON NULL,
  `notes` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ShopSale_userId_key`(`userId`),
  INDEX `ShopSale_shopId_status_idx`(`shopId`, `status`),
  UNIQUE INDEX `ShopSale_shopId_code_key`(`shopId`, `code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AgentProfile` ADD CONSTRAINT `AgentProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Shop` ADD CONSTRAINT `Shop_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `AgentProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ShopSale` ADD CONSTRAINT `ShopSale_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ShopSale` ADD CONSTRAINT `ShopSale_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
