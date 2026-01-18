-- AlterTable
ALTER TABLE "WorkoutLog" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkoutTemplate" ADD COLUMN     "deletedAt" TIMESTAMP(3);
