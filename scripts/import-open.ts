import "dotenv/config";

import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Section } from "../src/generated/prisma/client";
import { APPROVED_OPEN_SOURCES, getApprovedSource } from "./sources/registry";
import type {
  ImportFailureSample,
  ImportReport,
  OpenQuestionRecord,
  OpenQuestionSourceAdapter,
  SourceSplit,
} from "./sources/types";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type CliOptions = {
  source: string;
  split: string;
  dryRun: boolean;
  limit: number | null;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const selectedSources = resolveSources(options.source);

  for (const source of selectedSources) {
    assertRedistributable(source);
    const splits = resolveSplits(source, options.split);
    const topicMap = options.dryRun ? null : await loadTopicMap();
    const sourceRow = options.dryRun
      ? null
      : await prisma.questionSource.upsert({
          where: { slug: source.slug },
          create: {
            slug: source.slug,
            displayName: source.displayName,
            homepageUrl: source.homepageUrl,
            license: source.license,
            redistributable: source.redistributable,
            notes: source.notes ?? null,
          },
          update: {
            displayName: source.displayName,
            homepageUrl: source.homepageUrl,
            license: source.license,
            redistributable: source.redistributable,
            notes: source.notes ?? null,
          },
        });

    const report: ImportReport = {
      source: source.slug,
      splits,
      dryRun: options.dryRun,
      limit: options.limit,
      seen: 0,
      wouldCreate: 0,
      created: 0,
      skippedExisting: 0,
      rejected: 0,
      parseFailures: 0,
      topicMapped: 0,
      topicUnmapped: 0,
      failures: [],
    };

    let remaining = options.limit;

    for (const split of splits) {
      if (remaining !== null && remaining <= 0) break;

      const fetchedSplit = await source.fetchSplit(split);

      for (let rowIndex = 0; rowIndex < fetchedSplit.records.length; rowIndex++) {
        if (remaining !== null && remaining <= 0) break;

        report.seen++;
        if (remaining !== null) remaining--;

        const raw = fetchedSplit.records[rowIndex];

        try {
          const mapped = source.mapRecord(raw, {
            split,
            rowIndex,
            sourceUrl: fetchedSplit.usedUrl,
          });
          const validationErrors = source.validate(mapped);

          if (validationErrors.length > 0) {
            report.rejected++;
            pushFailure(report.failures, {
              split,
              rowIndex,
              reason: validationErrors.join("; "),
            });
            continue;
          }

          if (mapped.topicName) {
            report.topicMapped++;
          } else {
            report.topicUnmapped++;
          }

          const sourceExternalId = ensureSourceExternalId(mapped);

          if (options.dryRun) {
            report.wouldCreate++;
            continue;
          }

          const existing = await prisma.question.findFirst({
            where: {
              source: { is: { slug: source.slug } },
              sourceExternalId,
            },
            select: { id: true },
          });

          if (existing) {
            report.skippedExisting++;
            continue;
          }

          if (!sourceRow) {
            throw new Error(`Missing QuestionSource row for ${source.slug}`);
          }

          const topicId = mapped.topicName
            ? topicMap?.get(`${mapped.section}:${mapped.topicName}`) ?? null
            : null;

          await prisma.question.create({
            data: {
              section: mapped.section,
              questionType: mapped.questionType,
              subsection: mapped.subsection,
              difficulty: mapped.difficulty,
              stem: mapped.stem,
              passage: mapped.passage,
              options: mapped.options,
              correctAnswer: mapped.correctAnswer,
              explanation: mapped.explanation,
              tags: mapped.topicName
                ? mapped.tags
                : [...mapped.tags, "needs-topic-review"],
              topicId,
              sourceId: sourceRow.id,
              sourceExternalId,
              sourceUrl: mapped.sourceUrl,
              sourceMetadata: {
                ...mapped.sourceMetadata,
                contentHash: sourceExternalId,
              },
            },
          });

          report.created++;
        } catch (error) {
          report.parseFailures++;
          pushFailure(report.failures, {
            split,
            rowIndex,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }

    console.log(JSON.stringify(report, null, 2));
  }
}

function parseArgs(argv: string[]): CliOptions {
  let source = "";
  let split = "dev";
  let dryRun = false;
  let limit: number | null = null;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === "--source") {
      source = argv[++index] ?? "";
      continue;
    }

    if (arg === "--split") {
      split = argv[++index] ?? "dev";
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--limit") {
      const raw = argv[++index];
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value: ${raw}`);
      }
      limit = parsed;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!source) {
    printUsage();
    throw new Error("--source is required");
  }

  return { source, split, dryRun, limit };
}

function resolveSources(sourceArg: string): OpenQuestionSourceAdapter[] {
  if (sourceArg === "all") {
    return APPROVED_OPEN_SOURCES;
  }

  const source = getApprovedSource(sourceArg);
  if (!source) {
    throw new Error(
      `Unknown source "${sourceArg}". Approved sources: ${APPROVED_OPEN_SOURCES.map((item) => item.slug).join(", ")}`
    );
  }

  return [source];
}

function resolveSplits(
  source: OpenQuestionSourceAdapter,
  splitArg: string
): SourceSplit[] {
  if (splitArg === "all") {
    return source.listSplits();
  }

  const allowed = new Set(source.listSplits());
  const requested = splitArg
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean) as SourceSplit[];

  if (requested.length === 0) {
    return ["dev"];
  }

  for (const split of requested) {
    if (!allowed.has(split)) {
      throw new Error(
        `Invalid split "${split}" for ${source.slug}. Allowed: ${[...allowed].join(", ")}`
      );
    }
  }

  return requested;
}

function assertRedistributable(source: OpenQuestionSourceAdapter) {
  if (!source.license || !source.redistributable) {
    throw new Error(
      `Source "${source.slug}" is blocked because it is not explicitly redistributable`
    );
  }
}

async function loadTopicMap(): Promise<Map<string, string>> {
  const topics = await prisma.topic.findMany({
    where: { section: Section.QUANTITATIVE_REASONING },
    select: { id: true, name: true, section: true },
  });

  return new Map(topics.map((topic) => [`${topic.section}:${topic.name}`, topic.id]));
}

function ensureSourceExternalId(record: OpenQuestionRecord): string {
  if (record.sourceExternalId) {
    return record.sourceExternalId;
  }

  const hash = createHash("sha256");
  hash.update(record.stem);
  hash.update("||");
  hash.update(JSON.stringify(record.options));
  return hash.digest("hex");
}

function pushFailure(
  failures: ImportFailureSample[],
  failure: ImportFailureSample
) {
  if (failures.length < 20) {
    failures.push(failure);
  }
}

function printUsage() {
  console.log(
    [
      "Usage: npx tsx scripts/import-open.ts --source <slug|all> [--split <dev|test|train|all>] [--dry-run] [--limit N]",
      `Approved sources: ${APPROVED_OPEN_SOURCES.map((source) => source.slug).join(", ")}`,
    ].join("\n")
  );
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Unexpected import-open failure"
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
