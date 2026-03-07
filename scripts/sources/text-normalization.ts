const SUSPICIOUS_MOJIBAKE_PATTERN = /(Ã.|Â.|â.|Î.|Ï.|Ð.|Ñ.)/g;
const CP1252_REVERSE_MAP = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

export function normalizeImportedText(value: string): string {
  const cleaned = value.replace(/\r\n/g, "\n").trim();
  const suspiciousCount = countSuspiciousSequences(cleaned);

  if (suspiciousCount === 0) {
    return cleaned;
  }

  const candidates = [
    cleaned,
    decodeCp1252Mojibake(cleaned)?.trim(),
    repairMojibakeSegments(cleaned).trim(),
  ].filter((candidate): candidate is string => Boolean(candidate));

  let bestCandidate = cleaned;

  for (const candidate of candidates) {
    if (candidate.includes("\uFFFD")) {
      continue;
    }

    if (countSuspiciousSequences(candidate) < countSuspiciousSequences(bestCandidate)) {
      bestCandidate = candidate;
    }
  }

  return applyTargetedFixes(bestCandidate);
}

export function normalizeOptionText(
  options: { label: string; text: string }[]
): { label: string; text: string }[] {
  return options.map((option) => ({
    ...option,
    text: normalizeImportedText(option.text),
  }));
}

export function countSuspiciousSequences(value: string): number {
  return value.match(SUSPICIOUS_MOJIBAKE_PATTERN)?.length ?? 0;
}

function decodeCp1252Mojibake(value: string): string | null {
  const bytes: number[] = [];

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      return null;
    }

    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }

    const mapped = CP1252_REVERSE_MAP.get(codePoint);
    if (mapped === undefined) {
      return null;
    }

    bytes.push(mapped);
  }

  return Buffer.from(bytes).toString("utf8");
}

function repairMojibakeSegments(value: string): string {
  const characters = [...value];
  let index = 0;
  let repaired = "";

  while (index < characters.length) {
    const current = characters[index];
    const segmentLengths = current === "â" ? [3, 2] : [2];
    let replaced = false;

    for (const length of segmentLengths) {
      const segment = characters.slice(index, index + length).join("");
      if (segment.length < length) {
        continue;
      }

      const decoded = decodeCp1252Mojibake(segment);
      if (!decoded || decoded.includes("\uFFFD")) {
        continue;
      }

      if (countSuspiciousSequences(decoded) >= countSuspiciousSequences(segment)) {
        continue;
      }

      repaired += decoded;
      index += length;
      replaced = true;
      break;
    }

    if (!replaced) {
      repaired += current;
      index++;
    }
  }

  return repaired;
}

function applyTargetedFixes(value: string): string {
  return value
    .replace(/Ânswer/g, "Answer")
    .replace(/\b([A-Za-z]+)âs\b/g, "$1's")
    .replace(/Đây/g, "Day")
    .replace(/\b[ÐĐD]ây\b/g, "Day")
    .replace(/\bDày\b/g, "Day")
    .replace(/í\.ẹ\./g, "i.e.")
    .replace(/Â /g, "")
    .replace(/âˆ′/g, "−")
    .replace(/Ã =/g, "θ =")
    .replace(/â´/g, "4")
    .replace(/âµ/g, "5")
    .replace(/â¶/g, "6")
    .replace(/Câ‚/g, "C₁")
    .replace(
      /(r1:\s*r2\s*=\s*\d+\s*:\s*\d+)\s+Î\s+r1\^2:\s*Î\s+r2\^2/gi,
      "$1 => r1^2:r2^2"
    )
    .replace(/([0-9])Î\s+/g, "$1π ");
}
