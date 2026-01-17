-- AlterTable
ALTER TABLE "WorkoutLog" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "isEdited" BOOLEAN NOT NULL DEFAULT false;
