import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const topicId = request.nextUrl.searchParams.get("topicId");

  if (topicId) {
    const mastery = await prisma.topicMastery.findUnique({
      where: { topicId },
      include: { topic: { select: { name: true, section: true } } },
    });
    return Response.json(mastery);
  }

  const mastery = await prisma.topicMastery.findMany({
    include: {
      topic: { select: { name: true, section: true } },
    },
    orderBy: { topic: { section: "asc" } },
  });

  return Response.json(mastery);
}
