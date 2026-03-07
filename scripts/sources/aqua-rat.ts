import { createHash } from "node:crypto";
import { Difficulty, QuestionType, Section } from "../../src/generated/prisma/client";
import { mapQuantTopic } from "./topic-mapper";
import { normalizeImportedText, normalizeOptionText } from "./text-normalization";
import type {
  FetchedSplit,
  ImportedRecordContext,
  OpenQuestionRecord,
  OpenQuestionSourceAdapter,
  SourceSplit,
} from "./types";

type AquaRecord = {
  question?: unknown;
  options?: unknown;
  rationale?: unknown;
  correct?: unknown;
};

const PRIMARY_BASE_URL =
  "https://raw.githubusercontent.com/google-deepmind/AQuA/master";
const MIRROR_BASE_URL =
  "https://huggingface.co/datasets/mathewhe/aqua_rat/resolve/main/data";
const OPTION_LABELS = ["A", "B", "C", "D", "E"];

export const aquaRatSource: OpenQuestionSourceAdapter = {
  slug: "aqua-rat",
  displayName: "AQuA-RAT",
  homepageUrl: "https://github.com/google-deepmind/AQuA",
  license: "Apache-2.0",
  redistributable: true,
  notes:
    "Crowdsourced algebra word problems with rationales. Use as GMAT-like quantitative seed content, not as official GMAT material.",
  listSplits() {
    return ["train", "dev", "test"];
  },
  async fetchSplit(split: SourceSplit): Promise<FetchedSplit> {
    const candidates = [
      `${PRIMARY_BASE_URL}/${split}.json`,
      `${MIRROR_BASE_URL}/${split}.json`,
    ];

    for (const url of candidates) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const payload = await response.text();
        return {
          split,
          usedUrl: url,
          records: parseDatasetPayload(payload),
        };
      } catch {
        // Try the next URL.
      }
    }

    throw new Error(`Unable to fetch ${split} split from AQuA-RAT sources`);
  },
  mapRecord(raw: unknown, context: ImportedRecordContext): OpenQuestionRecord {
    const record = raw as AquaRecord;
    const question = cleanText(asRequiredString(record.question, "question"));
    const rationale = cleanText(asRequiredString(record.rationale, "rationale"));
    const correctAnswer = parseCorrectAnswer(record.correct);
    const options = parseOptions(record.options);
    const topicMapping = mapQuantTopic(`${question}\n${rationale}`);
    const difficulty = estimateDifficulty(question, rationale);
    const sourceExternalId = buildAquaSourceExternalId(question, options, correctAnswer);

    return {
      section: Section.QUANTITATIVE_REASONING,
      questionType: QuestionType.PROBLEM_SOLVING,
      subsection: topicMapping.topicName ?? "Problem Solving",
      difficulty,
      stem: question,
      passage: null,
      options,
      correctAnswer,
      explanation: rationale,
      tags: ["aqua-rat", "open-license", "non-official", "gmat-like"],
      topicName: topicMapping.topicName,
      topicMapping,
      sourceExternalId,
      sourceUrl: context.sourceUrl,
      sourceMetadata: {
        split: context.split,
        rowIndex: context.rowIndex,
        topicConfidence: topicMapping.confidence,
        matchedKeywords: topicMapping.matchedKeywords,
        dataset: "AQuA-RAT",
        license: "Apache-2.0",
      },
    };
  },
  validate(record: OpenQuestionRecord): string[] {
    const errors: string[] = [];

    if (record.options.length !== OPTION_LABELS.length) {
      errors.push("expected exactly 5 options");
    }

    if (!OPTION_LABELS.includes(record.correctAnswer)) {
      errors.push("correctAnswer must be one of A-E");
    }

    if (!record.explanation.trim()) {
      errors.push("explanation is empty");
    }

    if (!record.stem.trim()) {
      errors.push("stem is empty");
    }

    return errors;
  },
};

function parseDatasetPayload(payload: string): unknown[] {
  const trimmed = payload.trim();

  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error("Expected dataset payload to be a JSON array");
    }
    return parsed;
  }

  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseOptions(options: unknown): { label: string; text: string }[] {
  if (!Array.isArray(options)) {
    throw new Error("options must be an array");
  }

  const parsed = options.slice(0, OPTION_LABELS.length).map((value, index) => {
    const label = OPTION_LABELS[index];
    const text = cleanText(asRequiredString(value, `options[${index}]`)).replace(
      /^[A-E][\)\.\:]?\s*/i,
      ""
    );

    return { label, text };
  });

  if (parsed.length !== OPTION_LABELS.length || parsed.some((option) => !option.text)) {
    throw new Error("invalid options payload");
  }

  return normalizeOptionText(parsed);
}

function parseCorrectAnswer(value: unknown): string {
  const raw = asRequiredString(value, "correct").trim().toUpperCase();
  const match = raw.match(/[A-E]/);

  if (!match) {
    throw new Error(`invalid correct answer value: ${raw}`);
  }

  return match[0];
}

function estimateDifficulty(question: string, rationale: string): Difficulty {
  const wordCount = countWords(question);
  const rationaleLineCount = rationale
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length;

  if (wordCount >= 45 || rationaleLineCount >= 5) {
    return Difficulty.HARD;
  }

  if (wordCount >= 22 || rationaleLineCount >= 3) {
    return Difficulty.MEDIUM;
  }

  return Difficulty.EASY;
}

function cleanText(value: string): string {
  return normalizeImportedText(value);
}

function countWords(value: string): number {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function asRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return value;
}

function hashContent(parts: string[]): string {
  const hash = createHash("sha256");
  hash.update(parts.join("||"));
  return hash.digest("hex");
}

export function buildAquaSourceExternalId(
  question: string,
  options: { label: string; text: string }[],
  correctAnswer: string
): string {
  return hashContent([
    question,
    ...options.map((option) => `${option.label}:${option.text}`),
    correctAnswer,
  ]);
}
