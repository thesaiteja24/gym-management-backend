/*
  Warnings:

  - You are about to drop the column `countryCode` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `phoneE164` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `firstName` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `lastName` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `profilePicUrl` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `email` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `googleId` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `privacyPolicyAcceptedAt` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `privacyPolicyVersion` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropIndex
DROP INDEX "User_countryCode_idx";

-- DropIndex
DROP INDEX "User_phoneE164_key";

-- DropIndex
DROP INDEX "User_phone_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "countryCode",
DROP COLUMN "phone",
DROP COLUMN "phoneE164",
ALTER COLUMN "firstName" SET NOT NULL,
ALTER COLUMN "lastName" SET NOT NULL,
ALTER COLUMN "profilePicUrl" SET NOT NULL,
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "googleId" SET NOT NULL,
ALTER COLUMN "privacyPolicyAcceptedAt" SET NOT NULL,
ALTER COLUMN "privacyPolicyVersion" SET NOT NULL;

-- DropTable
DROP TABLE "Session";

-- CreateIndex
CREATE INDEX "WorkoutLog_userId_deletedAt_startTime_idx" ON "WorkoutLog"("userId", "deletedAt", "startTime");
