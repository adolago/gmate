import { Section, QuestionType, Difficulty, MasteryStage } from "@/generated/prisma/enums";

// ─── Section Metadata ────────────────────────────────────────────────

export const SECTIONS = {
  [Section.QUANTITATIVE_REASONING]: {
    label: "Quantitative Reasoning",
    shortLabel: "Quant",
    questionCount: 21, // GMAT Focus Edition
    timeMinutes: 45,
    color: "blue",
  },
  [Section.VERBAL_REASONING]: {
    label: "Verbal Reasoning",
    shortLabel: "Verbal",
    questionCount: 23,
    timeMinutes: 45,
    color: "green",
  },
  [Section.DATA_INSIGHTS]: {
    label: "Data Insights",
    shortLabel: "DI",
    questionCount: 20,
    timeMinutes: 45,
    color: "purple",
  },
} as const;

// ─── Question Types per Section ──────────────────────────────────────

export const QUESTION_TYPES_BY_SECTION: Record<Section, QuestionType[]> = {
  [Section.QUANTITATIVE_REASONING]: [QuestionType.PROBLEM_SOLVING],
  [Section.VERBAL_REASONING]: [
    QuestionType.READING_COMPREHENSION,
    QuestionType.CRITICAL_REASONING,
  ],
  [Section.DATA_INSIGHTS]: [
    QuestionType.DATA_SUFFICIENCY,
    QuestionType.MULTI_SOURCE_REASONING,
    QuestionType.TABLE_ANALYSIS,
    QuestionType.GRAPHICS_INTERPRETATION,
    QuestionType.TWO_PART_ANALYSIS,
  ],
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  [QuestionType.PROBLEM_SOLVING]: "Problem Solving",
  [QuestionType.READING_COMPREHENSION]: "Reading Comprehension",
  [QuestionType.CRITICAL_REASONING]: "Critical Reasoning",
  [QuestionType.DATA_SUFFICIENCY]: "Data Sufficiency",
  [QuestionType.MULTI_SOURCE_REASONING]: "Multi-Source Reasoning",
  [QuestionType.TABLE_ANALYSIS]: "Table Analysis",
  [QuestionType.GRAPHICS_INTERPRETATION]: "Graphics Interpretation",
  [QuestionType.TWO_PART_ANALYSIS]: "Two-Part Analysis",
};

// ─── Difficulty ──────────────────────────────────────────────────────

export const DIFFICULTY_CONFIG = {
  [Difficulty.EASY]: { label: "Easy", color: "emerald", weight: 1 },
  [Difficulty.MEDIUM]: { label: "Medium", color: "amber", weight: 2 },
  [Difficulty.HARD]: { label: "Hard", color: "red", weight: 3 },
} as const;

// ─── Mastery Stages ──────────────────────────────────────────────────

export const MASTERY_THRESHOLDS: Record<MasteryStage, number> = {
  [MasteryStage.UNKNOWN]: 0.0,
  [MasteryStage.INTRODUCED]: 0.1,
  [MasteryStage.DEVELOPING]: 0.3,
  [MasteryStage.PROFICIENT]: 0.5,
  [MasteryStage.MASTERED]: 0.75,
  [MasteryStage.FLUENT]: 0.9,
};

export const MASTERY_STAGE_LABELS: Record<MasteryStage, string> = {
  [MasteryStage.UNKNOWN]: "Not Started",
  [MasteryStage.INTRODUCED]: "Introduced",
  [MasteryStage.DEVELOPING]: "Developing",
  [MasteryStage.PROFICIENT]: "Proficient",
  [MasteryStage.MASTERED]: "Mastered",
  [MasteryStage.FLUENT]: "Fluent",
};

// ─── Scaffolding Levels ──────────────────────────────────────────────

export const SCAFFOLD_LEVELS = {
  1: {
    label: "Heavy Support",
    description: "Step-by-step guidance with hints",
    masteryRange: [0, 0.3] as const,
  },
  2: {
    label: "Moderate Support",
    description: "Outline approach, fill in details",
    masteryRange: [0.3, 0.5] as const,
  },
  3: {
    label: "Light Support",
    description: "Confirm approach, review at end",
    masteryRange: [0.5, 0.75] as const,
  },
  4: {
    label: "Independent",
    description: "Only help if asked",
    masteryRange: [0.75, 1.0] as const,
  },
} as const;

/**
 * Dynamic scaffold level based on mastery AND recent error rate.
 * As errors increase, support ramps up regardless of mastery.
 * This means a "Mastered" student who starts struggling gets
 * bumped back to moderate support automatically.
 *
 * @param masteryLevel - Topic mastery (0.0 - 1.0)
 * @param recentAccuracy - Accuracy over recent attempts (0.0 - 1.0), null if no recent data
 * @param recentAttemptCount - Number of recent attempts (to avoid overreacting to noise)
 */
export function getScaffoldLevel(
  masteryLevel: number,
  recentAccuracy: number | null = null,
  recentAttemptCount: number = 0
): 1 | 2 | 3 | 4 {
  // Base level from mastery
  let level: 1 | 2 | 3 | 4;
  if (masteryLevel < 0.3) level = 1;
  else if (masteryLevel < 0.5) level = 2;
  else if (masteryLevel < 0.75) level = 3;
  else level = 4;

  // Dynamic adjustment: if recent accuracy is poor, increase support
  // Only kick in after 3+ recent attempts to avoid noise
  if (recentAccuracy !== null && recentAttemptCount >= 3) {
    if (recentAccuracy < 0.4) {
      // Struggling hard — bump up support by 2 levels
      level = Math.max(1, level - 2) as 1 | 2 | 3 | 4;
    } else if (recentAccuracy < 0.6) {
      // Below optimal zone — bump up support by 1 level
      level = Math.max(1, level - 1) as 1 | 2 | 3 | 4;
    }
  }

  return level;
}

// ─── Optimal Learning Zone ───────────────────────────────────────────

export const OPTIMAL_ACCURACY_RANGE = {
  min: 0.7,
  max: 0.85,
} as const;

// ─── GMAT Knowledge Graph (Prerequisite DAG) ─────────────────────────
// Defines topic names and their prerequisites within each section.
// Used by the seed script to create Topic records with prerequisite relations.

export type TopicDef = {
  name: string;
  section: Section;
  prerequisites: string[]; // Names of prerequisite topics (within same section)
  description?: string;
};

export const TOPIC_GRAPH: TopicDef[] = [
  // ── Quantitative Reasoning ──────────────────
  { name: "Arithmetic", section: Section.QUANTITATIVE_REASONING, prerequisites: [], description: "Number operations, fractions, decimals, percentages" },
  { name: "Number Properties", section: Section.QUANTITATIVE_REASONING, prerequisites: ["Arithmetic"], description: "Primes, divisibility, remainders, even/odd" },
  { name: "Algebra", section: Section.QUANTITATIVE_REASONING, prerequisites: ["Arithmetic"], description: "Equations, inequalities, expressions" },
  { name: "Ratios & Proportions", section: Section.QUANTITATIVE_REASONING, prerequisites: ["Arithmetic"], description: "Ratios, rates, proportions, mixtures" },
  { name: "Word Problems", section: Section.QUANTITATIVE_REASONING, prerequisites: ["Algebra", "Ratios & Proportions"], description: "Work/rate, distance, profit, sets, sequences" },
  { name: "Geometry", section: Section.QUANTITATIVE_REASONING, prerequisites: ["Algebra"], description: "Lines, angles, triangles, circles, coordinate geometry" },
  { name: "Statistics & Counting", section: Section.QUANTITATIVE_REASONING, prerequisites: ["Arithmetic", "Number Properties"], description: "Mean, median, mode, probability, permutations" },

  // ── Verbal Reasoning ────────────────────────
  { name: "Grammar Fundamentals", section: Section.VERBAL_REASONING, prerequisites: [], description: "Subject-verb agreement, tenses, modifiers" },
  { name: "Sentence Structure", section: Section.VERBAL_REASONING, prerequisites: ["Grammar Fundamentals"], description: "Parallelism, clauses, pronouns, idioms" },
  { name: "Reading Comprehension", section: Section.VERBAL_REASONING, prerequisites: ["Sentence Structure"], description: "Main idea, inference, detail, tone, structure" },
  { name: "Argument Structure", section: Section.VERBAL_REASONING, prerequisites: ["Reading Comprehension"], description: "Premise, conclusion, assumption identification" },
  { name: "Critical Reasoning", section: Section.VERBAL_REASONING, prerequisites: ["Argument Structure"], description: "Strengthen, weaken, evaluate, flaw, bold-face" },

  // ── Data Insights ───────────────────────────
  { name: "Data Interpretation", section: Section.DATA_INSIGHTS, prerequisites: [], description: "Reading charts, graphs, and tables" },
  { name: "Logical Reasoning", section: Section.DATA_INSIGHTS, prerequisites: [], description: "Deductive and inductive reasoning basics" },
  { name: "Data Sufficiency", section: Section.DATA_INSIGHTS, prerequisites: ["Data Interpretation", "Logical Reasoning"], description: "Determining if data is sufficient to answer" },
  { name: "Table Analysis", section: Section.DATA_INSIGHTS, prerequisites: ["Data Interpretation"], description: "Sorting and analyzing tabular data" },
  { name: "Graphics Interpretation", section: Section.DATA_INSIGHTS, prerequisites: ["Data Interpretation"], description: "Interpreting complex graphical displays" },
  { name: "Multi-Source Reasoning", section: Section.DATA_INSIGHTS, prerequisites: ["Data Interpretation", "Logical Reasoning"], description: "Synthesizing info from multiple sources" },
  { name: "Two-Part Analysis", section: Section.DATA_INSIGHTS, prerequisites: ["Logical Reasoning"], description: "Solving problems with two interrelated components" },
];

// ─── Time Limits ─────────────────────────────────────────────────────

export const SESSION_TIME_PRESETS = {
  QUICK: { label: "Quick (15 min)", ms: 15 * 60 * 1000 },
  STANDARD: { label: "Standard (30 min)", ms: 30 * 60 * 1000 },
  FULL_SECTION: { label: "Full Section (45 min)", ms: 45 * 60 * 1000 },
  EXAM_SIM: { label: "Exam Simulation (135 min)", ms: 135 * 60 * 1000 },
} as const;
