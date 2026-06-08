DROP INDEX "Habit_userId_source_internalMetric_idx";

CREATE UNIQUE INDEX "Habit_userId_source_internalMetric_key" ON "Habit"("userId", "source", "internalMetric");
