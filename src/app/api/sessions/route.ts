import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { Section, QuestionType, Difficulty, SessionType } from "@/generated/prisma/client";
import { calculateRetention, calculateUrgency } from "@/lib/spaced-repetition";
import {
  selectNextTasks,
  type TopicWithPrereqs,
  type TopicMasteryRecord,
  type ReviewQueueItem,
} from "@/lib/task-selector";
import { pickQuestion } from "@/lib/question-picker";

export async function GET() {
  const sessions = await prisma.studySession.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: {
      _count: { select: { attempts: true, sessionQuestions: true } },
    },
  });
  return Response.json(sessions);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    sessionType,
    section,
    questionType,
    difficulty,
    totalQuestions,
    timeLimitMs,
  }: {
    sessionType: SessionType;
    section?: Section;
    questionType?: QuestionType;
    difficulty?: Difficulty;
    totalQuestions: number;
    timeLimitMs: number;
  } = body;

  // Smart selection for non-exam sessions; random for EXAM_SIM
  const useSmartSelection = sessionType !== "EXAM_SIM";
  let selected: { id: string }[] = [];

  if (useSmartSelection) {
    try {
      const now = new Date();
      const topics = await prisma.topic.findMany({
        include: {
          prerequisites: { select: { id: true, name: true } },
          prerequisiteOf: { select: { id: true, name: true } },
        },
      });
      const allTopics: TopicWithPrereqs[] = topics.map((t) => ({
        id: t.id, name: t.name, section: t.section,
        prerequisites: t.prerequisites, prerequisiteOf: t.prerequisiteOf,
      }));

      const masteryRecords = await prisma.topicMastery.findMany();
      const allMastery: TopicMasteryRecord[] = masteryRecords.map((m) => ({
        topicId: m.topicId, masteryLevel: m.masteryLevel, masteryStage: m.masteryStage,
        practiceCount: m.practiceCount, accuracy7d: m.accuracy7d, accuracy30d: m.accuracy30d,
        stabilityFactor: m.stabilityFactor, lastPracticedAt: m.lastPracticedAt, nextReviewAt: m.nextReviewAt,
      }));

      const queueItems = await prisma.reviewQueue.findMany({
        include: { topic: { include: { mastery: true } } },
      });
      const reviewQueue: ReviewQueueItem[] = queueItems.map((item) => {
        const m = item.topic.mastery;
        const retention = m?.lastPracticedAt
          ? calculateRetention(m.lastPracticedAt, m.stabilityFactor, now) : 0;
        return {
          topicId: item.topicId, urgency: calculateUrgency(retention, item.scheduledAt, now),
          scheduledAt: item.scheduledAt, intervalMs: item.intervalMs,
          isDue: now >= item.scheduledAt, retention,
        };
      });

      const tasks = selectNextTasks({ allTopics, allMastery, reviewQueue }, totalQuestions, now);
      const resolvedIds: string[] = [];
      const usedIds = new Set<string>();

      for (const task of tasks) {
        const qId = task.questionId ?? await pickQuestion(task.topicId, task.difficulty, [...usedIds]);
        if (qId) {
          resolvedIds.push(qId);
          usedIds.add(qId);
        }
      }

      selected = resolvedIds.map((id) => ({ id }));
    } catch {
      // Fall through to random selection
    }
  }

  // Fallback: random selection (always used for EXAM_SIM, or if smart selection found nothing)
  if (selected.length === 0) {
    const where: Record<string, unknown> = {};
    if (section) where.section = section;
    if (questionType) where.questionType = questionType;
    if (difficulty) where.difficulty = difficulty;

    const allQuestions = await prisma.question.findMany({
      where,
      select: { id: true },
    });

    const shuffled = allQuestions.sort(() => Math.random() - 0.5);
    selected = shuffled.slice(0, totalQuestions);
  }

  if (selected.length === 0) {
    return Response.json(
      { error: "No questions match the criteria" },
      { status: 400 }
    );
  }

  // Create session with ordered questions
  const session = await prisma.studySession.create({
    data: {
      sessionType,
      section: section || null,
      questionType: questionType || null,
      difficulty: difficulty || null,
      totalQuestions: selected.length,
      timeLimitMs,
      sessionQuestions: {
        create: selected.map((q, idx) => ({
          questionId: q.id,
          orderIndex: idx,
        })),
      },
    },
    include: {
      sessionQuestions: {
        include: { question: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  return Response.json(session);
}
