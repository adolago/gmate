/**
 * Task Selection Engine — The Learning Brain
 *
 * Decides "what should the student study next?" using:
 * - Prerequisite gating (topics locked until prereqs PROFICIENT)
 * - Review prioritization (due topics first, sorted by urgency)
 * - FIRe consolidation (one advanced question reviews multiple prereqs)
 * - Knowledge frontier (unlocked but unmastered topics)
 * - Interleaving (vary sections to avoid interference)
 * - 60/40 review/new balance
 *
 * Inspired by Math Academy's task selection algorithm.
 */

import { Difficulty, MasteryStage } from "@/generated/prisma/enums";
import { calculateRetention, calculateUrgency } from "./spaced-repetition";
import { recommendDifficulty } from "./difficulty-calibrator";
import { getScaffoldLevel } from "./gmat-constants";
import { getMasteryStage } from "./mastery";

// ─── Types ──────────────────────────────────────────────────────────

export type TaskType = "REVIEW" | "NEW_TOPIC" | "CONSOLIDATION" | "WARMUP";

export interface TaskRecommendation {
  taskType: TaskType;
  topicId: string;
  topicName: string;
  section: string;
  questionId: string | null; // null = resolved later by question-picker
  difficulty: Difficulty;
  scaffoldLevel: 1 | 2 | 3 | 4;
  reason: string;
  urgency: number; // 0-1+ normalized priority
  fireConsolidatesTopics?: string[];
}

export interface TopicWithPrereqs {
  id: string;
  name: string;
  section: string;
  prerequisites: { id: string; name: string }[];
  prerequisiteOf: { id: string; name: string }[];
}

export interface TopicMasteryRecord {
  topicId: string;
  masteryLevel: number;
  masteryStage: MasteryStage;
  practiceCount: number;
  accuracy7d: number;
  accuracy30d: number;
  stabilityFactor: number;
  lastPracticedAt: Date | null;
  nextReviewAt: Date | null;
}

export interface ReviewQueueItem {
  topicId: string;
  urgency: number;
  scheduledAt: Date;
  intervalMs: number;
  isDue: boolean;
  retention: number;
}

export interface TaskSelectorInput {
  allTopics: TopicWithPrereqs[];
  allMastery: TopicMasteryRecord[];
  reviewQueue: ReviewQueueItem[];
}

// ─── Prerequisite Gating (Rules 1-3) ────────────────────────────────

/**
 * A topic is unlocked when ALL prerequisites have masteryLevel >= 0.5 (PROFICIENT).
 */
export function isTopicUnlocked(
  topic: TopicWithPrereqs,
  masteryMap: Map<string, TopicMasteryRecord>
): boolean {
  if (topic.prerequisites.length === 0) return true;
  return topic.prerequisites.every((prereq) => {
    const m = masteryMap.get(prereq.id);
    return m !== undefined && m.masteryLevel >= 0.5;
  });
}

/**
 * Knowledge frontier: unlocked topics that are UNKNOWN or INTRODUCED.
 * These are where new learning happens.
 */
export function computeKnowledgeFrontier(
  allTopics: TopicWithPrereqs[],
  masteryMap: Map<string, TopicMasteryRecord>
): TopicWithPrereqs[] {
  return allTopics.filter((topic) => {
    if (!isTopicUnlocked(topic, masteryMap)) return false;
    const m = masteryMap.get(topic.id);
    const level = m?.masteryLevel ?? 0;
    return level < 0.3; // UNKNOWN or INTRODUCED
  });
}

// ─── FIRe Consolidation (Rules 6-9) ─────────────────────────────────

interface ConsolidationCandidate {
  topic: TopicWithPrereqs;
  consolidates: string[]; // topic IDs of due reviews it covers
  avgUrgency: number;
  priority: number; // avgUrgency + 0.2 bonus
}

/**
 * Compute prerequisite IDs for a topic synchronously from the in-memory graph.
 * Returns all prereqs up to depth 4, with the depth at which they appear.
 */
function getPrereqGraph(
  topicId: string,
  topicMap: Map<string, TopicWithPrereqs>
): Set<string> {
  const prereqs = new Set<string>();
  const visited = new Set<string>([topicId]);

  function traverse(currentId: string, depth: number) {
    if (depth > 4) return;
    const topic = topicMap.get(currentId);
    if (!topic) return;
    for (const p of topic.prerequisites) {
      if (visited.has(p.id)) continue;
      visited.add(p.id);
      prereqs.add(p.id);
      traverse(p.id, depth + 1);
    }
  }

  traverse(topicId, 1);
  return prereqs;
}

/**
 * Find topics where practicing them would implicitly review 2+ due topics via FIRe.
 */
function findConsolidationCandidates(
  dueTopicIds: Set<string>,
  allTopics: TopicWithPrereqs[],
  masteryMap: Map<string, TopicMasteryRecord>,
  reviewQueue: ReviewQueueItem[]
): ConsolidationCandidate[] {
  if (dueTopicIds.size < 3) return []; // Rule 6: only when 3+ due

  const topicMap = new Map(allTopics.map((t) => [t.id, t]));
  const urgencyMap = new Map(reviewQueue.map((r) => [r.topicId, r.urgency]));
  const candidates: ConsolidationCandidate[] = [];

  for (const topic of allTopics) {
    if (dueTopicIds.has(topic.id)) continue; // Skip topics that are themselves due

    const m = masteryMap.get(topic.id);
    if (!m || m.masteryLevel < 0.3) continue; // Rule 8: must be DEVELOPING+

    const prereqs = getPrereqGraph(topic.id, topicMap);
    const consolidates = [...dueTopicIds].filter((id) => prereqs.has(id));

    if (consolidates.length >= 2) {
      // Rule 7: covers 2+ due topics
      const avgUrgency =
        consolidates.reduce((sum, id) => sum + (urgencyMap.get(id) ?? 0), 0) /
        consolidates.length;

      candidates.push({
        topic,
        consolidates,
        avgUrgency,
        priority: avgUrgency + 0.2, // Rule 9: +0.2 bonus
      });
    }
  }

  return candidates.sort((a, b) => b.priority - a.priority);
}

// ─── Interleaving (Rules 13-14) ─────────────────────────────────────

/**
 * Reorder tasks so no two consecutive tasks share the same section.
 */
function interleaveBySections(
  tasks: TaskRecommendation[]
): TaskRecommendation[] {
  if (tasks.length <= 1) return tasks;

  const result: TaskRecommendation[] = [];
  const remaining = [...tasks];

  // Start with the highest-urgency task
  remaining.sort((a, b) => b.urgency - a.urgency);
  result.push(remaining.shift()!);

  while (remaining.length > 0) {
    const lastSection = result[result.length - 1].section;
    // Find first task with a different section
    const diffIdx = remaining.findIndex((t) => t.section !== lastSection);
    if (diffIdx >= 0) {
      result.push(remaining.splice(diffIdx, 1)[0]);
    } else {
      // All remaining are same section — just append
      result.push(remaining.shift()!);
    }
  }

  return result;
}

// ─── Frontier Prioritization (Rule 11) ──────────────────────────────

/**
 * Prioritize frontier topics by: (1) downstream unlock count, (2) section balance.
 * Topics that unlock the most downstream content are learned first.
 * Ties broken by preferring the section with the fewest practiced topics.
 */
function prioritizeFrontierTopics(
  frontier: TopicWithPrereqs[],
  allTopics: TopicWithPrereqs[],
  masteryMap: Map<string, TopicMasteryRecord>
): TopicWithPrereqs[] {
  // Count practiced topics per section for section balancing
  const sectionPracticeCount = new Map<string, number>();
  for (const m of masteryMap.values()) {
    const topic = allTopics.find((t) => t.id === m.topicId);
    if (topic && m.practiceCount > 0) {
      sectionPracticeCount.set(
        topic.section,
        (sectionPracticeCount.get(topic.section) ?? 0) + 1
      );
    }
  }

  return [...frontier].sort((a, b) => {
    // Primary: more downstream unlocks = higher priority
    const aUnlocks = a.prerequisiteOf.length;
    const bUnlocks = b.prerequisiteOf.length;
    if (bUnlocks !== aUnlocks) return bUnlocks - aUnlocks;

    // Tiebreaker: prefer the section with fewer practiced topics
    const aPracticed = sectionPracticeCount.get(a.section) ?? 0;
    const bPracticed = sectionPracticeCount.get(b.section) ?? 0;
    return aPracticed - bPracticed;
  });
}

// ─── Core Selection (Rules 4-5, 10, 12, 15-18) ─────────────────────

/**
 * Select the next N tasks for the student.
 */
export function selectNextTasks(
  input: TaskSelectorInput,
  count: number = 5,
  now: Date = new Date()
): TaskRecommendation[] {
  const { allTopics, allMastery, reviewQueue } = input;
  const masteryMap = new Map(allMastery.map((m) => [m.topicId, m]));
  const topicMap = new Map(allTopics.map((t) => [t.id, t]));
  const tasks: TaskRecommendation[] = [];

  // ── Step 1: Identify due reviews (Rules 4-5) ──
  const dueReviews = reviewQueue
    .filter((r) => r.isDue)
    .sort((a, b) => b.urgency - a.urgency);

  const dueTopicIds = new Set(dueReviews.map((r) => r.topicId));

  // ── Step 2: Check for consolidation opportunities (Rules 6-9) ──
  const consolidations = findConsolidationCandidates(
    dueTopicIds,
    allTopics,
    masteryMap,
    reviewQueue
  );

  // Track which due topics are covered by consolidation
  const consolidatedTopicIds = new Set<string>();

  // Add consolidation tasks first (they're most efficient)
  for (const candidate of consolidations) {
    if (tasks.length >= count) break;
    const m = masteryMap.get(candidate.topic.id);
    const topic = candidate.topic;
    const difficulty = getDifficultyForTopic(m);
    const scaffold = getScaffoldForTopic(m);

    tasks.push({
      taskType: "CONSOLIDATION",
      topicId: topic.id,
      topicName: topic.name,
      section: topic.section,
      questionId: null,
      difficulty,
      scaffoldLevel: scaffold,
      reason: `Review ${candidate.consolidates.length} topics at once via ${topic.name}`,
      urgency: candidate.priority,
      fireConsolidatesTopics: candidate.consolidates,
    });

    candidate.consolidates.forEach((id) => consolidatedTopicIds.add(id));
  }

  // ── Step 3: Add remaining due reviews not covered by consolidation ──
  const remainingDue = dueReviews.filter(
    (r) => !consolidatedTopicIds.has(r.topicId)
  );

  // Rule 18: target 60% review — but never skip a due review
  const reviewSlots = Math.max(
    remainingDue.length,
    Math.ceil((count - tasks.length) * 0.6)
  );

  for (const review of remainingDue) {
    if (tasks.length >= count) break;
    if (tasks.length - consolidations.length >= reviewSlots) break;

    const topic = topicMap.get(review.topicId);
    if (!topic) continue;
    const m = masteryMap.get(review.topicId);
    const difficulty = getDifficultyForTopic(m);
    const scaffold = getScaffoldForTopic(m);
    const retentionPct = Math.round(review.retention * 100);

    tasks.push({
      taskType: "REVIEW",
      topicId: review.topicId,
      topicName: topic.name,
      section: topic.section,
      questionId: null,
      difficulty,
      scaffoldLevel: scaffold,
      reason: `Review: ${topic.name} retention at ${retentionPct}%`,
      urgency: review.urgency,
    });
  }

  // ── Step 4: Fill remaining with new topics from frontier (Rules 10-12) ──
  // Rule 12: block new topics if 5+ reviews outstanding
  const outstandingReviews = dueReviews.length - consolidatedTopicIds.size;
  if (outstandingReviews < 5 && tasks.length < count) {
    const frontier = computeKnowledgeFrontier(allTopics, masteryMap);
    const prioritized = prioritizeFrontierTopics(frontier, allTopics, masteryMap);

    for (const topic of prioritized) {
      if (tasks.length >= count) break;
      const m = masteryMap.get(topic.id);
      const difficulty = Difficulty.EASY; // New topics start easy
      const scaffold = getScaffoldForTopic(m);

      tasks.push({
        taskType: "NEW_TOPIC",
        topicId: topic.id,
        topicName: topic.name,
        section: topic.section,
        questionId: null,
        difficulty,
        scaffoldLevel: scaffold,
        reason: `Learn: ${topic.name} — prerequisites met`,
        urgency: 0,
      });
    }
  }

  // ── Step 5: Interleave by section (Rule 13) ──
  return interleaveBySections(tasks);
}

// ─── Helpers ────────────────────────────────────────────────────────

function getDifficultyForTopic(
  m: TopicMasteryRecord | undefined
): Difficulty {
  if (!m || m.practiceCount < 5) return Difficulty.EASY;
  return recommendDifficulty(Difficulty.MEDIUM, m.accuracy7d, m.practiceCount)
    .recommended;
}

function getScaffoldForTopic(
  m: TopicMasteryRecord | undefined
): 1 | 2 | 3 | 4 {
  if (!m) return 1;
  return getScaffoldLevel(m.masteryLevel, m.accuracy7d, m.practiceCount);
}
