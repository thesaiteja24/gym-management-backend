-- AlterTable
ALTER TABLE "User" ADD COLUMN     "privacyPolicyAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "privacyPolicyVersion" TEXT DEFAULT '1.0';
