import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildAquaSourceExternalId } from "./sources/aqua-rat";
import {
  countSuspiciousSequences,
  normalizeImportedText,
  normalizeOptionText,
} from "./sources/text-normalization";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const DEFAULT_BATCH_SIZE = 500;

type CliOptions = {
  source: string;
  batchSize: number;
};

type RepairReport = {
  source: string;
  scanned: number;
  updated: number;
  unchanged: number;
  rehashed: number;
  mergedDuplicates: number;
  conflicts: number;
  suspiciousBefore: number;
  suspiciousAfter: number;
  samples: { id: string; reason: string }[];
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRow = await prisma.questionSource.findUnique({
    where: { slug: options.source },
    select: { id: true, slug: true },
  });

  if (!sourceRow) {
    throw new Error(`Unknown imported source "${options.source}"`);
  }

  if (sourceRow.slug !== "aqua-rat") {
    throw new Error(`Repair is only implemented for aqua-rat, received "${sourceRow.slug}"`);
  }

  const report: RepairReport = {
    source: sourceRow.slug,
    scanned: 0,
    updated: 0,
    unchanged: 0,
    rehashed: 0,
    mergedDuplicates: 0,
    conflicts: 0,
    suspiciousBefore: 0,
    suspiciousAfter: 0,
    samples: [],
  };

  let cursor: string | undefined;

  while (true) {
    const questions = await prisma.question.findMany({
      where: { sourceId: sourceRow.id },
      orderBy: { id: "asc" },
      take: options.batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        sourceId: true,
        sourceExternalId: true,
        sourceMetadata: true,
        stem: true,
        explanation: true,
        correctAnswer: true,
        options: true,
      },
    });

    if (questions.length === 0) {
      break;
    }

    for (const question of questions) {
      report.scanned++;

      const optionsPayload = parseOptionsPayload(question.options, question.id);
      const suspiciousBefore =
        countSuspiciousSequences(question.stem) +
        countSuspiciousSequences(question.explanation) +
        optionsPayload.reduce(
          (total, option) => total + countSuspiciousSequences(option.text),
          0
        );

      report.suspiciousBefore += suspiciousBefore;

      const normalizedStem = normalizeImportedText(question.stem);
      const normalizedExplanation = normalizeImportedText(question.explanation);
      const normalizedOptions = normalizeOptionText(optionsPayload);
      const suspiciousAfter =
        countSuspiciousSequences(normalizedStem) +
        countSuspiciousSequences(normalizedExplanation) +
        normalizedOptions.reduce(
          (total, option) => total + countSuspiciousSequences(option.text),
          0
        );

      report.suspiciousAfter += suspiciousAfter;

      const contentChanged =
        normalizedStem !== question.stem ||
        normalizedExplanation !== question.explanation ||
        JSON.stringify(normalizedOptions) !== JSON.stringify(optionsPayload);

      if (!contentChanged) {
        report.unchanged++;
        continue;
      }

      const nextSourceExternalId = buildAquaSourceExternalId(
        normalizedStem,
        normalizedOptions,
        question.correctAnswer
      );

      if (nextSourceExternalId !== question.sourceExternalId) {
        const conflict = await prisma.question.findFirst({
          where: {
            sourceId: question.sourceId,
            sourceExternalId: nextSourceExternalId,
            NOT: { id: question.id },
          },
          select: { id: true },
        });

        if (conflict) {
          const merged = await mergeDuplicateQuestion(question.id, conflict.id);

          if (merged) {
            report.mergedDuplicates++;
            pushSample(report, question.id, `merged into ${conflict.id}`);
            continue;
          }

          report.conflicts++;
          pushSample(report, question.id, `sourceExternalId conflict with ${conflict.id}`);
          continue;
        }
      }

      const sourceMetadata =
        question.sourceMetadata && typeof question.sourceMetadata === "object"
          ? {
              ...(question.sourceMetadata as Record<string, unknown>),
              contentHash: nextSourceExternalId,
            }
          : { contentHash: nextSourceExternalId };

      await prisma.question.update({
        where: { id: question.id },
        data: {
          stem: normalizedStem,
          explanation: normalizedExplanation,
          options: normalizedOptions,
          sourceExternalId: nextSourceExternalId,
          sourceMetadata,
        },
      });

      report.updated++;
      if (nextSourceExternalId !== question.sourceExternalId) {
        report.rehashed++;
      }
    }

    cursor = questions[questions.length - 1]?.id;
  }

  console.log(JSON.stringify(report, null, 2));
}

function parseArgs(argv: string[]): CliOptions {
  let source = "aqua-rat";
  let batchSize = DEFAULT_BATCH_SIZE;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === "--source") {
      source = argv[++index] ?? source;
      continue;
    }

    if (arg === "--batch-size") {
      const raw = argv[++index];
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --batch-size value: ${raw}`);
      }
      batchSize = parsed;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { source, batchSize };
}

function parseOptionsPayload(
  value: unknown,
  questionId: string
): { label: string; text: string }[] {
  if (!Array.isArray(value)) {
    throw new Error(`Question ${questionId} has non-array options`);
  }

  return value.map((option, index) => {
    if (
      !option ||
      typeof option !== "object" ||
      typeof (option as { label?: unknown }).label !== "string" ||
      typeof (option as { text?: unknown }).text !== "string"
    ) {
      throw new Error(`Question ${questionId} has invalid option payload at index ${index}`);
    }

    return {
      label: (option as { label: string }).label,
      text: (option as { text: string }).text,
    };
  });
}

function pushSample(report: RepairReport, id: string, reason: string) {
  if (report.samples.length < 20) {
    report.samples.push({ id, reason });
  }
}

async function mergeDuplicateQuestion(
  duplicateId: string,
  survivorId: string
): Promise<boolean> {
  const [attemptCount, sessionQuestionCount, chatMessageCount] = await Promise.all([
    prisma.attempt.count({ where: { questionId: duplicateId } }),
    prisma.sessionQuestion.count({ where: { questionId: duplicateId } }),
    prisma.chatMessage.count({ where: { questionId: duplicateId } }),
  ]);

  if (attemptCount === 0 && sessionQuestionCount === 0 && chatMessageCount === 0) {
    await prisma.question.delete({ where: { id: duplicateId } });
    return true;
  }

  await prisma.$transaction(async (tx) => {
    if (attemptCount > 0) {
      await tx.attempt.updateMany({
        where: { questionId: duplicateId },
        data: { questionId: survivorId },
      });
    }

    if (chatMessageCount > 0) {
      await tx.chatMessage.updateMany({
        where: { questionId: duplicateId },
        data: { questionId: survivorId },
      });
    }

    if (sessionQuestionCount > 0) {
      const sessionQuestions = await tx.sessionQuestion.findMany({
        where: { questionId: duplicateId },
        select: { id: true, sessionId: true },
      });

      for (const sessionQuestion of sessionQuestions) {
        const existing = await tx.sessionQuestion.findFirst({
          where: {
            sessionId: sessionQuestion.sessionId,
            questionId: survivorId,
          },
          select: { id: true },
        });

        if (existing) {
          await tx.sessionQuestion.delete({ where: { id: sessionQuestion.id } });
          continue;
        }

        await tx.sessionQuestion.update({
          where: { id: sessionQuestion.id },
          data: { questionId: survivorId },
        });
      }
    }

    await tx.question.delete({ where: { id: duplicateId } });
  });

  return true;
}

function printUsage() {
  console.log(
    "Usage: npx tsx scripts/repair-open-imports.ts [--source aqua-rat] [--batch-size N]"
  );
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Unexpected repair-open-imports failure"
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
