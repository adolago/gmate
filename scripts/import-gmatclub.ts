import "dotenv/config";

/**
 * Import questions from mister-teddy/gmat-database (GitHub Pages JSON API).
 *
 * Source: https://mister-teddy.github.io/gmat-database/
 * 750 questions: 150 each of PS, DS, RC, CR, SC
 *
 * GMAT Focus Edition mapping:
 *   PS → QUANTITATIVE_REASONING / PROBLEM_SOLVING
 *   DS → DATA_INSIGHTS / DATA_SUFFICIENCY
 *   RC → VERBAL_REASONING / READING_COMPREHENSION
 *   CR → VERBAL_REASONING / CRITICAL_REASONING
 *   SC → Skipped (removed from GMAT Focus Edition)
 */

import { PrismaClient, Section, QuestionType, Difficulty } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BASE_URL = "https://mister-teddy.github.io/gmat-database";

const TYPE_MAP: Record<string, { section: Section; questionType: QuestionType; subsection: string }> = {
  PS: {
    section: "QUANTITATIVE_REASONING",
    questionType: "PROBLEM_SOLVING",
    subsection: "Problem Solving",
  },
  DS: {
    section: "DATA_INSIGHTS",
    questionType: "DATA_SUFFICIENCY",
    subsection: "Data Sufficiency",
  },
  RC: {
    section: "VERBAL_REASONING",
    questionType: "READING_COMPREHENSION",
    subsection: "Reading Comprehension",
  },
  CR: {
    section: "VERBAL_REASONING",
    questionType: "CRITICAL_REASONING",
    subsection: "Critical Reasoning",
  },
};

// Types we actually import (SC is excluded — not in GMAT Focus Edition)
const IMPORT_TYPES = ["PS", "DS", "RC", "CR"];

interface GmatDbQuestion {
  id: string;
  src: string;
  type: string;
  question: string;
  answers: string[];
  explanations: string[];
}

const LABELS = ["A", "B", "C", "D", "E"];

function buildOptions(answers: string[]): { label: string; text: string }[] {
  return answers.slice(0, 5).map((text, i) => ({
    label: LABELS[i],
    text: text.trim(),
  }));
}

function cleanExplanation(explanations: string[]): string {
  if (explanations.length === 0) return "No explanation available.";

  // Take the longest explanation (usually the most detailed solution)
  const best = explanations.reduce((a, b) => (a.length > b.length ? a : b), "");

  // Basic cleanup: trim, remove excessive whitespace
  return best
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000); // Cap at 2000 chars
}

// Simple difficulty heuristic based on question length + answer count
function estimateDifficulty(q: GmatDbQuestion): Difficulty {
  const wordCount = q.question.split(/\s+/).length;
  if (wordCount > 80) return "HARD";
  if (wordCount > 40) return "MEDIUM";
  return "EASY";
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function main() {
  console.log("Fetching question index from gmat-database...");
  const index = await fetchJson<Record<string, string[]>>(`${BASE_URL}/index.json`);
  if (!index) {
    console.error("Failed to fetch index.json");
    process.exit(1);
  }

  // Load existing topic map for linking
  const topics = await prisma.topic.findMany({ select: { id: true, name: true, section: true } });
  const topicMap = new Map(topics.map((t) => [`${t.section}:${t.name}`, t.id]));

  // Find best matching topic for a question type
  function findTopicId(section: Section, subsection: string): string | null {
    // Direct match
    const direct = topicMap.get(`${section}:${subsection}`);
    if (direct) return direct;

    // Fallback: find any topic in same section
    for (const [key, id] of topicMap) {
      if (key.startsWith(`${section}:`)) return id;
    }
    return null;
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const type of IMPORT_TYPES) {
    const ids = index[type];
    if (!ids) {
      console.log(`No IDs found for type ${type}, skipping.`);
      continue;
    }

    const mapping = TYPE_MAP[type];
    console.log(`\nImporting ${ids.length} ${type} questions → ${mapping.section}...`);

    for (let i = 0; i < ids.length; i++) {
      const qId = ids[i];

      // Rate limit: small delay to be polite to GitHub Pages
      if (i > 0 && i % 10 === 0) {
        await new Promise((r) => setTimeout(r, 500));
      }

      const q = await fetchJson<GmatDbQuestion>(`${BASE_URL}/${qId}.json`);
      if (!q || !q.question || !q.answers || q.answers.length < 2) {
        failed++;
        continue;
      }

      // Skip if question already exists (by stem prefix match)
      const stemPrefix = q.question.slice(0, 100);
      const existing = await prisma.question.findFirst({
        where: { stem: { startsWith: stemPrefix } },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const options = buildOptions(q.answers);
      // We don't know the correct answer from gmat-database — mark as "A" placeholder
      // The explanations sometimes reveal it, but parsing is unreliable
      const correctAnswer = "A";

      const topicId = findTopicId(mapping.section, mapping.subsection);

      try {
        await prisma.question.create({
          data: {
            section: mapping.section,
            questionType: mapping.questionType,
            subsection: mapping.subsection,
            difficulty: estimateDifficulty(q),
            stem: q.question,
            options,
            correctAnswer,
            explanation: cleanExplanation(q.explanations),
            tags: [type.toLowerCase(), "gmatclub"],
            topicId,
          },
        });
        imported++;
      } catch (err) {
        failed++;
      }

      if ((i + 1) % 25 === 0) {
        process.stdout.write(`  ${i + 1}/${ids.length}\r`);
      }
    }
  }

  console.log(`\nDone! Imported: ${imported}, Skipped (dupes): ${skipped}, Failed: ${failed}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
