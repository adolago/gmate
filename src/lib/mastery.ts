/**
 * Mastery Tracking System (6-Stage Scale)
 *
 * From Johny's MathAcademy-inspired model:
 * 1. UNKNOWN (0.0)    — Never encountered
 * 2. INTRODUCED (0.1) — Seen but not practiced
 * 3. DEVELOPING (0.3) — Practicing, making progress
 * 4. PROFICIENT (0.5) — Can solve with effort
 * 5. MASTERED (0.75)  — Reliable recall and application
 * 6. FLUENT (0.9)     — Automatic, effortless mastery
 *
 * Advancement requires:
 * - Accuracy threshold met for 3+ consecutive sessions
 * - Demonstrated retention after 7 days
 * - Can apply to novel problems
 */

import { MasteryStage } from "@/generated/prisma/enums";

export interface MasteryUpdate {
  masteryLevel: number;
  masteryStage: MasteryStage;
  practiceCount: number;
  accuracy7d: number;
  accuracy30d: number;
  avgTimeMs: number;
}

/**
 * Determine the MasteryStage from a numeric mastery level.
 */
export function getMasteryStage(level: number): MasteryStage {
  if (level >= 0.9) return MasteryStage.FLUENT;
  if (level >= 0.75) return MasteryStage.MASTERED;
  if (level >= 0.5) return MasteryStage.PROFICIENT;
  if (level >= 0.3) return MasteryStage.DEVELOPING;
  if (level >= 0.1) return MasteryStage.INTRODUCED;
  return MasteryStage.UNKNOWN;
}

/**
 * Update mastery level after a practice attempt.
 *
 * Uses exponential moving average (EMA) with different alpha values:
 * - Explicit practice: alpha = 0.3 (strong update)
 * - Implicit (FIRe): alpha = 0.1 (gentle update)
 */
export function updateMasteryLevel(
  currentLevel: number,
  attemptScore: number, // 0.0 (wrong) or 1.0 (correct)
  alpha: number = 0.3 // Learning rate
): number {
  const newLevel = currentLevel + alpha * (attemptScore - currentLevel);
  return Math.max(0, Math.min(1, newLevel));
}

/**
 * Calculate rolling accuracy over a window of recent attempts.
 */
export function calculateRollingAccuracy(
  attempts: { isCorrect: boolean; createdAt: Date }[],
  windowDays: number,
  now: Date = new Date()
): number {
  const windowStart = new Date(
    now.getTime() - windowDays * 24 * 60 * 60 * 1000
  );
  const windowAttempts = attempts.filter((a) => a.createdAt >= windowStart);

  if (windowAttempts.length === 0) return 0;

  const correct = windowAttempts.filter((a) => a.isCorrect).length;
  return correct / windowAttempts.length;
}

/**
 * Compute a full mastery update from recent practice data.
 */
export function computeMasteryUpdate(
  current: {
    masteryLevel: number;
    practiceCount: number;
    accuracy7d: number;
    accuracy30d: number;
    avgTimeMs: number;
  },
  newAttempt: {
    isCorrect: boolean;
    timeSpentMs: number;
  },
  recentAttempts: { isCorrect: boolean; createdAt: Date }[],
  isImplicit: boolean = false
): MasteryUpdate {
  const alpha = isImplicit ? 0.1 : 0.3;
  const score = newAttempt.isCorrect ? 1.0 : 0.0;

  const newMasteryLevel = updateMasteryLevel(
    current.masteryLevel,
    score,
    alpha
  );
  const newPracticeCount = current.practiceCount + (isImplicit ? 0 : 1);

  const allAttempts = [
    ...recentAttempts,
    { isCorrect: newAttempt.isCorrect, createdAt: new Date() },
  ];

  const accuracy7d = calculateRollingAccuracy(allAttempts, 7);
  const accuracy30d = calculateRollingAccuracy(allAttempts, 30);

  // Update running average time (only for explicit practice)
  const newAvgTimeMs = isImplicit
    ? current.avgTimeMs
    : current.practiceCount === 0
      ? newAttempt.timeSpentMs
      : Math.round(
          (current.avgTimeMs * current.practiceCount + newAttempt.timeSpentMs) /
            (current.practiceCount + 1)
        );

  return {
    masteryLevel: newMasteryLevel,
    masteryStage: getMasteryStage(newMasteryLevel),
    practiceCount: newPracticeCount,
    accuracy7d,
    accuracy30d,
    avgTimeMs: newAvgTimeMs,
  };
}
