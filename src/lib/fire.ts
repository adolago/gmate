/**
 * FIRe — Fractional Implicit Repetition
 *
 * From Johny's agent-core: when practicing an advanced topic,
 * prerequisite topics receive automatic implicit credit at
 * decaying weight through the prerequisite chain.
 *
 * Weight = 0.5^depth
 * - Direct prerequisite: 50% credit
 * - 2 levels up: 25% credit
 * - 3 levels up: 12.5% credit
 *
 * This reduces explicit review burden by ~80% while maintaining
 * retention across the knowledge graph.
 */

const FIRE_BASE_WEIGHT = 0.5;
const MAX_DEPTH = 4; // Don't propagate beyond 4 levels

export interface FIReCredit {
  topicId: string;
  weight: number; // 0.0 - 1.0 (how much credit this topic gets)
  depth: number; // How many prerequisite levels away
}

/**
 * Given a topic and a prerequisite graph, compute all FIRe credits.
 *
 * @param topicId - The topic being explicitly practiced
 * @param getPrerequisites - Function that returns prerequisite topic IDs for a given topic
 * @returns Array of FIRe credits for all prerequisite topics
 */
export async function computeFIReCredits(
  topicId: string,
  getPrerequisites: (topicId: string) => Promise<string[]>
): Promise<FIReCredit[]> {
  const credits: FIReCredit[] = [];
  const visited = new Set<string>([topicId]); // Don't credit self or revisit

  async function traverse(currentId: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;

    const prerequisites = await getPrerequisites(currentId);

    for (const prereqId of prerequisites) {
      if (visited.has(prereqId)) continue;
      visited.add(prereqId);

      const weight = Math.pow(FIRE_BASE_WEIGHT, depth);
      credits.push({ topicId: prereqId, weight, depth });

      await traverse(prereqId, depth + 1);
    }
  }

  await traverse(topicId, 1);
  return credits;
}

/**
 * Apply FIRe credit score: the actual attempt score scaled by the FIRe weight.
 * Used as input to mastery.updateMasteryLevel with isImplicit=true.
 */
export function applyFIReWeight(
  attemptScore: number,
  fireWeight: number
): number {
  return attemptScore * fireWeight;
}
