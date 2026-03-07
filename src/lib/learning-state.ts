import { prisma } from "./db";
import { computeTopicSignal, type TopicSignal } from "./learning-signals";
import { calculateRetention, calculateUrgency } from "./spaced-repetition";
import type {
  ReviewQueueItem,
  TopicMasteryRecord,
  TopicWithPrereqs,
} from "./task-selector";

const RECENT_ATTEMPT_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

export interface LearningStateSnapshot {
  allTopics: TopicWithPrereqs[];
  allMastery: TopicMasteryRecord[];
  reviewQueue: ReviewQueueItem[];
  topicSignals: TopicSignal[];
}

export async function loadLearningState(
  now: Date = new Date()
): Promise<LearningStateSnapshot> {
  const [topics, masteryRecords, queueItems, recentAttempts] = await Promise.all([
    prisma.topic.findMany({
      include: {
        prerequisites: { select: { id: true, name: true } },
        prerequisiteOf: { select: { id: true, name: true } },
      },
    }),
    prisma.topicMastery.findMany(),
    prisma.reviewQueue.findMany({
      include: { topic: { include: { mastery: true } } },
    }),
    prisma.attempt.findMany({
      where: {
        question: { topicId: { not: null } },
        createdAt: {
          gte: new Date(now.getTime() - RECENT_ATTEMPT_WINDOW_MS),
        },
      },
      select: {
        isCorrect: true,
        timeSpentMs: true,
        createdAt: true,
        question: { select: { topicId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const allTopics: TopicWithPrereqs[] = topics.map((t) => ({
    id: t.id,
    name: t.name,
    section: t.section,
    prerequisites: t.prerequisites,
    prerequisiteOf: t.prerequisiteOf,
  }));

  const allMastery: TopicMasteryRecord[] = masteryRecords.map((m) => ({
    topicId: m.topicId,
    masteryLevel: m.masteryLevel,
    masteryStage: m.masteryStage,
    practiceCount: m.practiceCount,
    accuracy7d: m.accuracy7d,
    accuracy30d: m.accuracy30d,
    avgTimeMs: m.avgTimeMs,
    stabilityFactor: m.stabilityFactor,
    lastPracticedAt: m.lastPracticedAt,
    nextReviewAt: m.nextReviewAt,
  }));

  const reviewQueue: ReviewQueueItem[] = queueItems.map((item) => {
    const mastery = item.topic.mastery;
    const retention = mastery?.lastPracticedAt
      ? calculateRetention(mastery.lastPracticedAt, mastery.stabilityFactor, now)
      : 0;

    return {
      topicId: item.topicId,
      urgency: calculateUrgency(retention, item.scheduledAt, now),
      scheduledAt: item.scheduledAt,
      intervalMs: item.intervalMs,
      isDue: now >= item.scheduledAt,
      retention,
    };
  });

  const topicMap = new Map(topics.map((topic) => [topic.id, topic]));
  const recentAttemptsByTopic = new Map<
    string,
    { isCorrect: boolean; timeSpentMs: number; createdAt: Date }[]
  >();

  for (const attempt of recentAttempts) {
    const topicId = attempt.question.topicId;
    if (!topicId) continue;
    const attemptsForTopic = recentAttemptsByTopic.get(topicId) ?? [];
    attemptsForTopic.push({
      isCorrect: attempt.isCorrect,
      timeSpentMs: attempt.timeSpentMs,
      createdAt: attempt.createdAt,
    });
    recentAttemptsByTopic.set(topicId, attemptsForTopic);
  }

  const topicSignals: TopicSignal[] = allMastery.flatMap((mastery) => {
    const topic = topicMap.get(mastery.topicId);
    if (!topic) return [];

    return [
      computeTopicSignal({
        topicId: mastery.topicId,
        section: topic.section,
        masteryLevel: mastery.masteryLevel,
        accuracy7d: mastery.accuracy7d,
        practiceCount: mastery.practiceCount,
        avgTimeMs: mastery.avgTimeMs,
        recentAttempts: recentAttemptsByTopic.get(mastery.topicId) ?? [],
      }),
    ];
  });

  return {
    allTopics,
    allMastery,
    reviewQueue,
    topicSignals,
  };
}
