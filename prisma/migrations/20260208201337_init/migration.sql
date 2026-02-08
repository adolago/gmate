-- CreateEnum
CREATE TYPE "Section" AS ENUM ('QUANTITATIVE_REASONING', 'VERBAL_REASONING', 'DATA_INSIGHTS');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('PROBLEM_SOLVING', 'READING_COMPREHENSION', 'CRITICAL_REASONING', 'DATA_SUFFICIENCY', 'MULTI_SOURCE_REASONING', 'TABLE_ANALYSIS', 'GRAPHICS_INTERPRETATION', 'TWO_PART_ANALYSIS');

-- CreateEnum
CREATE TYPE "MasteryStage" AS ENUM ('UNKNOWN', 'INTRODUCED', 'DEVELOPING', 'PROFICIENT', 'MASTERED', 'FLUENT');

-- CreateEnum
CREATE TYPE "ErrorType" AS ENUM ('CONCEPTUAL', 'PROCEDURAL', 'CARELESS', 'KNOWLEDGE_GAP');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('PRACTICE', 'REVIEW', 'EXAM_SIM', 'WARMUP');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" "Section" NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "section" "Section" NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "subsection" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "stem" TEXT NOT NULL,
    "passage" TEXT,
    "options" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "tags" TEXT[],
    "imageUrl" TEXT,
    "tableData" JSONB,
    "sourceSet" JSONB,
    "topicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "timeSpentMs" INTEGER NOT NULL,
    "errorType" "ErrorType",
    "scaffoldLevel" INTEGER NOT NULL DEFAULT 1,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "section" "Section",
    "questionType" "QuestionType",
    "difficulty" "Difficulty",
    "totalQuestions" INTEGER NOT NULL,
    "timeLimitMs" INTEGER NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "totalTimeMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "SessionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicMastery" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "masteryLevel" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "masteryStage" "MasteryStage" NOT NULL DEFAULT 'UNKNOWN',
    "practiceCount" INTEGER NOT NULL DEFAULT 0,
    "lastPracticedAt" TIMESTAMP(3),
    "accuracy7d" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "accuracy30d" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "avgTimeMs" INTEGER NOT NULL DEFAULT 0,
    "stabilityFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "nextReviewAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "TopicMastery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewQueue" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "urgency" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "intervalMs" INTEGER NOT NULL DEFAULT 14400000,

    CONSTRAINT "ReviewQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "questionId" TEXT,
    "section" "Section",
    "sessionId" TEXT,
    "scaffoldLevel" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TopicPrerequisites" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TopicPrerequisites_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Topic_section_idx" ON "Topic"("section");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_name_section_key" ON "Topic"("name", "section");

-- CreateIndex
CREATE INDEX "Question_section_difficulty_idx" ON "Question"("section", "difficulty");

-- CreateIndex
CREATE INDEX "Question_section_questionType_idx" ON "Question"("section", "questionType");

-- CreateIndex
CREATE INDEX "Question_topicId_idx" ON "Question"("topicId");

-- CreateIndex
CREATE INDEX "Attempt_questionId_idx" ON "Attempt"("questionId");

-- CreateIndex
CREATE INDEX "Attempt_sessionId_idx" ON "Attempt"("sessionId");

-- CreateIndex
CREATE INDEX "Attempt_createdAt_idx" ON "Attempt"("createdAt");

-- CreateIndex
CREATE INDEX "StudySession_status_idx" ON "StudySession"("status");

-- CreateIndex
CREATE INDEX "StudySession_startedAt_idx" ON "StudySession"("startedAt");

-- CreateIndex
CREATE INDEX "SessionQuestion_sessionId_idx" ON "SessionQuestion"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionQuestion_sessionId_questionId_key" ON "SessionQuestion"("sessionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionQuestion_sessionId_orderIndex_key" ON "SessionQuestion"("sessionId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TopicMastery_topicId_key" ON "TopicMastery"("topicId");

-- CreateIndex
CREATE INDEX "TopicMastery_masteryStage_idx" ON "TopicMastery"("masteryStage");

-- CreateIndex
CREATE INDEX "TopicMastery_nextReviewAt_idx" ON "TopicMastery"("nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewQueue_topicId_key" ON "ReviewQueue"("topicId");

-- CreateIndex
CREATE INDEX "ReviewQueue_urgency_idx" ON "ReviewQueue"("urgency");

-- CreateIndex
CREATE INDEX "ReviewQueue_scheduledAt_idx" ON "ReviewQueue"("scheduledAt");

-- CreateIndex
CREATE INDEX "ChatMessage_questionId_idx" ON "ChatMessage"("questionId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "_TopicPrerequisites_B_index" ON "_TopicPrerequisites"("B");

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionQuestion" ADD CONSTRAINT "SessionQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionQuestion" ADD CONSTRAINT "SessionQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicMastery" ADD CONSTRAINT "TopicMastery_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewQueue" ADD CONSTRAINT "ReviewQueue_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TopicPrerequisites" ADD CONSTRAINT "_TopicPrerequisites_A_fkey" FOREIGN KEY ("A") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TopicPrerequisites" ADD CONSTRAINT "_TopicPrerequisites_B_fkey" FOREIGN KEY ("B") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
