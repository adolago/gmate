import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await prisma.studySession.findUnique({
    where: { id },
    include: {
      sessionQuestions: {
        include: {
          question: {
            include: { topic: true },
          },
        },
        orderBy: { orderIndex: "asc" },
      },
      attempts: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  return Response.json(session);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { status } = body;

  // Compute stats when completing
  const attempts = await prisma.attempt.findMany({
    where: { sessionId: id },
  });

  const correctCount = attempts.filter((a) => a.isCorrect).length;
  const totalTimeMs = attempts.reduce((sum, a) => sum + a.timeSpentMs, 0);

  const session = await prisma.studySession.update({
    where: { id },
    data: {
      status,
      correctCount,
      totalTimeMs,
      finishedAt: new Date(),
    },
  });

  return Response.json(session);
}
