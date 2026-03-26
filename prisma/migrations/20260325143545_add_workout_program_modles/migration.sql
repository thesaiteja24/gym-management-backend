-- CreateEnum
CREATE TYPE "UserProgramStatus" AS ENUM ('active', 'completed', 'paused', 'cancelled');

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramWeek" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,

    CONSTRAINT "ProgramWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramDay" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "templateId" TEXT,
    "isRestDay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProgramDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProgram" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "currentWeek" INTEGER NOT NULL DEFAULT 1,
    "currentDay" INTEGER NOT NULL DEFAULT 1,
    "status" "UserProgramStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProgramDayLog" (
    "id" TEXT NOT NULL,
    "userProgramId" TEXT NOT NULL,
    "programDayId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "workoutLogId" TEXT,

    CONSTRAINT "UserProgramDayLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Program_clientId_key" ON "Program"("clientId");

-- CreateIndex
CREATE INDEX "Program_createdBy_idx" ON "Program"("createdBy");

-- CreateIndex
CREATE INDEX "ProgramWeek_programId_weekIndex_idx" ON "ProgramWeek"("programId", "weekIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramWeek_programId_weekIndex_key" ON "ProgramWeek"("programId", "weekIndex");

-- CreateIndex
CREATE INDEX "ProgramDay_weekId_dayIndex_idx" ON "ProgramDay"("weekId", "dayIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramDay_weekId_dayIndex_key" ON "ProgramDay"("weekId", "dayIndex");

-- CreateIndex
CREATE INDEX "UserProgram_userId_idx" ON "UserProgram"("userId");

-- CreateIndex
CREATE INDEX "UserProgram_programId_idx" ON "UserProgram"("programId");

-- CreateIndex
CREATE INDEX "UserProgram_userId_programId_idx" ON "UserProgram"("userId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProgramDayLog_userProgramId_programDayId_key" ON "UserProgramDayLog"("userProgramId", "programDayId");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramWeek" ADD CONSTRAINT "ProgramWeek_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDay" ADD CONSTRAINT "ProgramDay_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "ProgramWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDay" ADD CONSTRAINT "ProgramDay_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgram" ADD CONSTRAINT "UserProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgram" ADD CONSTRAINT "UserProgram_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgramDayLog" ADD CONSTRAINT "UserProgramDayLog_userProgramId_fkey" FOREIGN KEY ("userProgramId") REFERENCES "UserProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgramDayLog" ADD CONSTRAINT "UserProgramDayLog_programDayId_fkey" FOREIGN KEY ("programDayId") REFERENCES "ProgramDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
