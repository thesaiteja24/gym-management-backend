/*
  Warnings:

  - A unique constraint covering the columns `[shareId]` on the table `WorkoutLog` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "WorkoutLog" ADD COLUMN     "shareId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutLog_shareId_key" ON "WorkoutLog"("shareId");
