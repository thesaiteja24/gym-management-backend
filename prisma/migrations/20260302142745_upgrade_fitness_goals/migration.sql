-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('sedentary', 'lightlyActive', 'moderatelyActive', 'veryActive', 'athlete');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('weight', 'bodyFat');

-- AlterTable
ALTER TABLE "UserFitnessProfile" ADD COLUMN     "activityLevel" "ActivityLevel",
ADD COLUMN     "targetBodyFat" DECIMAL(5,2),
ADD COLUMN     "targetType" "TargetType",
ADD COLUMN     "weeklyWeightChange" DECIMAL(6,2);

-- CreateTable
CREATE TABLE "UserNutritionPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caloriesTarget" INTEGER,
    "proteinTarget" INTEGER,
    "calculatedTDEE" INTEGER,
    "deficitOrSurplus" INTEGER,
    "startDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNutritionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserNutritionPlan_userId_key" ON "UserNutritionPlan"("userId");

-- AddForeignKey
ALTER TABLE "UserNutritionPlan" ADD CONSTRAINT "UserNutritionPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
