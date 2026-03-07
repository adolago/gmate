import {
  Difficulty,
  QuestionType,
  Section,
} from "../../src/generated/prisma/client";

export type SourceSplit = "train" | "dev" | "test";

export interface TopicMappingResult {
  topicName: string | null;
  confidence: number;
  matchedKeywords: string[];
}

export type TopicClassification = TopicMappingResult;

export interface OpenQuestionRecord {
  section: Section;
  questionType: QuestionType;
  subsection: string;
  difficulty: Difficulty;
  stem: string;
  passage?: string | null;
  options: { label: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  tags: string[];
  topicName: string | null;
  topicMapping: TopicMappingResult;
  sourceExternalId?: string;
  sourceUrl?: string;
  sourceMetadata?: Record<string, unknown>;
}

export type MappedQuestionRecord = OpenQuestionRecord;

export interface FetchedSplit {
  split: SourceSplit;
  usedUrl: string;
  records: unknown[];
  resolvedVia?: "primary" | "mirror";
}

export type SourceFetchResult = FetchedSplit;

export interface ImportedRecordContext {
  split: SourceSplit;
  rowIndex: number;
  sourceUrl: string;
  resolvedVia?: "primary" | "mirror";
}

export type RecordContext = ImportedRecordContext;

export interface ImportFailureSample {
  split: SourceSplit;
  rowIndex: number;
  reason: string;
}

export interface ImportReport {
  source: string;
  splits: SourceSplit[];
  dryRun: boolean;
  limit: number | null;
  seen: number;
  wouldCreate: number;
  created: number;
  skippedExisting: number;
  rejected: number;
  parseFailures: number;
  topicMapped: number;
  topicUnmapped: number;
  failures: ImportFailureSample[];
}

export interface OpenQuestionSourceAdapter {
  slug: string;
  displayName: string;
  homepageUrl: string;
  license: string;
  redistributable: boolean;
  notes?: string;
  listSplits(): SourceSplit[];
  fetchSplit(split: SourceSplit): Promise<FetchedSplit>;
  mapRecord(raw: unknown, context: ImportedRecordContext): OpenQuestionRecord;
  validate(record: OpenQuestionRecord): string[];
}
