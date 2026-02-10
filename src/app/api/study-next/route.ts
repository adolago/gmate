import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { calculateRetention, calculateUrgency } from "@/lib/spaced-repetition";
import {
  selectNextTasks,
  type TopicWithPrereqs,
  type TopicMasteryRecord,
  type ReviewQueueItem,
} from "@/lib/task-selector";
import { pickQuestion } from "@/lib/question-picker";

export async function GET(request: NextRequest) {
  const count = parseInt(request.nextUrl.searchParams.get("count") ?? "5", 10);
  const topicIdFilter = request.nextUrl.searchParams.get("topicId");

  // Fetch all topics with prerequisites
  const topics = await prisma.topic.findMany({
    include: {
      prerequisites: { select: { id: true, name: true } },
      prerequisiteOf: { select: { id: true, name: true } },
    },
  });

  const allTopics: TopicWithPrereqs[] = topics.map((t) => ({
    id: t.id,
    name: t.name,
    section: t.section,
    prerequisites: t.prerequisites,
    prerequisiteOf: t.prerequisiteOf,
  }));

  // Fetch all mastery records
  const masteryRecords = await prisma.topicMastery.findMany();
  const allMastery: TopicMasteryRecord[] = masteryRecords.map((m) => ({
    topicId: m.topicId,
    masteryLevel: m.masteryLevel,
    masteryStage: m.masteryStage,
    practiceCount: m.practiceCount,
    accuracy7d: m.accuracy7d,
    accuracy30d: m.accuracy30d,
    stabilityFactor: m.stabilityFactor,
    lastPracticedAt: m.lastPracticedAt,
    nextReviewAt: m.nextReviewAt,
  }));

  // Fetch review queue with real-time urgency
  const now = new Date();
  const queueItems = await prisma.reviewQueue.findMany({
    include: { topic: { include: { mastery: true } } },
  });

  const reviewQueue: ReviewQueueItem[] = queueItems.map((item) => {
    const mastery = item.topic.mastery;
    const retention = mastery?.lastPracticedAt
      ? calculateRetention(mastery.lastPracticedAt, mastery.stabilityFactor, now)
      : 0;
    const urgency = calculateUrgency(retention, item.scheduledAt, now);
    return {
      topicId: item.topicId,
      urgency,
      scheduledAt: item.scheduledAt,
      intervalMs: item.intervalMs,
      isDue: now >= item.scheduledAt,
      retention,
    };
  });

  // If filtering to a specific topic, narrow the review queue
  const filteredQueue = topicIdFilter
    ? reviewQueue.filter((r) => r.topicId === topicIdFilter)
    : reviewQueue;

  // Select tasks
  const tasks = selectNextTasks(
    { allTopics, allMastery, reviewQueue: filteredQueue },
    count,
    now
  );

  // Resolve question IDs for each task
  const resolvedTasks = await Promise.all(
    tasks.map(async (task) => {
      if (task.questionId) return task;
      const questionId = await pickQuestion(task.topicId, task.difficulty);
      return { ...task, questionId };
    })
  );

  // Filter out tasks where no question could be found
  const validTasks = resolvedTasks.filter((t) => t.questionId !== null);

  const dueCount = reviewQueue.filter((r) => r.isDue).length;
  const frontierCount = tasks.filter((t) => t.taskType === "NEW_TOPIC").length;
  const reviewCount = tasks.filter(
    (t) => t.taskType === "REVIEW" || t.taskType === "CONSOLIDATION"
  ).length;

  return Response.json({
    tasks: validTasks,
    meta: {
      dueReviewCount: dueCount,
      frontierTopicCount: frontierCount,
      reviewPercentage:
        validTasks.length > 0
          ? Math.round((reviewCount / validTasks.length) * 100)
          : 0,
      consolidationsUsed: tasks.filter((t) => t.taskType === "CONSOLIDATION")
        .length,
    },
  });
}
