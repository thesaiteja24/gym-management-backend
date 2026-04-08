/*
  Warnings:

  - You are about to drop the column `referenceWeekId` on the `ProgramWeek` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `ProgramWeek` table. All the data in the column will be lost.
  - You are about to drop the column `versionId` on the `ProgramWeek` table. All the data in the column will be lost.
  - You are about to drop the column `currentDay` on the `UserProgram` table. All the data in the column will be lost.
  - You are about to drop the column `currentWeek` on the `UserProgram` table. All the data in the column will be lost.
  - You are about to drop the column `endedAt` on the `UserProgram` table. All the data in the column will be lost.
  - You are about to drop the column `versionId` on the `UserProgram` table. All the data in the column will be lost.
  - You are about to drop the `ProgramVersion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserProgramDayLog` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[programId,weekIndex]` on the table `ProgramWeek` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `programId` to the `ProgramWeek` table without a default value. This is not possible if the table is not empty.
  - Added the required column `durationWeeks` to the `UserProgram` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Program" DROP CONSTRAINT "Program_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ProgramVersion" DROP CONSTRAINT "ProgramVersion_programId_fkey";

-- DropForeignKey
ALTER TABLE "ProgramWeek" DROP CONSTRAINT "ProgramWeek_referenceWeekId_fkey";

-- DropForeignKey
ALTER TABLE "ProgramWeek" DROP CONSTRAINT "ProgramWeek_versionId_fkey";

-- DropForeignKey
ALTER TABLE "UserProgram" DROP CONSTRAINT "UserProgram_programId_fkey";

-- DropForeignKey
ALTER TABLE "UserProgram" DROP CONSTRAINT "UserProgram_versionId_fkey";

-- DropForeignKey
ALTER TABLE "UserProgramDayLog" DROP CONSTRAINT "UserProgramDayLog_programDayId_fkey";

-- DropForeignKey
ALTER TABLE "UserProgramDayLog" DROP CONSTRAINT "UserProgramDayLog_userProgramId_fkey";

-- DropIndex
DROP INDEX "ProgramDay_weekId_dayIndex_idx";

-- DropIndex
DROP INDEX "ProgramWeek_referenceWeekId_idx";

-- DropIndex
DROP INDEX "ProgramWeek_versionId_idx";

-- DropIndex
DROP INDEX "ProgramWeek_versionId_weekIndex_key";

-- DropIndex
DROP INDEX "UserProgram_userId_programId_idx";

-- DropIndex
DROP INDEX "UserProgram_versionId_idx";

-- AlterTable
ALTER TABLE "Program" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProgramWeek" DROP COLUMN "referenceWeekId",
DROP COLUMN "type",
DROP COLUMN "versionId",
ADD COLUMN     "programId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "UserProgram" DROP COLUMN "currentDay",
DROP COLUMN "currentWeek",
DROP COLUMN "endedAt",
DROP COLUMN "versionId",
ADD COLUMN     "durationWeeks" INTEGER NOT NULL,
ALTER COLUMN "startDate" SET DATA TYPE DATE;

-- DropTable
DROP TABLE "ProgramVersion";

-- DropTable
DROP TABLE "UserProgramDayLog";

-- CreateTable
CREATE TABLE "UserProgramWeek" (
    "id" TEXT NOT NULL,
    "userProgramId" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,

    CONSTRAINT "UserProgramWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProgramDay" (
    "id" TEXT NOT NULL,
    "userProgramWeekId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "isRestDay" BOOLEAN NOT NULL,
    "templateSnapshotId" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "workoutLogId" TEXT,

    CONSTRAINT "UserProgramDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProgramProgress" (
    "id" TEXT NOT NULL,
    "userProgramId" TEXT NOT NULL,
    "currentWeek" INTEGER NOT NULL DEFAULT 0,
    "currentDay" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProgramProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplateSnapshot" (
    "id" TEXT NOT NULL,
    "originalTemplateId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "exercises" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutTemplateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserProgramWeek_userProgramId_idx" ON "UserProgramWeek"("userProgramId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProgramWeek_userProgramId_weekIndex_key" ON "UserProgramWeek"("userProgramId", "weekIndex");

-- CreateIndex
CREATE INDEX "UserProgramDay_userProgramWeekId_idx" ON "UserProgramDay"("userProgramWeekId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProgramDay_userProgramWeekId_dayIndex_key" ON "UserProgramDay"("userProgramWeekId", "dayIndex");

-- CreateIndex
CREATE UNIQUE INDEX "UserProgramProgress_userProgramId_key" ON "UserProgramProgress"("userProgramId");

-- CreateIndex
CREATE INDEX "WorkoutTemplateSnapshot_originalTemplateId_idx" ON "WorkoutTemplateSnapshot"("originalTemplateId");

-- CreateIndex
CREATE INDEX "ProgramDay_weekId_idx" ON "ProgramDay"("weekId");

-- CreateIndex
CREATE INDEX "ProgramWeek_programId_idx" ON "ProgramWeek"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramWeek_programId_weekIndex_key" ON "ProgramWeek"("programId", "weekIndex");

-- CreateIndex
CREATE INDEX "UserProgram_userId_status_idx" ON "UserProgram"("userId", "status");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramWeek" ADD CONSTRAINT "ProgramWeek_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgram" ADD CONSTRAINT "UserProgram_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgramWeek" ADD CONSTRAINT "UserProgramWeek_userProgramId_fkey" FOREIGN KEY ("userProgramId") REFERENCES "UserProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgramDay" ADD CONSTRAINT "UserProgramDay_userProgramWeekId_fkey" FOREIGN KEY ("userProgramWeekId") REFERENCES "UserProgramWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgramDay" ADD CONSTRAINT "UserProgramDay_templateSnapshotId_fkey" FOREIGN KEY ("templateSnapshotId") REFERENCES "WorkoutTemplateSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgramProgress" ADD CONSTRAINT "UserProgramProgress_userProgramId_fkey" FOREIGN KEY ("userProgramId") REFERENCES "UserProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
