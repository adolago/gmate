import "dotenv/config";

/**
 * Import questions from the GMAT Official Guide (2025-2026).
 *
 * Reads from data/official-questions.json (gitignored — copyrighted content).
 * See data/official-questions.example.json for the expected format.
 *
 * Usage: npx tsx scripts/import-official.ts
 */

import { PrismaClient, Section, QuestionType, Difficulty } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

interface OfficialQuestion {
  section: Section;
  questionType: QuestionType;
  subsection: string;
  difficulty: Difficulty;
  stem: string;
  passage?: string;
  options: { label: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  tags?: string[];
  ogPage?: number; // Official Guide page number for reference
}

async function main() {
  const dataPath = resolve(__dirname, "../data/official-questions.json");

  if (!existsSync(dataPath)) {
    console.error("File not found: data/official-questions.json");
    console.error("Copy data/official-questions.example.json and fill in questions from the OG.");
    process.exit(1);
  }

  const raw = readFileSync(dataPath, "utf-8");
  const questions: OfficialQuestion[] = JSON.parse(raw);

  console.log(`Found ${questions.length} questions in official-questions.json`);

  // Load topic map
  const topics = await prisma.topic.findMany({ select: { id: true, name: true, section: true } });
  const topicMap = new Map(topics.map((t) => [`${t.section}:${t.name}`, t.id]));

  function findTopicId(section: Section, subsection: string): string | null {
    const direct = topicMap.get(`${section}:${subsection}`);
    if (direct) return direct;
    for (const [key, id] of topicMap) {
      if (key.startsWith(`${section}:`)) return id;
    }
    return null;
  }

  let imported = 0;
  let skipped = 0;

  for (const q of questions) {
    // Skip duplicates by stem prefix
    const existing = await prisma.question.findFirst({
      where: { stem: { startsWith: q.stem.slice(0, 100) } },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const topicId = findTopicId(q.section, q.subsection);

    await prisma.question.create({
      data: {
        section: q.section,
        questionType: q.questionType,
        subsection: q.subsection,
        difficulty: q.difficulty,
        stem: q.stem,
        passage: q.passage || null,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        tags: [...(q.tags || []), "official-guide"],
        topicId,
      },
    });
    imported++;
  }

  console.log(`Done! Imported: ${imported}, Skipped (dupes): ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
