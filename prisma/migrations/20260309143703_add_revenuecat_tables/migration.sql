-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPro" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proExpirationDate" TIMESTAMP(3),
ADD COLUMN     "proSubscriptionId" TEXT;

-- CreateTable
CREATE TABLE "RevenueCatEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "eventTimestamp" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueCatEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RevenueCatEvent_appUserId_idx" ON "RevenueCatEvent"("appUserId");
