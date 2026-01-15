/*
  Warnings:

  - You are about to drop the column `type` on the `WorkoutLogExerciseGroup` table. All the data in the column will be lost.
  - Added the required column `groupType` to the `WorkoutLogExerciseGroup` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WorkoutLogExerciseGroup" DROP COLUMN "type",
ADD COLUMN     "groupType" "ExerciseGroupType" NOT NULL;
