import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRequestSession } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRequestSession(request);
  if (response) return response;

  const { id } = await params;

  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      topic: true,
      attempts: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!question) {
    return Response.json({ error: "Question not found" }, { status: 404 });
  }

  return Response.json(question);
}
