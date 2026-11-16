-- DropIndex
DROP INDEX "daily_plans_studentId_date_key";

-- CreateIndex
CREATE UNIQUE INDEX "daily_plans_studentId_date_primarySubject_key" ON "daily_plans"("studentId", "date", "primarySubject");
