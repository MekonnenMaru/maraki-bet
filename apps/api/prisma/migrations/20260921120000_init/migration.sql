-- CreateTable
CREATE TABLE `Sport` (
    `id` INTEGER NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `syncedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Sport_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tournament` (
    `id` INTEGER NOT NULL,
    `sportId` INTEGER NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `categorySlug` VARCHAR(191) NULL,
    `categoryName` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `syncedAt` DATETIME(3) NOT NULL,

    INDEX `Tournament_sportId_idx`(`sportId`),
    UNIQUE INDEX `Tournament_sportId_slug_key`(`sportId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Participant` (
    `id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `shortName` VARCHAR(191) NULL,
    `abbr` VARCHAR(191) NULL,
    `syncedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Fixture` (
    `id` VARCHAR(64) NOT NULL,
    `sportId` INTEGER NOT NULL,
    `tournamentId` INTEGER NOT NULL,
    `seasonId` INTEGER NULL,
    `seasonName` VARCHAR(191) NULL,
    `homeId` INTEGER NULL,
    `awayId` INTEGER NULL,
    `startTime` DATETIME(3) NOT NULL,
    `statusId` INTEGER NOT NULL DEFAULT 0,
    `statusName` VARCHAR(191) NULL,
    `venueName` VARCHAR(191) NULL,
    `homeScore` INTEGER NULL,
    `awayScore` INTEGER NULL,
    `scoresJson` JSON NULL,
    `clockJson` JSON NULL,
    `syncedAt` DATETIME(3) NOT NULL,

    INDEX `Fixture_sportId_startTime_idx`(`sportId`, `startTime`),
    INDEX `Fixture_tournamentId_startTime_idx`(`tournamentId`, `startTime`),
    INDEX `Fixture_statusId_startTime_idx`(`statusId`, `startTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Market` (
    `id` INTEGER NOT NULL,
    `sportId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameShort` VARCHAR(191) NULL,
    `marketType` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NULL,
    `handicap` DECIMAL(10, 3) NULL,
    `marketLength` INTEGER NULL,
    `playerProp` BOOLEAN NOT NULL DEFAULT false,
    `syncedAt` DATETIME(3) NOT NULL,

    INDEX `Market_sportId_marketType_idx`(`sportId`, `marketType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Outcome` (
    `id` INTEGER NOT NULL,
    `marketId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `syncedAt` DATETIME(3) NOT NULL,

    INDEX `Outcome_marketId_idx`(`marketId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Bookmaker` (
    `slug` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `wsPregame` BOOLEAN NULL,
    `wsLive` BOOLEAN NULL,
    `syncedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncState` (
    `key` VARCHAR(64) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Tournament` ADD CONSTRAINT `Tournament_sportId_fkey` FOREIGN KEY (`sportId`) REFERENCES `Sport`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fixture` ADD CONSTRAINT `Fixture_sportId_fkey` FOREIGN KEY (`sportId`) REFERENCES `Sport`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fixture` ADD CONSTRAINT `Fixture_tournamentId_fkey` FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fixture` ADD CONSTRAINT `Fixture_homeId_fkey` FOREIGN KEY (`homeId`) REFERENCES `Participant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fixture` ADD CONSTRAINT `Fixture_awayId_fkey` FOREIGN KEY (`awayId`) REFERENCES `Participant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Market` ADD CONSTRAINT `Market_sportId_fkey` FOREIGN KEY (`sportId`) REFERENCES `Sport`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Outcome` ADD CONSTRAINT `Outcome_marketId_fkey` FOREIGN KEY (`marketId`) REFERENCES `Market`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
