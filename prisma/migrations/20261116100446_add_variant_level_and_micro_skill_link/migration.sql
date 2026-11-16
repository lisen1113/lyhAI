-- AlterTable
ALTER TABLE "daily_plan_items" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "microSkillId" TEXT,
ADD COLUMN     "variantLevel" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "questions_microSkillId_idx" ON "questions"("microSkillId");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_microSkillId_fkey" FOREIGN KEY ("microSkillId") REFERENCES "micro_skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
