-- CreateEnum
CREATE TYPE "WorkoutLogVisibility" AS ENUM ('public', 'private');

-- AlterTable
ALTER TABLE "WorkoutLog" ADD COLUMN     "visibility" "WorkoutLogVisibility" NOT NULL DEFAULT 'public';
