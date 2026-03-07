import { Section } from "@/generated/prisma/enums";
import { OPTIMAL_ACCURACY_RANGE, SECTIONS } from "./gmat-constants";

const RECENT_ATTEMPT_LIMIT = 6;

export interface AttemptSignalInput {
  isCorrect: boolean;
  timeSpentMs: number;
  createdAt: Date;
}

export interface TopicSignalInput {
  topicId: string;
  section: Section;
  masteryLevel: number;
  accuracy7d: number;
  practiceCount: number;
  avgTimeMs: number;
  recentAttempts: AttemptSignalInput[];
}

export interface TopicSignal {
  topicId: string;
  recentAttemptCount: number;
  recentAccuracy: number | null;
  recentIncorrectStreak: number;
  recentCorrectStreak: number;
  recentAverageTimeMs: number | null;
  speedScore: number;
  automaticityScore: number;
  needsRemediation: boolean;
  needsFluency: boolean;
}

export function computeTopicSignal(input: TopicSignalInput): TopicSignal {
  const recentAttempts = [...input.recentAttempts]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, RECENT_ATTEMPT_LIMIT);

  const recentAttemptCount = recentAttempts.length;
  const recentCorrect = recentAttempts.filter((a) => a.isCorrect).length;
  const recentAccuracy =
    recentAttemptCount > 0 ? recentCorrect / recentAttemptCount : null;
  const recentIncorrectStreak = computeLeadingStreak(recentAttempts, false);
  const recentCorrectStreak = computeLeadingStreak(recentAttempts, true);
  const recentAverageTimeMs =
    recentAttemptCount > 0
      ? Math.round(
          recentAttempts.reduce((sum, a) => sum + a.timeSpentMs, 0) /
            recentAttemptCount
        )
      : null;

  const targetTimeMs = getSectionTargetTimeMs(input.section);
  const effectiveTimeMs =
    recentAverageTimeMs ?? (input.avgTimeMs > 0 ? input.avgTimeMs : null);
  const speedScore =
    effectiveTimeMs === null
      ? 0.5
      : clamp(targetTimeMs / Math.max(effectiveTimeMs, 1), 0, 1);

  const accuracySignal =
    recentAccuracy ?? (input.practiceCount > 0 ? input.accuracy7d : 0);
  const repetitionSignal = clamp(input.practiceCount / 8, 0, 1);
  const automaticityScore = clamp(
    accuracySignal * 0.35 +
      speedScore * 0.25 +
      repetitionSignal * 0.2 +
      clamp(input.masteryLevel, 0, 1) * 0.2,
    0,
    1
  );

  const needsRemediation =
    recentIncorrectStreak >= 2 ||
    (recentAttemptCount >= 4 && (recentAccuracy ?? 1) < 0.5);

  const accurateEnoughForFluency = accuracySignal >= OPTIMAL_ACCURACY_RANGE.min;
  const needsFluency =
    !needsRemediation &&
    input.practiceCount >= 3 &&
    input.masteryLevel >= 0.3 &&
    accurateEnoughForFluency &&
    (automaticityScore < 0.62 || speedScore < 0.78);

  return {
    topicId: input.topicId,
    recentAttemptCount,
    recentAccuracy,
    recentIncorrectStreak,
    recentCorrectStreak,
    recentAverageTimeMs,
    speedScore,
    automaticityScore,
    needsRemediation,
    needsFluency,
  };
}

function getSectionTargetTimeMs(section: Section): number {
  const meta = SECTIONS[section];
  return Math.round((meta.timeMinutes * 60 * 1000) / meta.questionCount);
}

function computeLeadingStreak(
  attempts: AttemptSignalInput[],
  targetCorrectness: boolean
): number {
  let streak = 0;
  for (const attempt of attempts) {
    if (attempt.isCorrect !== targetCorrectness) break;
    streak++;
  }
  return streak;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
