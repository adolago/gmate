import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { Section, QuestionType, Difficulty, SessionType } from "@/generated/prisma/client";
import { loadLearningState } from "@/lib/learning-state";
import { selectNextTasks } from "@/lib/task-selector";
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
      const snapshot = await loadLearningState(now);
      const tasks = selectNextTasks(snapshot, totalQuestions * 2, now).filter(
        (task) =>
          (!section || task.section === section) &&
          (!difficulty || task.difficulty === difficulty)
      );
      const resolvedIds: string[] = [];
      const usedIds = new Set<string>();

      for (const task of tasks) {
        const qId = task.questionId ?? await pickQuestion(task.topicId, task.difficulty, [...usedIds]);
        if (qId) {
          resolvedIds.push(qId);
          usedIds.add(qId);
          if (resolvedIds.length >= totalQuestions) break;
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
