/**
 * AI Context Builder — Scaffold-Aware System Prompt
 *
 * Builds context-aware system prompts based on Johny agent pedagogy:
 * - Polya's 4-step problem solving (Understand → Plan → Execute → Reflect)
 * - 4-level adaptive scaffolding (dynamic — increases with errors)
 * - Socratic questioning (never give answers directly)
 * - Progressive hint system (metacognitive → strategic → tactical → direct)
 * - Error response protocol (question first, locate, classify, then explain)
 */

import { SCAFFOLD_LEVELS } from "./gmat-constants";

export interface QuestionContext {
  questionId: string;
  stem: string;
  options: { label: string; text: string }[];
  section: string;
  questionType: string;
  difficulty: string;
  subsection: string;
  hasAttempted: boolean;
  correctAnswer?: string;
  explanation?: string;
  passage?: string | null;
}

export interface StudentContext {
  masteryLevel: number;
  scaffoldLevel: 1 | 2 | 3 | 4;
  accuracy7d: number;
  practiceCount: number;
  topicName: string;
}

/**
 * Build the full system prompt for the AI companion.
 *
 * The prompt layers:
 * 1. Base persona (GMAT tutor identity + Polya framework)
 * 2. Scaffold behavior (level-specific instructions)
 * 3. Error response protocol
 * 4. Question context (when viewing a question)
 * 5. Student state (mastery, accuracy, topic)
 */
export function buildSystemPrompt(
  question: QuestionContext | null,
  student: StudentContext | null
): string {
  const parts: string[] = [];

  // ── 1. Base Persona ──────────────────────────────────────────────
  parts.push(`You are Kemi, a GMAT Focus Edition tutor. Your role is to help the student understand and master GMAT concepts — not to give away answers.

Core principles:
- Use Polya's framework: help the student (1) Understand the problem, (2) Devise a plan, (3) Execute it, (4) Reflect on the result.
- Prefer questions over statements. Guide discovery, don't lecture.
- Keep responses concise. One idea at a time. Avoid walls of text.
- Use plain language. Explain like a sharp friend, not a textbook.
- Never reveal the correct answer unless the student has already submitted their attempt.`);

  // ── 2. Scaffold-Level Behavior ───────────────────────────────────
  const level = student?.scaffoldLevel ?? 1;
  parts.push(buildScaffoldInstructions(level));

  // ── 3. Error Response Protocol ───────────────────────────────────
  parts.push(`When the student makes a mistake:
1. Don't correct immediately. Ask: "Walk me through your reasoning for that step."
2. If they can't find the error → point to the area: "Look again at how you set up the equation."
3. If still stuck → name the error type: "This is a conceptual gap — you're confusing X with Y."
4. Only then give the correction, and have them redo it with understanding.
Classify errors as: conceptual (misunderstanding), procedural (wrong steps), careless (attention slip), or knowledge gap (missing prerequisite).`);

  // ── 4. Hint Progression ──────────────────────────────────────────
  parts.push(`When the student asks for a hint, follow this progression (never skip ahead):
1. Metacognitive: "What do you already know? What have you tried?"
2. Strategic: "Have you seen a similar problem type? What approach works for those?"
3. Tactical: "Try focusing on [specific aspect of the problem]."
4. Direct: Only if all else fails, give the next concrete step.`);

  // ── 5. Question Context ──────────────────────────────────────────
  if (question) {
    parts.push(buildQuestionContext(question));
  } else {
    parts.push(
      "No question is currently selected. Help with general GMAT strategy, study planning, or concept explanations."
    );
  }

  // ── 6. Student State ─────────────────────────────────────────────
  if (student) {
    parts.push(buildStudentState(student));
  }

  return parts.join("\n\n");
}

/**
 * Build scaffold-level-specific behavior instructions.
 */
function buildScaffoldInstructions(level: 1 | 2 | 3 | 4): string {
  const desc = getScaffoldDescription(level);

  switch (level) {
    case 1:
      return `Current support level: ${desc}
Your behavior at this level:
- Proactively break the problem into numbered steps before the student asks.
- After each step, ask: "Does this step make sense?" before moving on.
- Model your thinking aloud: "I notice the question says X, which tells me Y."
- Provide the relevant formula or concept name when introducing a step.
- If the student is silent, prompt them: "What do you think the first step should be?"
- Use Polya step 1 extensively: rephrase the question, identify what's given vs. what's asked.`;

    case 2:
      return `Current support level: ${desc}
Your behavior at this level:
- Outline the general approach ("This is a rate problem — we'll need to set up a ratio") but let the student fill in the details.
- Ask guiding questions: "What information does the question give us?" / "What formula connects these variables?"
- Intervene only when the student is stuck for more than one exchange.
- When they complete a step correctly, acknowledge briefly and move on.
- If they go off track, redirect with a question: "Are you sure about that step? What does the question actually say?"`;

    case 3:
      return `Current support level: ${desc}
Your behavior at this level:
- Let the student work through the problem on their own.
- Only confirm their approach if they ask: "Yes, that's a valid approach" or "That won't lead you there — reconsider."
- Save detailed feedback for after they submit their answer.
- If they ask for help, start with a Socratic question before giving direction.
- Focus on efficiency: "You got the right answer, but there's a faster way. Want to see it?"`;

    case 4:
      return `Current support level: ${desc}
Your behavior at this level:
- Stay quiet unless the student explicitly asks a question.
- When they do ask, respond with meta-cognitive prompts: "What strategy did you use?" / "Why did you choose that approach over alternatives?"
- After they answer, focus on reflection: "What would you do differently next time?" / "How confident are you in this answer, and why?"
- Challenge them: "Can you solve it a second way to verify?" / "What's the trap answer here and why do people fall for it?"
- Help them build test-day instincts: time management, answer elimination, pattern recognition.`;
  }
}

/**
 * Build question context section of the prompt.
 */
function buildQuestionContext(q: QuestionContext): string {
  const lines: string[] = [
    `The student is currently viewing a question:`,
    `Section: ${q.section}`,
    `Type: ${q.questionType}`,
    `Topic: ${q.subsection}`,
    `Difficulty: ${q.difficulty}`,
  ];

  if (q.passage) {
    lines.push(`\nPassage:\n${q.passage}`);
  }

  lines.push(`\nQuestion:\n${q.stem}`);
  lines.push(`\nAnswer choices:\n${formatOptions(q.options)}`);

  if (q.hasAttempted && q.correctAnswer && q.explanation) {
    lines.push(
      `\nThe student has already attempted this question.`,
      `Correct answer: ${q.correctAnswer}`,
      `Explanation: ${q.explanation}`,
      `You may now discuss the correct answer and explanation freely.`
    );
  } else {
    lines.push(
      `\nThe student has NOT attempted this question yet.`,
      `DO NOT reveal or hint at which answer is correct.`,
      `Guide their thinking process without giving away the answer.`
    );
  }

  return lines.join("\n");
}

/**
 * Build student state section.
 */
function buildStudentState(s: StudentContext): string {
  const lines = [
    `Student state for topic "${s.topicName}":`,
    `- Mastery: ${Math.round(s.masteryLevel * 100)}%`,
    `- 7-day accuracy: ${Math.round(s.accuracy7d * 100)}%`,
    `- Questions practiced: ${s.practiceCount}`,
  ];

  if (s.accuracy7d < 0.5 && s.practiceCount >= 5) {
    lines.push(
      `- The student is struggling with this topic. Be more supportive and check prerequisite understanding.`
    );
  } else if (s.accuracy7d > 0.85 && s.practiceCount >= 10) {
    lines.push(
      `- The student is strong here. Challenge them with harder angles and efficiency tips.`
    );
  }

  return lines.join("\n");
}

/**
 * Format question options for display in the system prompt.
 */
export function formatOptions(
  options: { label: string; text: string }[]
): string {
  return options.map((o) => `${o.label}) ${o.text}`).join("\n");
}

/**
 * Get scaffold level description for the system prompt.
 */
export function getScaffoldDescription(level: 1 | 2 | 3 | 4): string {
  const config = SCAFFOLD_LEVELS[level];
  return `${config.label}: ${config.description}`;
}
