import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { Section, QuestionType, Difficulty, SessionType } from "@/generated/prisma/client";

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

  // Build question filter
  const where: Record<string, unknown> = {};
  if (section) where.section = section;
  if (questionType) where.questionType = questionType;
  if (difficulty) where.difficulty = difficulty;

  // Select random questions
  const allQuestions = await prisma.question.findMany({
    where,
    select: { id: true },
  });

  // Shuffle and take the requested number
  const shuffled = allQuestions.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, totalQuestions);

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
