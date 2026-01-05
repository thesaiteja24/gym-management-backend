-- CreateEnum
CREATE TYPE "WeightUnits" AS ENUM ('kg', 'lbs');

-- CreateEnum
CREATE TYPE "LengthUnits" AS ENUM ('cm', 'inches');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredLengthUnit" "LengthUnits" NOT NULL DEFAULT 'cm',
ADD COLUMN     "preferredWeightUnit" "WeightUnits" NOT NULL DEFAULT 'kg';
