/**
 * Task Selection Engine — The Learning Brain
 *
 * Decides "what should the student study next?" using:
 * - Prerequisite gating (topics locked until prereqs PROFICIENT)
 * - Failure-triggered prerequisite remediation
 * - Review prioritization (due topics first, sorted by urgency)
 * - FIRe consolidation (one advanced question reviews multiple prereqs)
 * - Automaticity-aware fluency work after baseline mastery
 * - Knowledge frontier (unlocked but unmastered topics)
 * - Interleaving (vary sections to avoid interference)
 * - Conservative new-topic release when skill debt is building
 *
 * Inspired by Math Academy's task selection algorithm.
 */

import { Difficulty, MasteryStage } from "@/generated/prisma/enums";
import { recommendDifficulty } from "./difficulty-calibrator";
import { getScaffoldLevel } from "./gmat-constants";
import type { TopicSignal } from "./learning-signals";

// ─── Types ──────────────────────────────────────────────────────────

export type TaskType =
  | "REVIEW"
  | "NEW_TOPIC"
  | "CONSOLIDATION"
  | "REMEDIATION"
  | "FLUENCY"
  | "WARMUP";

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
  avgTimeMs: number;
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
  topicSignals?: TopicSignal[];
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
  priority: number;
}

interface RemediationCandidate {
  targetTopic: TopicWithPrereqs;
  strugglingTopic: TopicWithPrereqs;
  priority: number;
}

interface FluencyCandidate {
  topic: TopicWithPrereqs;
  signal: TopicSignal;
  priority: number;
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
 * Find topics where practicing them would implicitly review due topics via FIRe.
 */
function findConsolidationCandidates(
  dueTopicIds: Set<string>,
  allTopics: TopicWithPrereqs[],
  masteryMap: Map<string, TopicMasteryRecord>,
  reviewQueue: ReviewQueueItem[],
  signalMap: Map<string, TopicSignal>
): ConsolidationCandidate[] {
  if (dueTopicIds.size === 0) return [];

  const topicMap = new Map(allTopics.map((t) => [t.id, t]));
  const urgencyMap = new Map(reviewQueue.map((r) => [r.topicId, r.urgency]));
  const candidates: ConsolidationCandidate[] = [];

  for (const topic of allTopics) {
    if (dueTopicIds.has(topic.id)) continue; // Skip topics that are themselves due

    const m = masteryMap.get(topic.id);
    if (!m || m.masteryLevel < 0.3) continue; // Rule 8: must be DEVELOPING+

    const prereqs = getPrereqGraph(topic.id, topicMap);
    const consolidates = [...dueTopicIds].filter((id) => prereqs.has(id));

    if (consolidates.length > 0) {
      const avgUrgency =
        consolidates.reduce((sum, id) => sum + (urgencyMap.get(id) ?? 0), 0) /
        consolidates.length;
      const signal = signalMap.get(topic.id);
      const unlockBonus = topic.prerequisiteOf.length * 0.05;
      const fluencyBonus = signal?.needsFluency ? 0.1 : 0;

      candidates.push({
        topic,
        consolidates,
        avgUrgency,
        priority:
          avgUrgency +
          consolidates.length * 0.25 +
          unlockBonus +
          fluencyBonus,
      });
    }
  }

  return candidates.sort((a, b) => b.priority - a.priority);
}

function findRemediationCandidates(
  allTopics: TopicWithPrereqs[],
  masteryMap: Map<string, TopicMasteryRecord>,
  signalMap: Map<string, TopicSignal>
): RemediationCandidate[] {
  const topicMap = new Map(allTopics.map((topic) => [topic.id, topic]));
  const strugglingSignals = [...signalMap.values()]
    .filter((signal) => signal.needsRemediation)
    .sort((a, b) => {
      if (b.recentIncorrectStreak !== a.recentIncorrectStreak) {
        return b.recentIncorrectStreak - a.recentIncorrectStreak;
      }
      return (
        (a.recentAccuracy ?? 1) - (b.recentAccuracy ?? 1) ||
        a.automaticityScore - b.automaticityScore
      );
    });

  const candidates: RemediationCandidate[] = [];

  for (const signal of strugglingSignals) {
    const strugglingTopic = topicMap.get(signal.topicId);
    if (!strugglingTopic) continue;

    const targetTopic =
      chooseKeyPrerequisite(strugglingTopic, topicMap, masteryMap) ??
      strugglingTopic;

    candidates.push({
      targetTopic,
      strugglingTopic,
      priority:
        1.2 +
        signal.recentIncorrectStreak * 0.15 +
        (1 - (signal.recentAccuracy ?? 0.5)) * 0.25,
    });
  }

  return candidates;
}

function chooseKeyPrerequisite(
  topic: TopicWithPrereqs,
  topicMap: Map<string, TopicWithPrereqs>,
  masteryMap: Map<string, TopicMasteryRecord>
): TopicWithPrereqs | null {
  if (topic.prerequisites.length === 0) return null;

  const ranked = [...topic.prerequisites].sort((a, b) => {
    const masteryA = masteryMap.get(a.id);
    const masteryB = masteryMap.get(b.id);
    const levelA = masteryA?.masteryLevel ?? 0;
    const levelB = masteryB?.masteryLevel ?? 0;

    if (levelA !== levelB) return levelA - levelB;

    const attemptsA = masteryA?.practiceCount ?? 0;
    const attemptsB = masteryB?.practiceCount ?? 0;
    return attemptsA - attemptsB;
  });

  return topicMap.get(ranked[0].id) ?? null;
}

function findFluencyCandidates(
  allTopics: TopicWithPrereqs[],
  signalMap: Map<string, TopicSignal>
): FluencyCandidate[] {
  return allTopics
    .flatMap((topic) => {
      const signal = signalMap.get(topic.id);
      if (!signal?.needsFluency) return [];

      return [
        {
          topic,
          signal,
          priority:
            (1 - signal.automaticityScore) +
            topic.prerequisiteOf.length * 0.05 +
            signal.recentAttemptCount * 0.03,
        },
      ];
    })
    .sort((a, b) => b.priority - a.priority);
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
  const { allTopics, allMastery, reviewQueue, topicSignals = [] } = input;
  const masteryMap = new Map(allMastery.map((m) => [m.topicId, m]));
  const topicMap = new Map(allTopics.map((t) => [t.id, t]));
  const signalMap = new Map(topicSignals.map((signal) => [signal.topicId, signal]));
  const tasks: TaskRecommendation[] = [];
  const selectedTopicIds = new Set<string>();

  const addTask = (task: TaskRecommendation): boolean => {
    if (tasks.length >= count) return false;
    if (selectedTopicIds.has(task.topicId)) return false;

    tasks.push(task);
    selectedTopicIds.add(task.topicId);
    return true;
  };

  // ── Step 0: Failure-triggered prerequisite remediation ──
  const remediationCandidates = findRemediationCandidates(
    allTopics,
    masteryMap,
    signalMap
  );
  const maxRemediationTasks = Math.max(1, Math.floor(count / 2));
  let remediationTasksUsed = 0;

  for (const candidate of remediationCandidates) {
    if (remediationTasksUsed >= maxRemediationTasks) break;

    const mastery = masteryMap.get(candidate.targetTopic.id);
    const sameTopic =
      candidate.targetTopic.id === candidate.strugglingTopic.id;
    const added = addTask({
      taskType: "REMEDIATION",
      topicId: candidate.targetTopic.id,
      topicName: candidate.targetTopic.name,
      section: candidate.targetTopic.section,
      questionId: null,
      difficulty: Difficulty.EASY,
      scaffoldLevel: getRemediationScaffoldForTopic(mastery),
      reason: sameTopic
        ? `Rebuild ${candidate.strugglingTopic.name} after repeated misses`
        : `Repair ${candidate.targetTopic.name} before retrying ${candidate.strugglingTopic.name}`,
      urgency: candidate.priority,
    });

    if (added) remediationTasksUsed++;
  }

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
    reviewQueue,
    signalMap
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

    const added = addTask({
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

    if (added) {
      candidate.consolidates.forEach((id) => consolidatedTopicIds.add(id));
    }
  }

  // ── Step 3: Add remaining due reviews not covered by consolidation ──
  const remainingDue = dueReviews.filter(
    (r) => !consolidatedTopicIds.has(r.topicId)
  );

  // Keep the mix review-heavy, but leave room for remediation and fluency.
  const reviewSlots = Math.max(
    remainingDue.length,
    Math.ceil((count - tasks.length) * 0.6)
  );

  for (const review of remainingDue) {
    if (tasks.length >= count) break;
    const reviewLikeCount = tasks.filter((task) =>
      isReviewLikeTask(task.taskType)
    ).length;
    if (reviewLikeCount >= reviewSlots) break;

    const topic = topicMap.get(review.topicId);
    if (!topic) continue;
    const m = masteryMap.get(review.topicId);
    const difficulty = getDifficultyForTopic(m);
    const scaffold = getScaffoldForTopic(m);
    const retentionPct = Math.round(review.retention * 100);

    addTask({
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

  // ── Step 4: Add fluency work once baseline mastery exists ──
  const fluencyCandidates = findFluencyCandidates(allTopics, signalMap);
  const maxFluencyTasks = Math.max(1, Math.floor(count / 3));
  let fluencyTasksUsed = 0;

  for (const candidate of fluencyCandidates) {
    if (tasks.length >= count) break;
    if (fluencyTasksUsed >= maxFluencyTasks) break;

    const mastery = masteryMap.get(candidate.topic.id);
    const added = addTask({
      taskType: "FLUENCY",
      topicId: candidate.topic.id,
      topicName: candidate.topic.name,
      section: candidate.topic.section,
      questionId: null,
      difficulty: getFluencyDifficultyForTopic(mastery, candidate.signal),
      scaffoldLevel: getFluencyScaffoldForTopic(mastery),
      reason: `Build fluency in ${candidate.topic.name} before pushing farther up the graph`,
      urgency: 0.95 + candidate.priority * 0.1,
    });

    if (added) fluencyTasksUsed++;
  }

  // ── Step 5: Fill remaining with new topics from frontier ──
  const outstandingReviews = dueReviews.length - consolidatedTopicIds.size;
  const shouldBlockNewTopics =
    outstandingReviews >= 5 || remediationCandidates.length > 0;

  if (!shouldBlockNewTopics && tasks.length < count) {
    const frontier = computeKnowledgeFrontier(allTopics, masteryMap);
    const prioritized = prioritizeFrontierTopics(frontier, allTopics, masteryMap);

    for (const topic of prioritized) {
      if (tasks.length >= count) break;
      const m = masteryMap.get(topic.id);
      const difficulty = Difficulty.EASY; // New topics start easy
      const scaffold = getScaffoldForTopic(m);

      addTask({
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

  // If the selector still has room, fall back to more due review.
  for (const review of remainingDue) {
    if (tasks.length >= count) break;
    const topic = topicMap.get(review.topicId);
    if (!topic) continue;

    const mastery = masteryMap.get(review.topicId);
    addTask({
      taskType: "REVIEW",
      topicId: review.topicId,
      topicName: topic.name,
      section: topic.section,
      questionId: null,
      difficulty: getDifficultyForTopic(mastery),
      scaffoldLevel: getScaffoldForTopic(mastery),
      reason: `Review: ${topic.name}`,
      urgency: review.urgency,
    });
  }

  // ── Step 6: Interleave by section ──
  return interleaveBySections(tasks);
}

// ─── Helpers ────────────────────────────────────────────────────────

function isReviewLikeTask(taskType: TaskType): boolean {
  return (
    taskType === "REVIEW" ||
    taskType === "CONSOLIDATION" ||
    taskType === "REMEDIATION" ||
    taskType === "FLUENCY"
  );
}

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

function getRemediationScaffoldForTopic(
  m: TopicMasteryRecord | undefined
): 1 | 2 | 3 | 4 {
  if (!m) return 1;
  return Math.max(1, getScaffoldForTopic(m) - 1) as 1 | 2 | 3 | 4;
}

function getFluencyScaffoldForTopic(
  m: TopicMasteryRecord | undefined
): 1 | 2 | 3 | 4 {
  if (!m) return 2;
  return Math.min(4, getScaffoldForTopic(m) + 1) as 1 | 2 | 3 | 4;
}

function getFluencyDifficultyForTopic(
  m: TopicMasteryRecord | undefined,
  signal: TopicSignal
): Difficulty {
  if (!m || m.masteryLevel < 0.5) return Difficulty.EASY;
  if ((signal.recentAccuracy ?? m.accuracy7d) >= 0.85) return Difficulty.MEDIUM;
  return Difficulty.EASY;
}
