import { aquaRatSource } from "./aqua-rat";
import type { OpenQuestionSourceAdapter } from "./types";

export const APPROVED_OPEN_SOURCES: OpenQuestionSourceAdapter[] = [aquaRatSource];

export function getApprovedSource(
  slug: string
): OpenQuestionSourceAdapter | undefined {
  return APPROVED_OPEN_SOURCES.find((source) => source.slug === slug);
}
