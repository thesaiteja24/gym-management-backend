/*
  Warnings:

  - The values [none] on the enum `HabitFooterType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "HabitFooterType_new" AS ENUM ('weeklyStreak', 'weeklyCount');
ALTER TABLE "public"."Habit" ALTER COLUMN "footerType" DROP DEFAULT;
ALTER TABLE "Habit" ALTER COLUMN "footerType" TYPE "HabitFooterType_new" USING ("footerType"::text::"HabitFooterType_new");
ALTER TYPE "HabitFooterType" RENAME TO "HabitFooterType_old";
ALTER TYPE "HabitFooterType_new" RENAME TO "HabitFooterType";
DROP TYPE "public"."HabitFooterType_old";
ALTER TABLE "Habit" ALTER COLUMN "footerType" SET DEFAULT 'weeklyStreak';
COMMIT;

-- AlterTable
ALTER TABLE "Habit" ALTER COLUMN "footerType" SET DEFAULT 'weeklyStreak';
