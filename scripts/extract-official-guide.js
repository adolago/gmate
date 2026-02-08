/**
 * GMAT Official Guide — Question Extractor
 *
 * Paste this entire script into Chrome DevTools console while on:
 *   https://gmatofficialpractice.mba.com
 *
 * Prerequisites:
 *   1. Purchase the GMAT Official Guide 2025-2026 Online Question Bank
 *   2. Log in at gmatofficialpractice.mba.com
 *   3. Navigate to Practice Questions → create a custom quiz with ALL questions
 *      for a given section (e.g., all Quantitative Reasoning questions)
 *   4. Start the quiz so a question is visible on screen
 *   5. Open DevTools (F12) → Console → paste this script → press Enter
 *
 * The script will:
 *   - Extract the current question (stem, options, code)
 *   - Click an answer to reveal the correct answer + explanation
 *   - Record the correct answer and explanation
 *   - Navigate to next question
 *   - Repeat until all questions in the quiz are done
 *   - Download the result as a JSON file matching official-questions.json format
 *
 * Output: Downloads a .json file you place at data/official-questions.json
 *         Then run: npx tsx scripts/import-official.ts
 *
 * ─────────────────────────────────────────────────
 * IMPORTANT: This script is for personal use with your purchased content.
 * The extracted data file (official-questions.json) is gitignored.
 * ─────────────────────────────────────────────────
 */

(async function GMATE_Extractor() {
  "use strict";

  // ── Configuration ──────────────────────────────
  const CONFIG = {
    // Delay between actions (ms) — increase if the site is slow
    actionDelay: 1500,
    // Delay after clicking answer before reading result
    answerRevealDelay: 2500,
    // Delay after clicking "Next" before reading new question
    nextQuestionDelay: 2000,
    // Maximum questions to extract (safety limit). Set to Infinity for all.
    maxQuestions: Infinity,
    // If true, logs verbose output to console
    verbose: true,
  };

  // ── GMAT Focus Section Mapping ─────────────────
  // The platform organizes by study plan sections. Map them to our schema.
  // Adjust these if the platform labels differ from what you see.
  const SECTION_MAP = {
    // Quantitative Reasoning
    "problem solving": {
      section: "QUANTITATIVE_REASONING",
      questionType: "PROBLEM_SOLVING",
      subsection: "Problem Solving",
    },
    "quantitative reasoning": {
      section: "QUANTITATIVE_REASONING",
      questionType: "PROBLEM_SOLVING",
      subsection: "Problem Solving",
    },
    // Data Insights
    "data sufficiency": {
      section: "DATA_INSIGHTS",
      questionType: "DATA_SUFFICIENCY",
      subsection: "Data Sufficiency",
    },
    "multi-source reasoning": {
      section: "DATA_INSIGHTS",
      questionType: "MULTI_SOURCE_REASONING",
      subsection: "Multi-Source Reasoning",
    },
    "table analysis": {
      section: "DATA_INSIGHTS",
      questionType: "TABLE_ANALYSIS",
      subsection: "Table Analysis",
    },
    "graphics interpretation": {
      section: "DATA_INSIGHTS",
      questionType: "GRAPHICS_INTERPRETATION",
      subsection: "Graphics Interpretation",
    },
    "two-part analysis": {
      section: "DATA_INSIGHTS",
      questionType: "TWO_PART_ANALYSIS",
      subsection: "Two-Part Analysis",
    },
    // Verbal Reasoning
    "reading comprehension": {
      section: "VERBAL_REASONING",
      questionType: "READING_COMPREHENSION",
      subsection: "Reading Comprehension",
    },
    "critical reasoning": {
      section: "VERBAL_REASONING",
      questionType: "CRITICAL_REASONING",
      subsection: "Critical Reasoning",
    },
  };

  // ── Utilities ──────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function log(...args) {
    if (CONFIG.verbose) console.log("[GMATE]", ...args);
  }

  function warn(...args) {
    console.warn("[GMATE]", ...args);
  }

  /** Clean text: normalize whitespace, trim */
  function clean(text) {
    return (text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Download JSON as a file */
  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── DOM Selectors ──────────────────────────────
  // These selectors were discovered by inspecting the GMAT Official Practice
  // app DOM. If the site updates its structure, adjust these.

  const SEL = {
    // Question container
    questionContainer: "div.question-container",
    // Question ID/code (e.g. "2SK1G4")
    questionCode: "p.e_id",
    // Question stem — paragraphs inside the container (after the code)
    // We extract all <p> that aren't the e_id
    stemParagraphs: "div.question-container p:not(.e_id)",
    // Answer options list
    optionsList: "ul.question-choices-multi",
    // Individual option items
    optionItem: "ul.question-choices-multi > li",
    // Choice letter indicator (has data-choice="A", "B", etc.)
    choiceLetter: "div.multi-choice",
    // Choice text content
    choiceContent: "div.choice-content",
    // Passage text (for RC questions)
    passage: "div.passage-content, div.stimulus-content, div.passage",

    // ── Post-answer selectors ──
    // These appear after submitting an answer. Verify/adjust with your copy.

    // The correct answer indicator — usually a green-highlighted choice
    // or an explicit "Correct Answer: X" element
    correctAnswerBadge: ".correct-answer, .answer-correct, [class*='correct']",
    // The correct option will typically get a "correct" class
    correctOption: "li.correct, li[class*='correct'], div.multi-choice.correct",
    // Explanation text container
    explanationContainer:
      "div.explanation, div.answer-explanation, div.rationale, [class*='explanation'], [class*='rationale']",
    // Submit / Check answer button
    submitButton:
      "button.check-answer, button.submit-answer, button[class*='submit'], button[class*='check'], .check-answer-btn, .submit-btn",
    // Next question button
    nextButton:
      "button.next-question, button[class*='next'], .next-btn, a.next-question",

    // ── Fallback: generic button search ──
    allButtons: "button, a.btn, [role='button']",
  };

  // ── Extraction Functions ───────────────────────

  /**
   * Extract question data from the currently visible question DOM.
   * Returns null if no question is found.
   */
  function extractCurrentQuestion() {
    const container = document.querySelector(SEL.questionContainer);
    if (!container) {
      warn("No question container found on page");
      return null;
    }

    // Question code
    const codeEl = container.querySelector("p.e_id");
    const questionCode = codeEl ? clean(codeEl.textContent) : null;

    // Stem — all paragraph text that isn't the question code
    const stemEls = container.querySelectorAll("p");
    const stemParts = [];
    for (const p of stemEls) {
      if (p.classList.contains("e_id")) continue;
      const text = clean(p.textContent);
      if (text) stemParts.push(text);
    }
    const stem = stemParts.join("\n\n");

    // Options
    const optionEls = document.querySelectorAll(SEL.optionItem);
    const options = [];
    for (const li of optionEls) {
      const choiceDiv = li.querySelector(SEL.choiceLetter);
      const contentDiv = li.querySelector(SEL.choiceContent);
      const label = choiceDiv
        ? choiceDiv.getAttribute("data-choice") || ""
        : "";
      const text = contentDiv ? clean(contentDiv.textContent) : clean(li.textContent);
      if (label && text) {
        options.push({ label: label.toUpperCase(), text });
      }
    }

    // Passage (for RC questions)
    const passageEl = document.querySelector(SEL.passage);
    const passage = passageEl ? clean(passageEl.textContent) : null;

    // Data-id from container
    const dataId = container.getAttribute("data-id");

    return {
      questionCode,
      dataId,
      stem,
      options,
      passage,
    };
  }

  /**
   * Click the first available answer option to trigger answer reveal.
   * We click "A" by default — the answer is recorded from the reveal.
   */
  function clickFirstOption() {
    const firstOption = document.querySelector(
      SEL.optionItem + ":first-child"
    );
    if (firstOption) {
      firstOption.click();
      log("Clicked first option");
      return true;
    }
    // Fallback: click any multi-choice div
    const choice = document.querySelector(SEL.choiceLetter);
    if (choice) {
      choice.click();
      log("Clicked choice div");
      return true;
    }
    warn("Could not find an option to click");
    return false;
  }

  /**
   * Find and click the submit/check answer button.
   */
  function clickSubmit() {
    // Try specific selectors first
    const submitBtn = document.querySelector(SEL.submitButton);
    if (submitBtn) {
      submitBtn.click();
      log("Clicked submit button");
      return true;
    }
    // Fallback: search all buttons for submit-like text
    const buttons = document.querySelectorAll(SEL.allButtons);
    for (const btn of buttons) {
      const text = (btn.textContent || "").toLowerCase().trim();
      if (
        text.includes("check") ||
        text.includes("submit") ||
        text.includes("confirm")
      ) {
        btn.click();
        log("Clicked button:", text);
        return true;
      }
    }
    warn("Could not find submit button");
    return false;
  }

  /**
   * After answer submission, extract the correct answer and explanation.
   */
  function extractAnswerResult() {
    let correctAnswer = null;
    let explanation = null;

    // Strategy 1: Look for an option marked as correct
    const correctEl = document.querySelector(SEL.correctOption);
    if (correctEl) {
      const choiceDiv =
        correctEl.querySelector(SEL.choiceLetter) || correctEl;
      correctAnswer =
        choiceDiv.getAttribute("data-choice") || correctEl.getAttribute("data-choice");
      if (correctAnswer) correctAnswer = correctAnswer.toUpperCase();
    }

    // Strategy 2: Look for correct-answer badge text
    if (!correctAnswer) {
      const badge = document.querySelector(SEL.correctAnswerBadge);
      if (badge) {
        const text = clean(badge.textContent);
        // Look for single letter A-E
        const match = text.match(/\b([A-E])\b/);
        if (match) correctAnswer = match[1];
      }
    }

    // Strategy 3: Scan all options for a "correct" class or green styling
    if (!correctAnswer) {
      const allOptions = document.querySelectorAll(SEL.optionItem);
      for (const li of allOptions) {
        const cls = li.className || "";
        const childCls = (li.querySelector(SEL.choiceLetter)?.className) || "";
        if (
          cls.includes("correct") ||
          childCls.includes("correct") ||
          cls.includes("right") ||
          childCls.includes("right")
        ) {
          const choiceDiv = li.querySelector(SEL.choiceLetter);
          correctAnswer = choiceDiv?.getAttribute("data-choice")?.toUpperCase();
          break;
        }
      }
    }

    // Explanation
    const explEl = document.querySelector(SEL.explanationContainer);
    if (explEl) {
      explanation = clean(explEl.textContent);
    }

    // Fallback: look for any new text block that appeared (explanation area)
    if (!explanation) {
      const candidates = document.querySelectorAll(
        "[class*='explain'], [class*='solution'], [class*='rationale'], [class*='feedback']"
      );
      for (const el of candidates) {
        const text = clean(el.textContent);
        if (text.length > 30) {
          explanation = text;
          break;
        }
      }
    }

    return { correctAnswer, explanation };
  }

  /**
   * Click the "Next" button to advance to the next question.
   */
  function clickNext() {
    const nextBtn = document.querySelector(SEL.nextButton);
    if (nextBtn) {
      nextBtn.click();
      log("Clicked next button");
      return true;
    }
    // Fallback: button text search
    const buttons = document.querySelectorAll(SEL.allButtons);
    for (const btn of buttons) {
      const text = (btn.textContent || "").toLowerCase().trim();
      if (text.includes("next") || text === "→" || text === ">") {
        btn.click();
        log("Clicked next:", text);
        return true;
      }
    }
    warn("Could not find next button");
    return false;
  }

  /**
   * Detect the section type from the page context.
   * Tries: URL hash, page headings, BPApp state.
   */
  function detectSectionType() {
    // Try URL hash
    const hash = window.location.hash.toLowerCase();

    // Try BPApp state
    const activeSection =
      window.BPApp?.state?.attributes?.active_section || "";
    const activeSub =
      window.BPApp?.state?.attributes?.active_sub_section || "";

    // Try page headings
    const headings = document.querySelectorAll("h1, h2, h3, .section-title, .quiz-title");
    let headingText = "";
    for (const h of headings) {
      headingText += " " + (h.textContent || "").toLowerCase();
    }

    const combined = `${hash} ${activeSection} ${activeSub} ${headingText}`.toLowerCase();

    for (const [keyword, mapping] of Object.entries(SECTION_MAP)) {
      if (combined.includes(keyword)) {
        return mapping;
      }
    }

    // Default fallback
    return {
      section: "QUANTITATIVE_REASONING",
      questionType: "PROBLEM_SOLVING",
      subsection: "Problem Solving",
    };
  }

  /**
   * Estimate difficulty from question length (same heuristic as import-gmatclub.ts).
   */
  function estimateDifficulty(stem) {
    const wordCount = stem.split(/\s+/).length;
    if (wordCount > 80) return "HARD";
    if (wordCount > 40) return "MEDIUM";
    return "EASY";
  }

  /**
   * Check if we've reached the end of the quiz.
   */
  function isQuizComplete() {
    // Look for end-of-quiz indicators
    const page = document.body.textContent || "";
    const indicators = [
      "quiz complete",
      "quiz finished",
      "all questions answered",
      "review results",
      "score report",
      "quiz summary",
    ];
    const lower = page.toLowerCase();
    for (const indicator of indicators) {
      if (lower.includes(indicator)) return true;
    }
    // No question container visible
    if (!document.querySelector(SEL.questionContainer)) return true;
    return false;
  }

  // ── Main Extraction Loop ───────────────────────

  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║   GMATE — Official Guide Question Extractor  ║");
  console.log("╚═══════════════════════════════════════════════╝");
  console.log("");

  const sectionMapping = detectSectionType();
  log("Detected section:", sectionMapping.section, "/", sectionMapping.questionType);

  const collected = [];
  let questionIndex = 0;

  while (questionIndex < CONFIG.maxQuestions) {
    log(`\n── Question ${questionIndex + 1} ──`);

    // Wait for question to load
    await sleep(CONFIG.actionDelay);

    // Check if quiz is done
    if (isQuizComplete()) {
      log("Quiz appears complete. Stopping.");
      break;
    }

    // 1. Extract question data
    const qData = extractCurrentQuestion();
    if (!qData || !qData.stem) {
      warn("Could not extract question. Stopping.");
      break;
    }
    log("Code:", qData.questionCode, "| Stem:", qData.stem.slice(0, 60) + "...");
    log("Options:", qData.options.length);

    // 2. Click an answer to submit
    const clicked = clickFirstOption();
    if (!clicked) {
      warn("Could not click an option. Stopping.");
      break;
    }
    await sleep(500);

    // 3. Submit the answer
    const submitted = clickSubmit();
    if (submitted) {
      await sleep(CONFIG.answerRevealDelay);
    } else {
      // Some quiz modes auto-submit on option click
      await sleep(CONFIG.answerRevealDelay);
    }

    // 4. Extract correct answer + explanation
    const result = extractAnswerResult();
    log("Correct:", result.correctAnswer, "| Explanation length:", result.explanation?.length || 0);

    // 5. Build the question object
    const question = {
      section: sectionMapping.section,
      questionType: sectionMapping.questionType,
      subsection: sectionMapping.subsection,
      difficulty: estimateDifficulty(qData.stem),
      stem: qData.stem,
      ...(qData.passage ? { passage: qData.passage } : {}),
      options: qData.options,
      correctAnswer: result.correctAnswer || "A",
      explanation: result.explanation || "No explanation extracted.",
      tags: ["official-guide", sectionMapping.questionType.toLowerCase().replace(/_/g, "-")],
    };

    collected.push(question);
    log(`Collected ${collected.length} questions so far`);

    // 6. Navigate to next question
    await sleep(500);
    const nextClicked = clickNext();
    if (!nextClicked) {
      log("No next button — might be the last question.");
      break;
    }
    await sleep(CONFIG.nextQuestionDelay);

    questionIndex++;
  }

  // ── Download Results ───────────────────────────
  console.log("");
  console.log("═══════════════════════════════════════════════");
  console.log(`Extraction complete! Collected ${collected.length} questions.`);
  console.log("═══════════════════════════════════════════════");

  if (collected.length > 0) {
    const filename = `official-questions-${sectionMapping.section.toLowerCase()}-${Date.now()}.json`;
    downloadJSON(collected, filename);
    console.log(`Downloaded: ${filename}`);
    console.log("");
    console.log("Next steps:");
    console.log("1. Move the downloaded file to: data/official-questions.json");
    console.log("   (merge with any existing data if extracting multiple sections)");
    console.log("2. Run: npx tsx scripts/import-official.ts");
  }

  // Also store in window for inspection
  window.__GMATE_EXTRACTED = collected;
  console.log("Data also available at: window.__GMATE_EXTRACTED");

  return collected;
})();
