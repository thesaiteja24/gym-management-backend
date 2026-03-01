-- AlterTable
ALTER TABLE "UserFitnessProfile" ADD COLUMN     "targetDate" DATE,
ADD COLUMN     "targetWeight" DECIMAL(6,2);

-- CreateTable
CREATE TABLE "UserMeasurement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weight" DECIMAL(6,2),
    "waist" DECIMAL(6,2),
    "bodyFat" DECIMAL(5,2),
    "leanBodyMass" DECIMAL(6,2),
    "neck" DECIMAL(6,2),
    "shoulders" DECIMAL(6,2),
    "chest" DECIMAL(6,2),
    "abdomen" DECIMAL(6,2),
    "hips" DECIMAL(6,2),
    "leftBicep" DECIMAL(6,2),
    "rightBicep" DECIMAL(6,2),
    "leftForearm" DECIMAL(6,2),
    "rightForearm" DECIMAL(6,2),
    "leftThigh" DECIMAL(6,2),
    "rightThigh" DECIMAL(6,2),
    "leftCalf" DECIMAL(6,2),
    "rightCalf" DECIMAL(6,2),
    "notes" TEXT,
    "progressPicUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserMeasurement_userId_date_idx" ON "UserMeasurement"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "UserMeasurement_userId_date_key" ON "UserMeasurement"("userId", "date");

-- AddForeignKey
ALTER TABLE "UserMeasurement" ADD CONSTRAINT "UserMeasurement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
