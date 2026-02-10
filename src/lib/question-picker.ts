/**
 * Question Picker — Intelligent Question Selection
 *
 * Given a topic and difficulty, picks the best specific question:
 * - Excludes questions answered correctly in last 48 hours
 * - Prefers unattempted questions
 * - Falls back to previously incorrect questions
 * - Falls back difficulty levels if needed (HARD→MEDIUM→EASY)
 */

import { Difficulty } from "@/generated/prisma/enums";
import { prisma } from "./db";

const RECENT_CORRECT_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

const DIFFICULTY_FALLBACK: Record<string, Difficulty[]> = {
  [Difficulty.HARD]: [Difficulty.HARD, Difficulty.MEDIUM, Difficulty.EASY],
  [Difficulty.MEDIUM]: [Difficulty.MEDIUM, Difficulty.EASY],
  [Difficulty.EASY]: [Difficulty.EASY],
};

/**
 * Pick the best question for a given topic and difficulty.
 * Returns the question ID, or null if no questions available.
 */
export async function pickQuestion(
  topicId: string,
  difficulty: Difficulty,
  excludeQuestionIds: string[] = []
): Promise<string | null> {
  const cutoff = new Date(Date.now() - RECENT_CORRECT_WINDOW_MS);
  const fallbacks = DIFFICULTY_FALLBACK[difficulty] ?? [difficulty];

  for (const diff of fallbacks) {
    // Get recently correct question IDs for this topic (to exclude)
    const recentCorrect = await prisma.attempt.findMany({
      where: {
        question: { topicId, difficulty: diff },
        isCorrect: true,
        createdAt: { gte: cutoff },
      },
      select: { questionId: true },
      distinct: ["questionId"],
    });

    const excludeIds = new Set([
      ...excludeQuestionIds,
      ...recentCorrect.map((a) => a.questionId),
    ]);

    // Try unattempted questions first
    const unattempted = await prisma.question.findFirst({
      where: {
        topicId,
        difficulty: diff,
        id: { notIn: [...excludeIds] },
        attempts: { none: {} },
      },
      select: { id: true },
    });

    if (unattempted) return unattempted.id;

    // Fall back to previously incorrect questions (most recent incorrect first)
    const incorrect = await prisma.question.findFirst({
      where: {
        topicId,
        difficulty: diff,
        id: { notIn: [...excludeIds] },
        attempts: { some: { isCorrect: false } },
      },
      select: { id: true },
      orderBy: { attempts: { _count: "asc" } }, // Least attempted
    });

    if (incorrect) return incorrect.id;

    // Last resort: any question at this difficulty not in exclude list
    const any = await prisma.question.findFirst({
      where: {
        topicId,
        difficulty: diff,
        id: { notIn: [...excludeIds] },
      },
      select: { id: true },
    });

    if (any) return any.id;
  }

  return null;
}
