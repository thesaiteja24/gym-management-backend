/*
  Warnings:

  - You are about to drop the column `programId` on the `ProgramWeek` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[versionId,weekIndex]` on the table `ProgramWeek` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `experienceLevel` to the `Program` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `ProgramWeek` table without a default value. This is not possible if the table is not empty.
  - Added the required column `versionId` to the `ProgramWeek` table without a default value. This is not possible if the table is not empty.
  - Added the required column `versionId` to the `UserProgram` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProgressionType" AS ENUM ('linear', 'doubleProgression');

-- CreateEnum
CREATE TYPE "ProgramWeekType" AS ENUM ('base', 'progression', 'deload');

-- DropForeignKey
ALTER TABLE "ProgramDay" DROP CONSTRAINT "ProgramDay_templateId_fkey";

-- DropForeignKey
ALTER TABLE "ProgramWeek" DROP CONSTRAINT "ProgramWeek_programId_fkey";

-- DropIndex
DROP INDEX "ProgramWeek_programId_weekIndex_idx";

-- DropIndex
DROP INDEX "ProgramWeek_programId_weekIndex_key";

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "durationOptions" INTEGER[],
ADD COLUMN     "experienceLevel" "FitnessLevel" NOT NULL;

-- AlterTable
ALTER TABLE "ProgramWeek" DROP COLUMN "programId",
ADD COLUMN     "referenceWeekId" TEXT,
ADD COLUMN     "type" "ProgramWeekType" NOT NULL,
ADD COLUMN     "versionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "UserProgram" ADD COLUMN     "versionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WorkoutTemplate" ADD COLUMN     "isGlobal" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "programId" TEXT;

-- AlterTable
ALTER TABLE "WorkoutTemplateSet" ADD COLUMN     "autoProgress" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxReps" INTEGER,
ADD COLUMN     "minReps" INTEGER,
ADD COLUMN     "progressionStep" DECIMAL(65,30),
ADD COLUMN     "progressionType" "ProgressionType";

-- CreateTable
CREATE TABLE "ProgramVersion" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramVersion_programId_version_key" ON "ProgramVersion"("programId", "version");

-- CreateIndex
CREATE INDEX "ProgramWeek_versionId_idx" ON "ProgramWeek"("versionId");

-- CreateIndex
CREATE INDEX "ProgramWeek_referenceWeekId_idx" ON "ProgramWeek"("referenceWeekId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramWeek_versionId_weekIndex_key" ON "ProgramWeek"("versionId", "weekIndex");

-- CreateIndex
CREATE INDEX "UserProgram_versionId_idx" ON "UserProgram"("versionId");

-- AddForeignKey
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramVersion" ADD CONSTRAINT "ProgramVersion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramWeek" ADD CONSTRAINT "ProgramWeek_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramWeek" ADD CONSTRAINT "ProgramWeek_referenceWeekId_fkey" FOREIGN KEY ("referenceWeekId") REFERENCES "ProgramWeek"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDay" ADD CONSTRAINT "ProgramDay_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgram" ADD CONSTRAINT "UserProgram_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
