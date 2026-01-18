-- CreateTable
CREATE TABLE "WorkoutTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplateExerciseGroup" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "groupType" "ExerciseGroupType" NOT NULL,
    "groupIndex" INTEGER NOT NULL,
    "restSeconds" INTEGER,

    CONSTRAINT "WorkoutTemplateExerciseGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplateExercise" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "exerciseIndex" INTEGER NOT NULL,
    "exerciseGroupId" TEXT,

    CONSTRAINT "WorkoutTemplateExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplateSet" (
    "id" TEXT NOT NULL,
    "templateExerciseId" TEXT NOT NULL,
    "setIndex" INTEGER NOT NULL,
    "setType" "SetType" NOT NULL DEFAULT 'working',
    "weight" DECIMAL(8,3),
    "reps" INTEGER,
    "rpe" INTEGER,
    "durationSeconds" INTEGER,
    "restSeconds" INTEGER,

    CONSTRAINT "WorkoutTemplateSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutTemplate_userId_idx" ON "WorkoutTemplate"("userId");

-- CreateIndex
CREATE INDEX "WorkoutTemplateExerciseGroup_templateId_groupIndex_idx" ON "WorkoutTemplateExerciseGroup"("templateId", "groupIndex");

-- CreateIndex
CREATE INDEX "WorkoutTemplateExercise_templateId_exerciseIndex_idx" ON "WorkoutTemplateExercise"("templateId", "exerciseIndex");

-- CreateIndex
CREATE INDEX "WorkoutTemplateSet_templateExerciseId_setIndex_idx" ON "WorkoutTemplateSet"("templateExerciseId", "setIndex");

-- AddForeignKey
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateExerciseGroup" ADD CONSTRAINT "WorkoutTemplateExerciseGroup_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateExercise" ADD CONSTRAINT "WorkoutTemplateExercise_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateExercise" ADD CONSTRAINT "WorkoutTemplateExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateExercise" ADD CONSTRAINT "WorkoutTemplateExercise_exerciseGroupId_fkey" FOREIGN KEY ("exerciseGroupId") REFERENCES "WorkoutTemplateExerciseGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutTemplateSet" ADD CONSTRAINT "WorkoutTemplateSet_templateExerciseId_fkey" FOREIGN KEY ("templateExerciseId") REFERENCES "WorkoutTemplateExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
