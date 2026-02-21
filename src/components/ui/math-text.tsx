"use client";

import { useMemo } from "react";
import katex from "katex";

/**
 * Renders text that may contain LaTeX math delimiters.
 * - $$...$$ for display (block) math
 * - $...$ for inline math
 * Non-math text is rendered as-is with whitespace preserved.
 */
export function MathText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const html = useMemo(() => renderMathInText(children), [children]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Split text on $$...$$ and $...$ delimiters, render math segments with KaTeX
function renderMathInText(text: string): string {
  // Match $$...$$ (display) first, then $...$ (inline)
  // Uses a regex that captures the delimiter type and content
  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Try display math first: $$...$$
    const displayMatch = remaining.match(/\$\$([\s\S]+?)\$\$/);
    // Try inline math: $...$  (not preceded/followed by $)
    const inlineMatch = remaining.match(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/);

    if (!displayMatch && !inlineMatch) {
      parts.push(escapeHtml(remaining));
      break;
    }

    // Pick whichever comes first in the string
    const displayIdx = displayMatch ? remaining.indexOf(displayMatch[0]) : Infinity;
    const inlineIdx = inlineMatch ? remaining.indexOf(inlineMatch[0]) : Infinity;

    if (displayIdx <= inlineIdx && displayMatch) {
      // Add text before the match
      if (displayIdx > 0) {
        parts.push(escapeHtml(remaining.slice(0, displayIdx)));
      }
      // Render display math
      try {
        parts.push(
          katex.renderToString(displayMatch[1], {
            displayMode: true,
            throwOnError: false,
            output: "htmlAndMathml",
          })
        );
      } catch {
        parts.push(escapeHtml(displayMatch[0]));
      }
      remaining = remaining.slice(displayIdx + displayMatch[0].length);
    } else if (inlineMatch) {
      // Add text before the match
      if (inlineIdx > 0) {
        parts.push(escapeHtml(remaining.slice(0, inlineIdx)));
      }
      // Render inline math
      try {
        parts.push(
          katex.renderToString(inlineMatch[1], {
            displayMode: false,
            throwOnError: false,
            output: "htmlAndMathml",
          })
        );
      } catch {
        parts.push(escapeHtml(inlineMatch[0]));
      }
      remaining = remaining.slice(inlineIdx + inlineMatch[0].length);
    }
  }

  return parts.join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br />");
}
