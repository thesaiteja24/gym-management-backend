/*
  Warnings:

  - A unique constraint covering the columns `[workoutLogId]` on the table `UserProgramDay` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "UserProgramDay_workoutLogId_key" ON "UserProgramDay"("workoutLogId");

-- AddForeignKey
ALTER TABLE "UserProgramDay" ADD CONSTRAINT "UserProgramDay_workoutLogId_fkey" FOREIGN KEY ("workoutLogId") REFERENCES "WorkoutLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
