import { prisma } from "@/lib/db";

export async function GET() {
  const mastery = await prisma.topicMastery.findMany({
    include: {
      topic: { select: { name: true, section: true } },
    },
    orderBy: { topic: { section: "asc" } },
  });

  return Response.json(mastery);
}
