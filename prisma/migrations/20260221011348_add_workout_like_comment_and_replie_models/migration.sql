-- AlterTable
ALTER TABLE "WorkoutLog" ADD COLUMN     "commentsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "likesCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WorkoutLike" (
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutLike_pkey" PRIMARY KEY ("userId","workoutId")
);

-- CreateTable
CREATE TABLE "WorkoutComment" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkoutComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutCommentLike" (
    "userId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutCommentLike_pkey" PRIMARY KEY ("userId","commentId")
);

-- CreateIndex
CREATE INDEX "WorkoutLike_workoutId_idx" ON "WorkoutLike"("workoutId");

-- CreateIndex
CREATE INDEX "WorkoutComment_workoutId_parentId_idx" ON "WorkoutComment"("workoutId", "parentId");

-- CreateIndex
CREATE INDEX "WorkoutComment_workoutId_createdAt_idx" ON "WorkoutComment"("workoutId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkoutComment_parentId_idx" ON "WorkoutComment"("parentId");

-- CreateIndex
CREATE INDEX "WorkoutComment_userId_idx" ON "WorkoutComment"("userId");

-- CreateIndex
CREATE INDEX "WorkoutCommentLike_commentId_idx" ON "WorkoutCommentLike"("commentId");

-- AddForeignKey
ALTER TABLE "WorkoutLike" ADD CONSTRAINT "WorkoutLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLike" ADD CONSTRAINT "WorkoutLike_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "WorkoutLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutComment" ADD CONSTRAINT "WorkoutComment_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "WorkoutLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutComment" ADD CONSTRAINT "WorkoutComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutComment" ADD CONSTRAINT "WorkoutComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkoutComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutCommentLike" ADD CONSTRAINT "WorkoutCommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutCommentLike" ADD CONSTRAINT "WorkoutCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "WorkoutComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
