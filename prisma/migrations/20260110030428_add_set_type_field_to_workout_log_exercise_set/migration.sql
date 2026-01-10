-- CreateEnum
CREATE TYPE "SetType" AS ENUM ('warmup', 'working', 'dropSet', 'superSet', 'giantSet', 'failureSet');

-- AlterTable
ALTER TABLE "WorkoutLogExerciseSet" ADD COLUMN     "setType" "SetType" NOT NULL DEFAULT 'working';
