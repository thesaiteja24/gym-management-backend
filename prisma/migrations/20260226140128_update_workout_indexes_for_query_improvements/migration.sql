-- DropIndex
DROP INDEX "WorkoutLog_userId_createdAt_idx";

-- CreateIndex
CREATE INDEX "WorkoutLog_userId_deletedAt_createdAt_idx" ON "WorkoutLog"("userId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "WorkoutLog_visibility_deletedAt_userId_createdAt_idx" ON "WorkoutLog"("visibility", "deletedAt", "userId", "createdAt");
