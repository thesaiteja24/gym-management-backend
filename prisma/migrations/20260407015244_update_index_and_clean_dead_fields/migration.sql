/*
  Warnings:

  - You are about to drop the column `isGlobal` on the `WorkoutTemplate` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "WorkoutTemplate" DROP CONSTRAINT "WorkoutTemplate_programId_fkey";

-- AlterTable
ALTER TABLE "WorkoutTemplate" DROP COLUMN "isGlobal";

-- CreateIndex
CREATE INDEX "ProgramDay_templateId_idx" ON "ProgramDay"("templateId");

-- AddForeignKey
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
