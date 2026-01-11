/*
  Warnings:

  - Made the column `exerciseIndex` on table `WorkoutLogExercise` required. This step will fail if there are existing NULL values in that column.
  - Made the column `setIndex` on table `WorkoutLogExerciseSet` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Equipment_id_idx";

-- DropIndex
DROP INDEX "Equipment_title_idx";

-- DropIndex
DROP INDEX "Exercise_id_idx";

-- DropIndex
DROP INDEX "Gym_id_idx";

-- DropIndex
DROP INDEX "Membership_gymId_idx";

-- DropIndex
DROP INDEX "MuscleGroup_id_idx";

-- DropIndex
DROP INDEX "MuscleGroup_title_idx";

-- DropIndex
DROP INDEX "User_phoneE164_idx";

-- DropIndex
DROP INDEX "User_phone_idx";

-- DropIndex
DROP INDEX "WorkoutLog_createdAt_idx";

-- DropIndex
DROP INDEX "WorkoutLog_id_idx";

-- DropIndex
DROP INDEX "WorkoutLog_userId_idx";

-- DropIndex
DROP INDEX "WorkoutLogExercise_id_idx";

-- DropIndex
DROP INDEX "WorkoutLogExercise_workoutId_idx";

-- DropIndex
DROP INDEX "WorkoutLogExerciseSet_workoutExerciseId_idx";

-- AlterTable
ALTER TABLE "WorkoutLogExercise" ALTER COLUMN "exerciseIndex" SET NOT NULL;

-- AlterTable
ALTER TABLE "WorkoutLogExerciseSet" ALTER COLUMN "setIndex" SET NOT NULL;

-- CreateIndex
CREATE INDEX "WorkoutLog_userId_createdAt_idx" ON "WorkoutLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkoutLogExercise_workoutId_exerciseIndex_idx" ON "WorkoutLogExercise"("workoutId", "exerciseIndex");

-- CreateIndex
CREATE INDEX "WorkoutLogExerciseSet_workoutExerciseId_setIndex_idx" ON "WorkoutLogExerciseSet"("workoutExerciseId", "setIndex");
