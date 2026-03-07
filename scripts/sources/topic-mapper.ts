import type { TopicMappingResult } from "./types";

type TopicRule = {
  topicName: string;
  keywords: string[];
  specificity: number;
};

const QUANT_TOPIC_NAMES = new Set([
  "Arithmetic",
  "Number Properties",
  "Algebra",
  "Ratios & Proportions",
  "Word Problems",
  "Geometry",
  "Statistics & Counting",
]);

const TOPIC_RULES: TopicRule[] = [
  {
    topicName: "Statistics & Counting",
    specificity: 0.6,
    keywords: [
      "probability",
      "permutation",
      "permutations",
      "combination",
      "combinations",
      "mean",
      "median",
      "mode",
      "average",
      "standard deviation",
      "arrange",
      "arrangements",
      "committee",
      "sample space",
      "outcomes",
      "ways",
      "odds",
      "arithmetic mean",
      "poll",
      "survey",
      "responded",
    ],
  },
  {
    topicName: "Geometry",
    specificity: 0.55,
    keywords: [
      "triangle",
      "triangles",
      "circle",
      "circles",
      "radius",
      "diameter",
      "perimeter",
      "area",
      "volume",
      "rectangle",
      "square",
      "polygon",
      "line segment",
      "coordinate plane",
      "xy coordinate plane",
      "xy coordinate",
      "coordinate",
      "slope",
      "angle",
      "angles",
      "rectangular",
      "vertex",
      "vertices",
    ],
  },
  {
    topicName: "Number Properties",
    specificity: 0.5,
    keywords: [
      "prime",
      "primes",
      "factor",
      "factors",
      "multiple",
      "multiples",
      "divisible",
      "divisibility",
      "remainder",
      "odd",
      "even",
      "integer",
      "integers",
      "consecutive",
      "least common multiple",
      "greatest common factor",
    ],
  },
  {
    topicName: "Ratios & Proportions",
    specificity: 0.45,
    keywords: [
      "ratio",
      "ratios",
      "proportion",
      "proportions",
      "rate",
      "rates",
      "percent",
      "percentage",
      "percentages",
      "concentration",
      "salt concentration",
      "mixture",
      "mixtures",
      "markup",
      "discount",
      "interest",
      "share",
      "scale",
      "tax",
      "taxes",
      "invested",
      "gain percent",
    ],
  },
  {
    topicName: "Word Problems",
    specificity: 0.2,
    keywords: [
      "distance",
      "speed",
      "time",
      "work",
      "tank",
      "pipe",
      "profit",
      "loss",
      "cost",
      "price",
      "prices",
      "paid",
      "pay",
      "remaining",
      "left with",
      "ages",
      "train",
      "trains",
      "journey",
      "travels",
      "traveled",
      "mile",
      "miles",
      "meter",
      "meters",
      "kilometer",
      "kilometers",
      "litre",
      "litres",
      "liter",
      "liters",
      "minute",
      "minutes",
      "hour",
      "hours",
      "passenger",
      "passengers",
      "ticket",
      "hotel",
      "cloth",
      "brick",
      "bricks",
      "sold",
      "buys",
    ],
  },
  {
    topicName: "Algebra",
    specificity: 0.4,
    keywords: [
      "equation",
      "equations",
      "inequality",
      "inequalities",
      "variable",
      "variables",
      "expression",
      "expressions",
      "polynomial",
      "quadratic",
      "linear",
      "system of equations",
      "value of x",
      "value of y",
      "solve for",
    ],
  },
  {
    topicName: "Arithmetic",
    specificity: 0.1,
    keywords: [
      "fraction",
      "fractions",
      "decimal",
      "decimals",
      "sum",
      "product",
      "quotient",
      "difference",
      "digit",
      "digits",
      "units digit",
      "tens digit",
    ],
  },
];

const WORD_PROBLEM_CONTEXT_KEYWORDS = [
  "car",
  "ship",
  "plane",
  "company",
  "fund",
  "hotel",
  "trip",
  "travel",
  "cost",
  "costs",
  "price",
  "prices",
  "profit",
  "loss",
  "commission",
  "apples",
  "dentists",
  "votes",
  "elections",
];

export function mapQuantTopic(text: string): TopicMappingResult {
  const normalized = normalizeForSearch(text);
  const scores = TOPIC_RULES.map((rule) => {
    const matchedKeywords = rule.keywords.filter((keyword) =>
      matchesKeyword(normalized, keyword)
    );

    return {
      topicName: rule.topicName,
      score: matchedKeywords.length + (matchedKeywords.length > 0 ? rule.specificity : 0),
      rawScore: matchedKeywords.length,
      matchedKeywords,
    };
  }).sort((a, b) => b.score - a.score);

  const top = scores[0];
  const second = scores[1];

  if (!top || !QUANT_TOPIC_NAMES.has(top.topicName)) {
    return { topicName: null, confidence: 0, matchedKeywords: [] };
  }

  if (top.rawScore < 1) {
    const fallbackMatches = WORD_PROBLEM_CONTEXT_KEYWORDS.filter((keyword) =>
      matchesKeyword(normalized, keyword)
    );

    if (fallbackMatches.length > 0) {
      return {
        topicName: "Word Problems",
        confidence: 0.35,
        matchedKeywords: fallbackMatches,
      };
    }

    return { topicName: null, confidence: 0, matchedKeywords: [] };
  }

  if (second && top.score === second.score) {
    return { topicName: null, confidence: 0, matchedKeywords: top.matchedKeywords };
  }

  const confidence = Math.min(1, 0.35 + top.rawScore * 0.15);

  return {
    topicName: top.topicName,
    confidence,
    matchedKeywords: top.matchedKeywords,
  };
}

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeyword(text: string, keyword: string): boolean {
  const paddedText = ` ${text} `;
  const paddedKeyword = ` ${keyword.toLowerCase()} `;
  return paddedText.includes(paddedKeyword);
}
