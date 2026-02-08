/**
 * Difficulty Calibrator — Optimal Learning Zone
 *
 * From Johny's deliberate practice model (Anders Ericsson):
 * Target 70-85% success rate for maximum learning.
 *
 * < 70% correct → too hard, drop difficulty or review prerequisites
 * 70-85% → optimal zone, maintain
 * > 85% → too easy, increase difficulty or advance topic
 */

import { Difficulty } from "@/generated/prisma/enums";
import { OPTIMAL_ACCURACY_RANGE } from "./gmat-constants";

export type DifficultyRecommendation = {
  recommended: Difficulty;
  reason: string;
  inOptimalZone: boolean;
};

/**
 * Recommend difficulty level based on recent accuracy.
 */
export function recommendDifficulty(
  currentDifficulty: Difficulty,
  recentAccuracy: number,
  practiceCount: number
): DifficultyRecommendation {
  // Need at least 5 attempts to make a meaningful recommendation
  if (practiceCount < 5) {
    return {
      recommended: currentDifficulty,
      reason: "Not enough data yet — keep practicing at current level",
      inOptimalZone: true,
    };
  }

  const { min, max } = OPTIMAL_ACCURACY_RANGE;

  if (recentAccuracy > max) {
    // Too easy — move up
    const harder = getHarderDifficulty(currentDifficulty);
    if (harder !== currentDifficulty) {
      return {
        recommended: harder,
        reason: `Accuracy ${pct(recentAccuracy)} exceeds ${pct(max)} — ready for harder questions`,
        inOptimalZone: false,
      };
    }
    return {
      recommended: currentDifficulty,
      reason: `Already at hardest level with ${pct(recentAccuracy)} accuracy — consider advancing topics`,
      inOptimalZone: false,
    };
  }

  if (recentAccuracy < min) {
    // Too hard — move down
    const easier = getEasierDifficulty(currentDifficulty);
    if (easier !== currentDifficulty) {
      return {
        recommended: easier,
        reason: `Accuracy ${pct(recentAccuracy)} below ${pct(min)} — review at easier level first`,
        inOptimalZone: false,
      };
    }
    return {
      recommended: currentDifficulty,
      reason: `Already at easiest level with ${pct(recentAccuracy)} accuracy — review prerequisite topics`,
      inOptimalZone: false,
    };
  }

  // In the zone
  return {
    recommended: currentDifficulty,
    reason: `Accuracy ${pct(recentAccuracy)} is in the optimal ${pct(min)}-${pct(max)} learning zone`,
    inOptimalZone: true,
  };
}

function getHarderDifficulty(d: Difficulty): Difficulty {
  switch (d) {
    case Difficulty.EASY:
      return Difficulty.MEDIUM;
    case Difficulty.MEDIUM:
      return Difficulty.HARD;
    case Difficulty.HARD:
      return Difficulty.HARD;
  }
}

function getEasierDifficulty(d: Difficulty): Difficulty {
  switch (d) {
    case Difficulty.EASY:
      return Difficulty.EASY;
    case Difficulty.MEDIUM:
      return Difficulty.EASY;
    case Difficulty.HARD:
      return Difficulty.MEDIUM;
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
