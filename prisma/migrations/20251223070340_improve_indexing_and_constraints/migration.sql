/*
  Warnings:

  - A unique constraint covering the columns `[title]` on the table `MuscleGroup` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "MuscleGroup" ADD COLUMN     "tags" TEXT[];

-- CreateIndex
CREATE INDEX "Equipment_id_idx" ON "Equipment"("id");

-- CreateIndex
CREATE INDEX "Equipment_title_idx" ON "Equipment"("title");

-- CreateIndex
CREATE INDEX "Exercise_id_idx" ON "Exercise"("id");

-- CreateIndex
CREATE INDEX "Exercise_title_idx" ON "Exercise"("title");

-- CreateIndex
CREATE INDEX "Exercise_primaryMuscleGroupId_idx" ON "Exercise"("primaryMuscleGroupId");

-- CreateIndex
CREATE INDEX "Exercise_equipmentId_idx" ON "Exercise"("equipmentId");

-- CreateIndex
CREATE INDEX "Gym_id_idx" ON "Gym"("id");

-- CreateIndex
CREATE INDEX "Gym_ownerId_idx" ON "Gym"("ownerId");

-- CreateIndex
CREATE INDEX "Gym_name_idx" ON "Gym"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MuscleGroup_title_key" ON "MuscleGroup"("title");

-- CreateIndex
CREATE INDEX "MuscleGroup_id_idx" ON "MuscleGroup"("id");

-- CreateIndex
CREATE INDEX "MuscleGroup_title_idx" ON "MuscleGroup"("title");

-- CreateIndex
CREATE INDEX "WorkoutLog_id_idx" ON "WorkoutLog"("id");

-- CreateIndex
CREATE INDEX "WorkoutLog_userId_idx" ON "WorkoutLog"("userId");

-- CreateIndex
CREATE INDEX "WorkoutLog_createdAt_idx" ON "WorkoutLog"("createdAt");

-- CreateIndex
CREATE INDEX "WorkoutLogExercise_id_idx" ON "WorkoutLogExercise"("id");
