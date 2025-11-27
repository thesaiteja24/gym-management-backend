/*
  Warnings:

  - A unique constraint covering the columns `[title]` on the table `Equipment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "dateOfBirth" SET DATA TYPE DATE;

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_title_key" ON "Equipment"("title");
