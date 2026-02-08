import { prisma } from "@/lib/db";
import { calculateRetention, calculateUrgency } from "@/lib/spaced-repetition";

export async function GET() {
  // Get all review queue items with their mastery data
  const items = await prisma.reviewQueue.findMany({
    include: {
      topic: {
        include: {
          mastery: true,
        },
      },
    },
    orderBy: { urgency: "desc" },
  });

  // Recalculate urgency with current time
  const now = new Date();
  const withRetention = items.map((item) => {
    const mastery = item.topic.mastery;
    const retention = mastery?.lastPracticedAt
      ? calculateRetention(
          mastery.lastPracticedAt,
          mastery.stabilityFactor,
          now
        )
      : 0;
    const urgency = calculateUrgency(retention, item.scheduledAt, now);
    const isDue = now >= item.scheduledAt;

    return {
      id: item.id,
      topicId: item.topicId,
      topicName: item.topic.name,
      section: item.topic.mastery?.masteryStage,
      retention: Math.round(retention * 100),
      urgency: Math.round(urgency * 100) / 100,
      scheduledAt: item.scheduledAt,
      isDue,
      masteryLevel: mastery?.masteryLevel ?? 0,
      masteryStage: mastery?.masteryStage ?? "UNKNOWN",
    };
  });

  // Sort by urgency (highest first) and filter to due items
  withRetention.sort((a, b) => b.urgency - a.urgency);

  return Response.json({
    all: withRetention,
    due: withRetention.filter((i) => i.isDue),
    dueCount: withRetention.filter((i) => i.isDue).length,
  });
}
