-- DropForeignKey
ALTER TABLE "WorkoutLogExercise" DROP CONSTRAINT "WorkoutLogExercise_workoutId_fkey";

-- DropForeignKey
ALTER TABLE "WorkoutLogExerciseSet" DROP CONSTRAINT "WorkoutLogExerciseSet_workoutExerciseId_fkey";

-- AddForeignKey
ALTER TABLE "WorkoutLogExercise" ADD CONSTRAINT "WorkoutLogExercise_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "WorkoutLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLogExerciseSet" ADD CONSTRAINT "WorkoutLogExerciseSet_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "WorkoutLogExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
