-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "SubjectCode" AS ENUM ('PH', 'CH');

-- CreateEnum
CREATE TYPE "NodeLevel" AS ENUM ('SUBJECT', 'MODULE', 'UNIT', 'KNOWLEDGE_NODE');

-- CreateEnum
CREATE TYPE "PrereqStrength" AS ENUM ('HARD', 'SOFT');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'NUMERIC', 'STEP_BY_STEP');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('L1', 'L2', 'L3', 'L4', 'L5');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('FIRST_TRY_CORRECT', 'CORRECT_AFTER_HINT_1', 'CORRECT_AFTER_HINT_2', 'CORRECT_AFTER_HINT_3', 'CORRECT_AFTER_SOLUTION', 'WRONG', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MasteryStatus" AS ENUM ('NOT_STARTED', 'INTRO', 'LEARNING', 'BASIC', 'PROFICIENT', 'STABLE');

-- CreateEnum
CREATE TYPE "PlanSegment" AS ENUM ('WARMUP', 'REVIEW', 'MICRO_LEARN', 'PRACTICE', 'INDEPENDENT', 'SUMMARY');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ErrorCategory" AS ENUM ('GENERAL', 'PHYSICS', 'CHEMISTRY');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('DIAGNOSTIC', 'WEEKLY', 'MOCK');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FeedbackLevel" AS ENUM ('EASY', 'JUST_RIGHT', 'HARD');

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "userId" TEXT NOT NULL,
    "nickname" TEXT,
    "grade" INTEGER NOT NULL DEFAULT 9,
    "targetPhysics" INTEGER,
    "targetChemistry" INTEGER,
    "mockExamDate" TIMESTAMP(3),
    "preference" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_groups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_groups" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "code" "SubjectCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_nodes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "NodeLevel" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "parentId" TEXT,
    "examWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "repairability" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_prerequisites" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "prerequisiteNodeId" TEXT NOT NULL,
    "strength" "PrereqStrength" NOT NULL DEFAULT 'SOFT',

    CONSTRAINT "knowledge_prerequisites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "micro_skills" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "context" TEXT,
    "coreConcept" TEXT,
    "formula" TEXT,
    "commonPitfalls" JSONB,
    "basicExample" TEXT,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 5,
    "examWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "repairability" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "micro_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "subjectId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'L2',
    "stem" TEXT NOT NULL,
    "imageUrl" TEXT,
    "options" JSONB,
    "standardAnswer" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "estimatedTime" INTEGER NOT NULL DEFAULT 60,
    "source" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_knowledge" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "variantGroup" TEXT,

    CONSTRAINT "question_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_hints" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "question_hints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ErrorCategory" NOT NULL,
    "description" TEXT,

    CONSTRAINT "error_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_error_tags" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "errorTagId" TEXT NOT NULL,

    CONSTRAINT "question_error_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "primarySubject" "SubjectCode" NOT NULL,
    "totalMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_plan_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "segment" "PlanSegment" NOT NULL,
    "order" INTEGER NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "questionId" TEXT,
    "microSkillId" TEXT,
    "remedial" BOOLEAN NOT NULL DEFAULT false,
    "boost" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "daily_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "studentId" TEXT NOT NULL,
    "planId" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "checkpoint" JSONB,
    "feedback" "FeedbackLevel",

    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "outcome" "AttemptOutcome" NOT NULL,
    "answer" JSONB,
    "correct" BOOLEAN NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "timeSpentSec" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_steps" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "answer" TEXT,
    "correct" BOOLEAN,

    CONSTRAINT "attempt_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_hints" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'FIXED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_hints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_errors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "studentId" TEXT NOT NULL,
    "attemptId" TEXT,
    "errorTagId" TEXT NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_masteries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "studentId" TEXT NOT NULL,
    "microSkillId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "independentAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hintDependency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "MasteryStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "recentOutcomes" JSONB,
    "lastPracticedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_masteries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery_change_logs" (
    "id" TEXT NOT NULL,
    "masteryId" TEXT NOT NULL,
    "oldScore" DOUBLE PRECISION NOT NULL,
    "newScore" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "attemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastery_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "studentId" TEXT NOT NULL,
    "microSkillId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" TIMESTAMP(3) NOT NULL,
    "boost" BOOLEAN NOT NULL DEFAULT false,
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "remedial" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "type" "AssessmentType" NOT NULL,
    "title" TEXT NOT NULL,
    "subjectId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" "AssessmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_questions" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_attempts" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "answers" JSONB,
    "score" DOUBLE PRECISION,
    "analysis" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_reports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "studentId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "metrics" JSONB NOT NULL,
    "highlights" JSONB,
    "weakPoints" JSONB,
    "nextFocus" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "criteria" JSONB NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_achievements" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interaction_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "studentId" TEXT,
    "attemptId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interaction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_tenantId_role_idx" ON "users"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_userId_key" ON "student_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "student_groups_groupId_studentId_key" ON "student_groups"("groupId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_nodes_code_key" ON "knowledge_nodes"("code");

-- CreateIndex
CREATE INDEX "knowledge_nodes_subjectId_level_idx" ON "knowledge_nodes"("subjectId", "level");

-- CreateIndex
CREATE INDEX "knowledge_nodes_parentId_idx" ON "knowledge_nodes"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_prerequisites_nodeId_prerequisiteNodeId_key" ON "knowledge_prerequisites"("nodeId", "prerequisiteNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "micro_skills_code_key" ON "micro_skills"("code");

-- CreateIndex
CREATE INDEX "micro_skills_nodeId_idx" ON "micro_skills"("nodeId");

-- CreateIndex
CREATE INDEX "questions_subjectId_reviewStatus_idx" ON "questions"("subjectId", "reviewStatus");

-- CreateIndex
CREATE INDEX "questions_deletedAt_idx" ON "questions"("deletedAt");

-- CreateIndex
CREATE INDEX "question_knowledge_nodeId_isPrimary_idx" ON "question_knowledge"("nodeId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "question_knowledge_questionId_nodeId_key" ON "question_knowledge"("questionId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "question_hints_questionId_level_key" ON "question_hints"("questionId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "error_tags_code_key" ON "error_tags"("code");

-- CreateIndex
CREATE UNIQUE INDEX "question_error_tags_questionId_errorTagId_key" ON "question_error_tags"("questionId", "errorTagId");

-- CreateIndex
CREATE INDEX "daily_plans_studentId_status_idx" ON "daily_plans"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_plans_studentId_date_key" ON "daily_plans"("studentId", "date");

-- CreateIndex
CREATE INDEX "daily_plan_items_planId_order_idx" ON "daily_plan_items"("planId", "order");

-- CreateIndex
CREATE INDEX "practice_sessions_studentId_status_idx" ON "practice_sessions"("studentId", "status");

-- CreateIndex
CREATE INDEX "question_attempts_studentId_submittedAt_idx" ON "question_attempts"("studentId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "question_attempts_studentId_questionId_sessionId_key" ON "question_attempts"("studentId", "questionId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "question_attempts_idempotencyKey_key" ON "question_attempts"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_steps_attemptId_stepIndex_key" ON "attempt_steps"("attemptId", "stepIndex");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_hints_attemptId_level_key" ON "attempt_hints"("attemptId", "level");

-- CreateIndex
CREATE INDEX "student_errors_studentId_errorTagId_occurredAt_idx" ON "student_errors"("studentId", "errorTagId", "occurredAt");

-- CreateIndex
CREATE INDEX "student_masteries_studentId_status_idx" ON "student_masteries"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_masteries_studentId_microSkillId_key" ON "student_masteries"("studentId", "microSkillId");

-- CreateIndex
CREATE INDEX "mastery_change_logs_masteryId_createdAt_idx" ON "mastery_change_logs"("masteryId", "createdAt");

-- CreateIndex
CREATE INDEX "review_schedules_studentId_nextReviewAt_idx" ON "review_schedules"("studentId", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_schedules_studentId_microSkillId_key" ON "review_schedules"("studentId", "microSkillId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_questions_assessmentId_questionId_key" ON "assessment_questions"("assessmentId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_attempts_assessmentId_studentId_key" ON "assessment_attempts"("assessmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reports_studentId_weekStart_key" ON "weekly_reports"("studentId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_code_key" ON "achievements"("code");

-- CreateIndex
CREATE UNIQUE INDEX "student_achievements_studentId_achievementId_key" ON "student_achievements"("studentId", "achievementId");

-- CreateIndex
CREATE INDEX "ai_interaction_logs_studentId_createdAt_idx" ON "ai_interaction_logs"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_tenantId_key_key" ON "system_configs"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_nodes" ADD CONSTRAINT "knowledge_nodes_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_nodes" ADD CONSTRAINT "knowledge_nodes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "knowledge_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_prerequisites" ADD CONSTRAINT "knowledge_prerequisites_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "knowledge_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_prerequisites" ADD CONSTRAINT "knowledge_prerequisites_prerequisiteNodeId_fkey" FOREIGN KEY ("prerequisiteNodeId") REFERENCES "knowledge_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "micro_skills" ADD CONSTRAINT "micro_skills_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "knowledge_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_knowledge" ADD CONSTRAINT "question_knowledge_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_knowledge" ADD CONSTRAINT "question_knowledge_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "knowledge_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_hints" ADD CONSTRAINT "question_hints_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_error_tags" ADD CONSTRAINT "question_error_tags_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_error_tags" ADD CONSTRAINT "question_error_tags_errorTagId_fkey" FOREIGN KEY ("errorTagId") REFERENCES "error_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "daily_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_microSkillId_fkey" FOREIGN KEY ("microSkillId") REFERENCES "micro_skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_steps" ADD CONSTRAINT "attempt_steps_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "question_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_hints" ADD CONSTRAINT "attempt_hints_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "question_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_errors" ADD CONSTRAINT "student_errors_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_errors" ADD CONSTRAINT "student_errors_errorTagId_fkey" FOREIGN KEY ("errorTagId") REFERENCES "error_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_masteries" ADD CONSTRAINT "student_masteries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_masteries" ADD CONSTRAINT "student_masteries_microSkillId_fkey" FOREIGN KEY ("microSkillId") REFERENCES "micro_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_masteries" ADD CONSTRAINT "student_masteries_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "knowledge_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_change_logs" ADD CONSTRAINT "mastery_change_logs_masteryId_fkey" FOREIGN KEY ("masteryId") REFERENCES "student_masteries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_schedules" ADD CONSTRAINT "review_schedules_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_schedules" ADD CONSTRAINT "review_schedules_microSkillId_fkey" FOREIGN KEY ("microSkillId") REFERENCES "micro_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_schedules" ADD CONSTRAINT "review_schedules_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "knowledge_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_achievements" ADD CONSTRAINT "student_achievements_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_achievements" ADD CONSTRAINT "student_achievements_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interaction_logs" ADD CONSTRAINT "ai_interaction_logs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
