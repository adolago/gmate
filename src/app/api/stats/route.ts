import { prisma } from "@/lib/db";

export async function GET() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Total attempts + accuracy
  const allAttempts = await prisma.attempt.findMany({
    select: {
      isCorrect: true,
      createdAt: true,
      errorType: true,
      timeSpentMs: true,
      question: {
        select: { section: true, difficulty: true },
      },
    },
  });

  const totalAttempts = allAttempts.length;
  const correctCount = allAttempts.filter((a) => a.isCorrect).length;
  const overallAccuracy = totalAttempts > 0 ? correctCount / totalAttempts : 0;

  // 7-day attempts
  const recent7d = allAttempts.filter((a) => a.createdAt >= sevenDaysAgo);
  const correct7d = recent7d.filter((a) => a.isCorrect).length;
  const accuracy7d = recent7d.length > 0 ? correct7d / recent7d.length : 0;

  // Error breakdown (last 30 days)
  const recent30d = allAttempts.filter(
    (a) => a.createdAt >= thirtyDaysAgo && !a.isCorrect && a.errorType
  );
  const errorBreakdown = recent30d.reduce(
    (acc, a) => {
      const type = a.errorType!;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Per-section stats
  const sectionStats = ["QUANTITATIVE_REASONING", "VERBAL_REASONING", "DATA_INSIGHTS"].map(
    (section) => {
      const sectionAttempts = allAttempts.filter((a) => a.question.section === section);
      const sectionCorrect = sectionAttempts.filter((a) => a.isCorrect).length;
      return {
        section,
        total: sectionAttempts.length,
        correct: sectionCorrect,
        accuracy: sectionAttempts.length > 0 ? sectionCorrect / sectionAttempts.length : 0,
      };
    }
  );

  // Mastery overview
  const masteryRecords = await prisma.topicMastery.findMany({
    include: { topic: { select: { name: true, section: true } } },
  });
  const avgMastery =
    masteryRecords.length > 0
      ? masteryRecords.reduce((sum, m) => sum + m.masteryLevel, 0) / masteryRecords.length
      : 0;

  // Review queue due count
  const dueCount = await prisma.reviewQueue.count({
    where: { scheduledAt: { lte: now } },
  });

  // Sessions completed
  const completedSessions = await prisma.studySession.count({
    where: { status: "COMPLETED" },
  });

  // Question count
  const questionCount = await prisma.question.count();

  // Streak: consecutive days with at least one attempt
  const streak = await computeStreak(allAttempts.map((a) => a.createdAt));

  return Response.json({
    totalAttempts,
    overallAccuracy,
    accuracy7d,
    dueCount,
    completedSessions,
    questionCount,
    avgMastery,
    streak,
    errorBreakdown,
    sectionStats,
    masteryRecords: masteryRecords.map((m) => ({
      topicId: m.topicId,
      topicName: m.topic.name,
      section: m.topic.section,
      masteryLevel: m.masteryLevel,
      masteryStage: m.masteryStage,
    })),
  });
}

function computeStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;

  const daySet = new Set(
    dates.map((d) => {
      const local = new Date(d);
      return `${local.getFullYear()}-${local.getMonth()}-${local.getDate()}`;
    })
  );

  let streak = 0;
  const now = new Date();
  let checkDate = new Date(now);

  while (true) {
    const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
    if (daySet.has(key)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
