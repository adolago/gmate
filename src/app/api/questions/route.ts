import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { Section, QuestionType, Difficulty } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const section = searchParams.get("section") as Section | null;
  const questionType = searchParams.get("questionType") as QuestionType | null;
  const difficulty = searchParams.get("difficulty") as Difficulty | null;
  const subsection = searchParams.get("subsection");
  const topicId = searchParams.get("topicId");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const where: Record<string, unknown> = {};
  if (section) where.section = section;
  if (questionType) where.questionType = questionType;
  if (difficulty) where.difficulty = difficulty;
  if (subsection) where.subsection = subsection;
  if (topicId) where.topicId = topicId;

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      select: {
        id: true,
        section: true,
        questionType: true,
        subsection: true,
        difficulty: true,
        stem: true,
        tags: true,
        topicId: true,
        _count: { select: { attempts: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.question.count({ where }),
  ]);

  return Response.json({
    questions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
