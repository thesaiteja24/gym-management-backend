-- CreateEnum
CREATE TYPE "HabitCategory" AS ENUM ('training', 'nutrition', 'recovery', 'bodyMetrics', 'lifestyle');

-- CreateEnum
CREATE TYPE "HabitTargetPeriod" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "HabitLogSource" AS ENUM ('manual', 'internal', 'integration');

-- CreateEnum
CREATE TYPE "InternalHabitMetric" AS ENUM ('workoutCompleted', 'programDayCompleted', 'weightLogged');

-- CreateEnum
CREATE TYPE "HabitReminderDeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- AlterEnum
ALTER TYPE "HabitSource" ADD VALUE 'integration';

-- AlterEnum
BEGIN;
CREATE TYPE "HabitTrackingType_new" AS ENUM ('binary', 'quantity', 'duration', 'count');
ALTER TABLE "Habit" ALTER COLUMN "trackingType" TYPE "HabitTrackingType_new" USING (
  CASE
    WHEN "trackingType"::text = 'streak' THEN 'binary'
    ELSE "trackingType"::text
  END::"HabitTrackingType_new"
);
ALTER TYPE "HabitTrackingType" RENAME TO "HabitTrackingType_old";
ALTER TYPE "HabitTrackingType_new" RENAME TO "HabitTrackingType";
DROP TYPE "public"."HabitTrackingType_old";
COMMIT;

-- DropIndex
DROP INDEX "Habit_userId_idx";

-- DropIndex
DROP INDEX "HabitLog_habitId_date_idx";

-- AlterTable
ALTER TABLE "Habit" DROP COLUMN "footerType",
DROP COLUMN "internalMetricId",
ADD COLUMN     "category" "HabitCategory" NOT NULL DEFAULT 'lifestyle',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "endDate" DATE,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "internalMetric" "InternalHabitMetric",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startDate" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "targetPeriod" "HabitTargetPeriod" NOT NULL DEFAULT 'daily',
ALTER COLUMN "colorScheme" DROP NOT NULL;

ALTER TABLE "Habit" ALTER COLUMN "category" DROP DEFAULT,
ALTER COLUMN "startDate" DROP DEFAULT;

-- AlterTable
ALTER TABLE "HabitLog" ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "source" "HabitLogSource" NOT NULL DEFAULT 'manual',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "value" DROP NOT NULL;

ALTER TABLE "HabitLog" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN     "weekStartsOn" INTEGER NOT NULL DEFAULT 1;

-- DropEnum
DROP TYPE "HabitFooterType";

-- CreateTable
CREATE TABLE "HabitReminder" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "nextTriggerAt" TIMESTAMP(3),
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitReminderDelivery" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "HabitReminderDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "providerId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitReminderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HabitReminder_habitId_idx" ON "HabitReminder"("habitId");

-- CreateIndex
CREATE INDEX "HabitReminder_isEnabled_nextTriggerAt_idx" ON "HabitReminder"("isEnabled", "nextTriggerAt");

-- CreateIndex
CREATE INDEX "HabitReminderDelivery_status_scheduledAt_idx" ON "HabitReminderDelivery"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "HabitReminderDelivery_reminderId_scheduledAt_key" ON "HabitReminderDelivery"("reminderId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Habit_userId_isActive_idx" ON "Habit"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Habit_userId_category_idx" ON "Habit"("userId", "category");

-- CreateIndex
CREATE INDEX "Habit_userId_source_internalMetric_idx" ON "Habit"("userId", "source", "internalMetric");

-- CreateIndex
CREATE INDEX "HabitLog_date_idx" ON "HabitLog"("date");

-- AddForeignKey
ALTER TABLE "HabitReminder" ADD CONSTRAINT "HabitReminder_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitReminderDelivery" ADD CONSTRAINT "HabitReminderDelivery_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "HabitReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
