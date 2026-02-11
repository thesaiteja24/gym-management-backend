-- CreateEnum
CREATE TYPE "FitnessGoal" AS ENUM ('loseWeight', 'gainMuscle', 'improveEndurance', 'improveFlexibility', 'improveStrength', 'improveOverallFitness');

-- CreateEnum
CREATE TYPE "FitnessLevel" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('bodyweight', 'dumbbells', 'barbells', 'kettlebells', 'resistanceBands', 'machines', 'other');

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "type" "EquipmentType";

-- CreateTable
CREATE TABLE "UserFitnessProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fitnessGoal" "FitnessGoal",
    "fitnessLevel" "FitnessLevel",
    "injuries" TEXT,
    "availableEquipment" "EquipmentType"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFitnessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserFitnessProfile_userId_key" ON "UserFitnessProfile"("userId");

-- AddForeignKey
ALTER TABLE "UserFitnessProfile" ADD CONSTRAINT "UserFitnessProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
