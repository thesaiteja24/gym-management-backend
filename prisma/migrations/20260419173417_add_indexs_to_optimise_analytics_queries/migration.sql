-- CreateIndex
CREATE INDEX "WorkoutLog_userId_createdAt_idx" ON "WorkoutLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkoutLogExercise_workoutId_idx" ON "WorkoutLogExercise"("workoutId");

-- CreateIndex
CREATE INDEX "WorkoutLogExerciseSet_workoutExerciseId_idx" ON "WorkoutLogExerciseSet"("workoutExerciseId");
