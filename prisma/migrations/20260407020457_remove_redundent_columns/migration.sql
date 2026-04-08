/*
  Warnings:

  - You are about to drop the column `programId` on the `WorkoutTemplate` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "WorkoutTemplate" DROP CONSTRAINT "WorkoutTemplate_programId_fkey";

-- AlterTable
ALTER TABLE "WorkoutTemplate" DROP COLUMN "programId";
