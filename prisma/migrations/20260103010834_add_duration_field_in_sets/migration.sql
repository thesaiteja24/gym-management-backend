-- AlterEnum
ALTER TYPE "ExerciseType" ADD VALUE 'durationOnly';

-- AlterTable
ALTER TABLE "WorkoutLogExerciseSet" ADD COLUMN     "restSeconds" INTEGER;
