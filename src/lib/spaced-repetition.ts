/**
 * Spaced Repetition Engine (Ebbinghaus Decay Model)
 *
 * Inspired by Johny agent's implementation:
 * - Retention decays exponentially: R = e^(-t/S)
 * - Stability (S) increases with successful practice
 * - Review intervals adapt based on accuracy scores
 * - Urgency = (1 - retention) * overdueFactor
 */

const DEFAULT_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MIN_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Calculate current retention using Ebbinghaus forgetting curve.
 * R = e^(-t/S) where t = time since last practice, S = stability factor
 */
export function calculateRetention(
  lastPracticedAt: Date,
  stabilityFactor: number,
  now: Date = new Date()
): number {
  const elapsedMs = now.getTime() - lastPracticedAt.getTime();
  const elapsedHours = elapsedMs / (60 * 60 * 1000);
  // Stability is in hours — higher stability = slower decay
  const stability = stabilityFactor * 24; // Convert day-based stability to hours
  const retention = Math.exp(-elapsedHours / stability);
  return Math.max(0, Math.min(1, retention));
}

/**
 * Calculate urgency for the review queue.
 * Higher urgency = more overdue for review.
 */
export function calculateUrgency(
  retention: number,
  scheduledAt: Date,
  now: Date = new Date()
): number {
  const overdue = Math.max(0, now.getTime() - scheduledAt.getTime());
  const overdueHours = overdue / (60 * 60 * 1000);
  const overdueFactor = 1 + overdueHours / 24; // Increases by 1 per day overdue
  return (1 - retention) * overdueFactor;
}

/**
 * Compute the next review interval based on accuracy score.
 *
 * Score thresholds (from Johny):
 * - 0.9+ (excellent) → interval × 2.5
 * - 0.7-0.9 (good) → interval × 1.5
 * - 0.5-0.7 (okay) → maintain
 * - 0.3-0.5 (poor) → interval × 0.5
 * - < 0.3 (very poor) → reset to 4 hours
 */
export function computeNextInterval(
  currentIntervalMs: number,
  accuracyScore: number,
  masteryLevel: number
): number {
  let newInterval: number;

  if (accuracyScore >= 0.9) {
    newInterval = currentIntervalMs * 2.5;
  } else if (accuracyScore >= 0.7) {
    newInterval = currentIntervalMs * 1.5;
  } else if (accuracyScore >= 0.5) {
    newInterval = currentIntervalMs;
  } else if (accuracyScore >= 0.3) {
    newInterval = currentIntervalMs * 0.5;
  } else {
    newInterval = DEFAULT_INTERVAL_MS;
  }

  // Mastery level bonus: higher mastery → longer intervals
  newInterval *= 1 + masteryLevel * 0.1;

  return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, newInterval));
}

/**
 * Update stability factor after a practice session.
 * Stability increases with correct answers, decreases with wrong ones.
 */
export function updateStability(
  currentStability: number,
  accuracyScore: number,
  practiceCount: number
): number {
  // Learning rate decreases with more practice (diminishing returns)
  const learningRate = Math.max(0.1, 1 / Math.sqrt(practiceCount + 1));

  if (accuracyScore >= 0.7) {
    // Success strengthens memory trace
    return currentStability + learningRate * accuracyScore;
  } else {
    // Failure weakens stability, but not below 0.5
    return Math.max(0.5, currentStability - learningRate * (1 - accuracyScore));
  }
}

/**
 * Compute the next review date based on the interval.
 */
export function computeNextReviewAt(
  intervalMs: number,
  now: Date = new Date()
): Date {
  return new Date(now.getTime() + intervalMs);
}
