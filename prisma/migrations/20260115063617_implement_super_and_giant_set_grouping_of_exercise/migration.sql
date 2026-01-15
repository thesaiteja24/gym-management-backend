/*
  Warnings:

  - The values [superSet,giantSet] on the enum `SetType` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "ExerciseGroupType" AS ENUM ('superSet', 'giantSet');

-- AlterEnum
BEGIN;
CREATE TYPE "SetType_new" AS ENUM ('warmup', 'working', 'dropSet', 'failureSet');
ALTER TABLE "public"."WorkoutLogExerciseSet" ALTER COLUMN "setType" DROP DEFAULT;
ALTER TABLE "WorkoutLogExerciseSet" ALTER COLUMN "setType" TYPE "SetType_new" USING ("setType"::text::"SetType_new");
ALTER TYPE "SetType" RENAME TO "SetType_old";
ALTER TYPE "SetType_new" RENAME TO "SetType";
DROP TYPE "public"."SetType_old";
ALTER TABLE "WorkoutLogExerciseSet" ALTER COLUMN "setType" SET DEFAULT 'working';
COMMIT;

-- AlterTable
ALTER TABLE "WorkoutLogExercise" ADD COLUMN     "exerciseGroupId" TEXT;

-- CreateTable
CREATE TABLE "WorkoutLogExerciseGroup" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "type" "ExerciseGroupType" NOT NULL,
    "groupIndex" INTEGER NOT NULL,
    "restSeconds" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutLogExerciseGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutLogExerciseGroup_workoutId_groupIndex_idx" ON "WorkoutLogExerciseGroup"("workoutId", "groupIndex");

-- AddForeignKey
ALTER TABLE "WorkoutLogExerciseGroup" ADD CONSTRAINT "WorkoutLogExerciseGroup_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "WorkoutLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLogExercise" ADD CONSTRAINT "WorkoutLogExercise_exerciseGroupId_fkey" FOREIGN KEY ("exerciseGroupId") REFERENCES "WorkoutLogExerciseGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
