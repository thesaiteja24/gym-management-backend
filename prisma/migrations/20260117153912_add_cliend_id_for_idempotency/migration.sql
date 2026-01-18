/*
  Warnings:

  - A unique constraint covering the columns `[clientId]` on the table `WorkoutLog` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "WorkoutLog" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "WorkoutTemplateSet" ADD COLUMN     "note" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutLog_clientId_key" ON "WorkoutLog"("clientId");
