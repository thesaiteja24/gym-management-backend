/*
  Warnings:

  - A unique constraint covering the columns `[shareId]` on the table `WorkoutTemplate` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "WorkoutTemplate" ADD COLUMN     "shareId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutTemplate_shareId_key" ON "WorkoutTemplate"("shareId");
