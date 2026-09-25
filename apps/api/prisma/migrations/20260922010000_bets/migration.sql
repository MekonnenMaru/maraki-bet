-- CreateTable
CREATE TABLE `Bet` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `couponCode` VARCHAR(32) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACCEPTED',
    `stake` DECIMAL(18, 2) NOT NULL,
    `vat` DECIMAL(18, 2) NOT NULL,
    `netStake` DECIMAL(18, 2) NOT NULL,
    `combinedOdds` DECIMAL(12, 4) NOT NULL,
    `bonus` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `possibleWin` DECIMAL(18, 2) NOT NULL,
    `acceptChanges` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Bet_couponCode_key`(`couponCode`),
    INDEX `Bet_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BetSelection` (
    `id` VARCHAR(191) NOT NULL,
    `betId` VARCHAR(191) NOT NULL,
    `fixtureId` VARCHAR(64) NOT NULL,
    `marketId` INTEGER NOT NULL,
    `outcomeId` INTEGER NOT NULL,
    `playerId` INTEGER NOT NULL DEFAULT 0,
    `marketName` VARCHAR(128) NOT NULL,
    `selection` VARCHAR(128) NOT NULL,
    `fixtureLabel` VARCHAR(255) NOT NULL,
    `placedOdds` DECIMAL(12, 4) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',

    INDEX `BetSelection_betId_idx`(`betId`),
    INDEX `BetSelection_fixtureId_idx`(`fixtureId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Bet` ADD CONSTRAINT `Bet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BetSelection` ADD CONSTRAINT `BetSelection_betId_fkey` FOREIGN KEY (`betId`) REFERENCES `Bet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
