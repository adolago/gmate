import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ErrorType } from "@/generated/prisma/client";
import { computeMasteryUpdate } from "@/lib/mastery";
import {
  computeNextInterval,
  updateStability,
  computeNextReviewAt,
} from "@/lib/spaced-repetition";
import { computeFIReCredits } from "@/lib/fire";
import { updateMasteryLevel } from "@/lib/mastery";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    questionId,
    selectedAnswer,
    timeSpentMs,
    sessionId,
    errorType,
    scaffoldLevel = 1,
    hintsUsed = 0,
  }: {
    questionId: string;
    selectedAnswer: string;
    timeSpentMs: number;
    sessionId?: string;
    errorType?: ErrorType;
    scaffoldLevel?: number;
    hintsUsed?: number;
  } = body;

  // Fetch question to check correctness
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { topic: true },
  });

  if (!question) {
    return Response.json({ error: "Question not found" }, { status: 404 });
  }

  const isCorrect = selectedAnswer === question.correctAnswer;

  // Record attempt
  const attempt = await prisma.attempt.create({
    data: {
      questionId,
      selectedAnswer,
      isCorrect,
      timeSpentMs,
      sessionId: sessionId || null,
      errorType: isCorrect ? null : errorType || null,
      scaffoldLevel,
      hintsUsed,
    },
  });

  // Update topic mastery if question has a topic
  if (question.topicId) {
    await updateTopicMastery(question.topicId, isCorrect, timeSpentMs);

    // Apply FIRe credits to prerequisites
    if (isCorrect) {
      const credits = await computeFIReCredits(
        question.topicId,
        async (topicId) => {
          const topic = await prisma.topic.findUnique({
            where: { id: topicId },
            include: { prerequisites: { select: { id: true } } },
          });
          return topic?.prerequisites.map((p) => p.id) || [];
        }
      );

      for (const credit of credits) {
        await updateTopicMasteryImplicit(credit.topicId, credit.weight);
      }
    }
  }

  return Response.json({
    attempt,
    isCorrect,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
  });
}

async function updateTopicMastery(
  topicId: string,
  isCorrect: boolean,
  timeSpentMs: number
) {
  // Get or create mastery record
  let mastery = await prisma.topicMastery.findUnique({
    where: { topicId },
  });

  if (!mastery) {
    mastery = await prisma.topicMastery.create({
      data: { topicId, masteryLevel: 0, masteryStage: "UNKNOWN" },
    });
  }

  // Get recent attempts for rolling accuracy
  const recentAttempts = await prisma.attempt.findMany({
    where: {
      question: { topicId },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    select: { isCorrect: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const update = computeMasteryUpdate(
    {
      masteryLevel: mastery.masteryLevel,
      practiceCount: mastery.practiceCount,
      accuracy7d: mastery.accuracy7d,
      accuracy30d: mastery.accuracy30d,
      avgTimeMs: mastery.avgTimeMs,
    },
    { isCorrect, timeSpentMs },
    recentAttempts,
    false
  );

  // Update stability and review schedule
  const newStability = updateStability(
    mastery.stabilityFactor,
    update.accuracy7d,
    update.practiceCount
  );
  const newInterval = computeNextInterval(
    14400000, // 4 hours default
    update.accuracy7d,
    update.masteryLevel
  );
  const nextReviewAt = computeNextReviewAt(newInterval);

  await prisma.topicMastery.update({
    where: { topicId },
    data: {
      ...update,
      lastPracticedAt: new Date(),
      stabilityFactor: newStability,
      nextReviewAt,
    },
  });

  // Upsert review queue entry
  await prisma.reviewQueue.upsert({
    where: { topicId },
    create: {
      topicId,
      scheduledAt: nextReviewAt,
      intervalMs: newInterval,
      urgency: 0,
    },
    update: {
      scheduledAt: nextReviewAt,
      intervalMs: newInterval,
      urgency: 0,
    },
  });
}

async function updateTopicMasteryImplicit(
  topicId: string,
  fireWeight: number
) {
  const mastery = await prisma.topicMastery.findUnique({
    where: { topicId },
  });

  if (!mastery) return; // No mastery record = topic not yet encountered

  const newLevel = updateMasteryLevel(
    mastery.masteryLevel,
    fireWeight, // Scaled score
    0.1 // Implicit alpha
  );

  await prisma.topicMastery.update({
    where: { topicId },
    data: {
      masteryLevel: newLevel,
      masteryStage:
        newLevel >= 0.9
          ? "FLUENT"
          : newLevel >= 0.75
            ? "MASTERED"
            : newLevel >= 0.5
              ? "PROFICIENT"
              : newLevel >= 0.3
                ? "DEVELOPING"
                : newLevel >= 0.1
                  ? "INTRODUCED"
                  : "UNKNOWN",
    },
  });
}
