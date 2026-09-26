-- Guest coupon bookings (unpaid until cashier places)
CREATE TABLE `BookedCoupon` (
    `id` VARCHAR(191) NOT NULL,
    `couponCode` VARCHAR(32) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'BOOKED',
    `type` VARCHAR(16) NOT NULL,
    `stake` DECIMAL(18, 2) NOT NULL,
    `vat` DECIMAL(18, 2) NOT NULL,
    `netStake` DECIMAL(18, 2) NOT NULL,
    `combinedOdds` DECIMAL(12, 4) NOT NULL,
    `bonus` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `possibleWin` DECIMAL(18, 2) NOT NULL,
    `acceptChanges` BOOLEAN NOT NULL DEFAULT true,
    `expiresAt` DATETIME(3) NOT NULL,
    `placedBetId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BookedCoupon_couponCode_key`(`couponCode`),
    UNIQUE INDEX `BookedCoupon_placedBetId_key`(`placedBetId`),
    INDEX `BookedCoupon_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `BookedCoupon_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BookedCouponSelection` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `fixtureId` VARCHAR(64) NOT NULL,
    `marketId` INTEGER NOT NULL,
    `outcomeId` INTEGER NOT NULL,
    `playerId` INTEGER NOT NULL DEFAULT 0,
    `marketName` VARCHAR(128) NOT NULL,
    `selection` VARCHAR(128) NOT NULL,
    `fixtureLabel` VARCHAR(255) NOT NULL,
    `placedOdds` DECIMAL(12, 4) NOT NULL,
    `startTime` DATETIME(3) NULL,

    INDEX `BookedCouponSelection_bookingId_idx`(`bookingId`),
    INDEX `BookedCouponSelection_fixtureId_idx`(`fixtureId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BookedCouponSelection` ADD CONSTRAINT `BookedCouponSelection_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `BookedCoupon`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
