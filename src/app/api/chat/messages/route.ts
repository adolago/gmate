import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ChatRole, Section, Prisma } from "@/generated/prisma/client";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    messages,
    questionId,
    section,
    sessionId,
    scaffoldLevel,
    metadata,
  }: {
    messages: { role: "user" | "assistant"; content: string }[];
    questionId?: string;
    section?: Section;
    sessionId?: string;
    scaffoldLevel?: number;
    metadata?: Record<string, unknown>;
  } = body;

  const created = await prisma.chatMessage.createMany({
    data: messages.map((msg) => ({
      role: msg.role === "user" ? ChatRole.USER : ChatRole.ASSISTANT,
      content: msg.content,
      questionId: questionId || null,
      section: section || null,
      sessionId: sessionId || null,
      scaffoldLevel: scaffoldLevel || null,
      metadata: metadata
        ? (metadata as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    })),
  });

  return Response.json({ count: created.count });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const questionId = searchParams.get("questionId");
  const sessionId = searchParams.get("sessionId");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where: Record<string, unknown> = {};
  if (questionId) where.questionId = questionId;
  if (sessionId) where.sessionId = sessionId;

  const messages = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return Response.json(messages.reverse());
}
