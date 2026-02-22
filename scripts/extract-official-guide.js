/**
 * GMAT Official Guide — Question Extractor v2
 *
 * Paste this entire script into Chrome DevTools console while on:
 *   https://gmatofficialpractice.mba.com
 *
 * Prerequisites:
 *   1. Purchase the GMAT Official Guide 2025-2026 Online Question Bank
 *   2. Log in at gmatofficialpractice.mba.com
 *   3. Navigate to Practice Questions → create a custom quiz with ALL questions
 *   4. Start the quiz so a question is visible on screen
 *   5. Open DevTools (F12) → Console → paste this script → press Enter
 *
 * The script will:
 *   - Extract the current question (stem, options, passage, code)
 *   - Click an answer option, then click Confirm
 *   - Read the correct answer (marked with class "corrected") + explanation
 *   - Click Continue to advance to the next question
 *   - Repeat until the quiz ends
 *   - Download the result as a JSON file
 *
 * Output: Downloads a .json file you place at data/official-questions.json
 *         Then run: npx tsx scripts/import-official.ts
 *
 * DOM structure (confirmed Feb 2026):
 *   div.content-container
 *     └─ div.question-container
 *          ├─ div.reading-passage          ← passage (RC only)
 *          └─ div
 *               ├─ span.sr-only "Question"
 *               ├─ p.e_id "100546"         ← question code
 *               ├─ p "According to..."     ← stem paragraph(s)
 *               └─ ul.question-choices-multi
 *                    └─ li
 *                        ├─ div.multi-choice[data-choice="A"]
 *                        └─ div.choice-content "option text"
 *
 *   After confirming (answer-container sibling becomes visible):
 *     div.multi-choice.corrected[data-choice="D"]  ← correct answer
 *     div.multi-choice.incorrect[data-choice="A"]  ← user's wrong pick
 *     p "The correct answer is D."                 ← + explanation text
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
    actionDelay: 1200,
    answerRevealDelay: 2000,
    nextQuestionDelay: 1500,
    maxQuestions: 3, // ← CHANGE TO Infinity FOR FULL RUN
    verbose: true,
    // Auto-save every N questions (downloads partial JSON as backup)
    autoSaveInterval: 50,
  };

  // ── GMAT Focus Section + Type Detection ────────
  // Since all questions are in one quiz, we auto-detect per question.
  const SECTION_MAP = {
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

  // ── Verified DOM Selectors ─────────────────────
  const SEL = {
    // Question container (the visible one with content)
    questionContainer: "div.question-container",
    // Passage for RC questions
    passage: "div.reading-passage",
    // Question code (e.g. "100546")
    questionCode: "p.e_id",
    // Options
    optionsList: "ul.question-choices-multi",
    optionItem: "ul.question-choices-multi > li",
    choiceLetter: "div.multi-choice",
    choiceContent: "div.choice-content",
    // Post-answer: correct answer has class "corrected" (NOT "correct")
    correctOption: "div.multi-choice.corrected",
    incorrectOption: "div.multi-choice.incorrect",
    // Answer container (sibling of question-container, shown after confirm)
    answerContainer: "div.answer-container",
    // Buttons (toolbar buttons are <a> tags, NOT <button>)
    confirmButton: "button.btn-success",
    continueButton: "button.continue",
    nextToolbar: "a.toolbar-btn.cap.next",
    prevToolbar: "a.toolbar-btn.previous",
  };

  // ── Utilities ──────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function log(...args) {
    if (CONFIG.verbose) console.log("[GMATE]", ...args);
  }

  function warn(...args) {
    console.warn("[GMATE]", ...args);
  }

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  // Simulate a real click that Backbone.js/jQuery delegated events will pick up.
  // Uses jQuery's .trigger() if available (preferred for Backbone apps),
  // otherwise dispatches a full MouseEvent with proper bubbling.
  function simulateClick(el) {
    if (!el) return false;
    // Prefer jQuery trigger — Backbone.js binds events via jQuery delegation
    if (window.$ || window.jQuery) {
      const jq = window.$ || window.jQuery;
      jq(el).trigger("click");
      return true;
    }
    // Fallback: dispatch a real MouseEvent
    const evt = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    el.dispatchEvent(evt);
    return true;
  }

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

  // ── Find the ACTIVE question container ─────────
  // There are multiple .question-container elements on the page.
  // The active one has visible content (passage + options).
  function findActiveQuestionContainer() {
    const containers = document.querySelectorAll(SEL.questionContainer);
    for (const c of containers) {
      if (
        c.offsetHeight > 0 &&
        c.textContent.trim().length > 10 &&
        !c.classList.contains("is-hidden")
      ) {
        return c;
      }
    }
    // Fallback: find container that has the options list
    const ul = document.querySelector(SEL.optionsList);
    if (ul) {
      let el = ul.parentElement;
      while (el && !el.classList.contains("question-container")) {
        el = el.parentElement;
      }
      return el;
    }
    return null;
  }

  // ── Extract question from DOM ──────────────────
  function extractCurrentQuestion() {
    const container = findActiveQuestionContainer();
    if (!container) {
      warn("No active question container found");
      return null;
    }

    // Question code from p.e_id
    const codeEl = container.querySelector(SEL.questionCode);
    const questionCode = codeEl ? clean(codeEl.textContent) : null;

    // Passage (RC questions have div.reading-passage)
    const passageEl = container.querySelector(SEL.passage);
    const passage = passageEl ? clean(passageEl.textContent) : null;

    // Stem: paragraphs that are NOT .e_id and NOT inside the passage or options
    // The stem paragraphs are siblings of p.e_id inside the question body div
    const stemParts = [];
    const bodyDiv = codeEl ? codeEl.parentElement : container;
    const paragraphs = bodyDiv.querySelectorAll("p");
    for (const p of paragraphs) {
      if (p.classList.contains("e_id")) continue;
      // Skip paragraphs that are inside the passage
      if (passageEl && passageEl.contains(p)) continue;
      const text = clean(p.textContent);
      if (text) stemParts.push(text);
    }
    const stem = stemParts.join("\n\n");

    // Options from ul.question-choices-multi > li
    const optionEls = container.querySelectorAll(SEL.optionItem);
    const options = [];
    for (const li of optionEls) {
      const choiceDiv = li.querySelector(SEL.choiceLetter);
      const contentDiv = li.querySelector(SEL.choiceContent);
      const label = choiceDiv
        ? (choiceDiv.getAttribute("data-choice") || "").toUpperCase()
        : "";
      const text = contentDiv
        ? clean(contentDiv.textContent)
        : clean(li.textContent);
      if (label && text) {
        options.push({ label, text });
      }
    }

    // data-id from the container
    const dataId = container.getAttribute("data-id");

    return { questionCode, dataId, stem, options, passage };
  }

  // ── Click answer option A ─────────────────────
  function clickFirstOption() {
    // Click the <li> parent — the click handler is on the list item, not the inner div
    const firstLi = document.querySelector(SEL.optionItem);
    if (firstLi) {
      simulateClick(firstLi);
      log("Clicked first option (li)");
      return true;
    }
    // Fallback: click div.multi-choice directly
    const choiceA = document.querySelector(
      'div.multi-choice[data-choice="A"]'
    );
    if (choiceA) {
      simulateClick(choiceA);
      log("Clicked option A (div)");
      return true;
    }
    warn("No option to click");
    return false;
  }

  // ── Click Confirm button ──────────────────────
  async function clickConfirm() {
    // Wait for Confirm to become enabled (up to 3 seconds)
    for (let attempt = 0; attempt < 6; attempt++) {
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        const text = clean(btn.textContent).toLowerCase();
        if (
          text === "confirm" &&
          !btn.classList.contains("is-disabled") &&
          !btn.disabled
        ) {
          simulateClick(btn);
          log("Clicked Confirm");
          return true;
        }
      }
      await sleep(500);
    }
    warn("Confirm button not found or still disabled");
    return false;
  }

  // ── Handle post-answer: confidence + Continue ──
  async function clickContinue() {
    await sleep(800);

    // Sometimes a confidence rating dialog appears.
    // Click any confidence button to dismiss it (could be <button> or <a>).
    const confBtns = document.querySelectorAll(
      ".high-confidence, .medium-confidence, .low-confidence"
    );
    for (const btn of confBtns) {
      if (btn.offsetHeight > 0) {
        simulateClick(btn);
        log("Clicked confidence button");
        await sleep(500);
        break;
      }
    }

    // Click Continue (search both <button> and <a> tags)
    const clickables = document.querySelectorAll("button, a.btn");
    for (const el of clickables) {
      const text = clean(el.textContent).toLowerCase();
      if (
        text === "continue" &&
        !el.classList.contains("is-disabled") &&
        el.offsetHeight > 0
      ) {
        simulateClick(el);
        log("Clicked Continue");
        return true;
      }
    }

    // Fallback: click the toolbar Next button (<a> tag)
    const next = document.querySelector(SEL.nextToolbar);
    if (next) {
      simulateClick(next);
      log("Clicked toolbar Next");
      return true;
    }

    warn("Could not advance to next question");
    return false;
  }

  // ── Extract correct answer + explanation ───────
  function extractAnswerResult() {
    let correctAnswer = null;
    let explanation = null;

    // Strategy 1: Find div.multi-choice.corrected (the BenchPrep class)
    const correctedEl = document.querySelector(SEL.correctOption);
    if (correctedEl) {
      correctAnswer = (
        correctedEl.getAttribute("data-choice") || ""
      ).toUpperCase();
    }

    // Strategy 2: Parse "The correct answer is X." text anywhere on page
    if (!correctAnswer) {
      const allText = document.body.textContent || "";
      const match = allText.match(/The correct answer is ([A-E])/i);
      if (match) correctAnswer = match[1].toUpperCase();
    }

    // Strategy 3: Scan all options for "corrected" or "correct" class
    if (!correctAnswer) {
      const opts = document.querySelectorAll(SEL.optionItem);
      for (const li of opts) {
        const mc = li.querySelector(SEL.choiceLetter);
        if (mc) {
          const cls = mc.className || "";
          if (cls.includes("corrected") || cls.includes("correct")) {
            correctAnswer = (
              mc.getAttribute("data-choice") || ""
            ).toUpperCase();
            break;
          }
        }
      }
    }

    // Explanation: look in the answer-container sibling
    // After Confirm, the answer-container becomes visible with explanation paragraphs
    const ansContainers = document.querySelectorAll(SEL.answerContainer);
    for (const ac of ansContainers) {
      if (ac.offsetHeight > 0 || ac.textContent.trim().length > 50) {
        const paragraphs = ac.querySelectorAll("p");
        const explParts = [];
        for (const p of paragraphs) {
          if (p.classList.contains("e_id")) continue;
          const text = clean(p.textContent);
          // Skip the passage text (it's also in the answer container)
          // Explanation paragraphs typically come after the options
          if (text.length > 20) explParts.push(text);
        }
        // The explanation is usually the last substantive paragraphs
        // that aren't the stem or passage. Filter for explanation-like text.
        if (explParts.length > 0) {
          // Look for "The correct answer is" as a marker
          const markerIdx = explParts.findIndex((t) =>
            t.match(/The correct answer is [A-E]/i)
          );
          if (markerIdx >= 0) {
            // Everything from the marker onward is explanation
            explanation = explParts.slice(markerIdx).join("\n\n");
          } else {
            // Take the last paragraph(s) as explanation
            explanation = explParts[explParts.length - 1];
          }
        }
        if (explanation) break;
      }
    }

    // Fallback: search for "The correct answer is" pattern anywhere
    if (!explanation) {
      const all = document.querySelectorAll("p");
      for (const p of all) {
        const text = clean(p.textContent);
        if (text.match(/The correct answer is [A-E]/i) && text.length > 30) {
          explanation = text;
          break;
        }
      }
    }

    return { correctAnswer, explanation };
  }

  // ── Detect question type per question ──────────
  // Since all 1162 questions are in one quiz, detect per question.
  function detectQuestionType(stem, options, passage) {
    const stemLower = (stem || "").toLowerCase();
    const optionText = options.map((o) => o.text).join(" ").toLowerCase();
    const allText = `${stemLower} ${optionText}`;

    // Data Sufficiency: options always include "Statement (1) ALONE"
    if (
      optionText.includes("statement (1) alone") ||
      optionText.includes("statements (1) and (2) together") ||
      allText.includes("data sufficiency")
    ) {
      return SECTION_MAP["data sufficiency"];
    }

    // Two-Part Analysis: distinctive format with two-column answers
    if (
      allText.includes("two-part") ||
      document.querySelector("table.two-part-analysis, .two-part")
    ) {
      return SECTION_MAP["two-part analysis"];
    }

    // Table Analysis: has a data table
    if (
      document.querySelector(".table-analysis, table.data-table") ||
      allText.includes("sort by")
    ) {
      return SECTION_MAP["table analysis"];
    }

    // Graphics Interpretation: has a graph/chart
    if (
      document.querySelector(
        ".graphics-interpretation, .graph-container, .chart-container, svg.chart"
      ) ||
      allText.includes("select from the drop")
    ) {
      return SECTION_MAP["graphics interpretation"];
    }

    // Multi-Source Reasoning: multiple tabs/sources
    if (
      document.querySelector(
        ".multi-source, .source-tabs, .tabbed-content"
      ) ||
      allText.includes("multi-source")
    ) {
      return SECTION_MAP["multi-source reasoning"];
    }

    // Reading Comprehension: has a passage
    if (passage && passage.length > 100) {
      return SECTION_MAP["reading comprehension"];
    }

    // Critical Reasoning: verbal question without long passage
    // CR stems are typically argument-based (shorter than RC passages)
    if (passage && passage.length > 30 && passage.length <= 100) {
      return SECTION_MAP["critical reasoning"];
    }

    // CR: question asks about argument structure
    if (
      stemLower.includes("weaken") ||
      stemLower.includes("strengthen") ||
      stemLower.includes("assumption") ||
      stemLower.includes("conclusion") ||
      stemLower.includes("argument") ||
      stemLower.includes("flaw") ||
      stemLower.includes("the following") ||
      stemLower.includes("if true")
    ) {
      return SECTION_MAP["critical reasoning"];
    }

    // Default: Problem Solving (quantitative)
    return SECTION_MAP["problem solving"];
  }

  function estimateDifficulty(stem) {
    const wordCount = stem.split(/\s+/).length;
    if (wordCount > 80) return "HARD";
    if (wordCount > 40) return "MEDIUM";
    return "EASY";
  }

  // ── Check if quiz is done ─────────────────────
  function isQuizComplete() {
    // Check for the "all questions answered" message
    const aqa = document.querySelector(".all-questions-answered");
    if (aqa && aqa.offsetHeight > 0) return true;

    // No visible question container
    const container = findActiveQuestionContainer();
    if (!container) return true;

    // No options visible
    const opts = document.querySelectorAll(SEL.optionItem);
    if (opts.length === 0) return true;

    return false;
  }

  // ── MAIN EXTRACTION LOOP ──────────────────────

  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║  GMATE — Official Guide Extractor v2         ║");
  console.log("║  Selectors verified against BenchPrep DOM    ║");
  console.log("╚═══════════════════════════════════════════════╝");
  console.log("");

  const collected = [];
  const seenCodes = new Set();
  let questionIndex = 0;
  let consecutiveFailures = 0;

  while (questionIndex < CONFIG.maxQuestions) {
    log(`\n── Question ${questionIndex + 1} ──`);

    await sleep(CONFIG.actionDelay);

    // Check if quiz is done
    if (isQuizComplete()) {
      log("Quiz complete. Stopping.");
      break;
    }

    // 1. Extract question data from visible DOM
    const qData = extractCurrentQuestion();
    if (!qData || !qData.stem || qData.options.length === 0) {
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        warn("3 consecutive failures. Stopping.");
        break;
      }
      warn("Could not extract question, retrying...");
      // Try clicking Next in case we're stuck
      const next = document.querySelector(SEL.nextToolbar);
      if (next) simulateClick(next);
      await sleep(CONFIG.nextQuestionDelay);
      continue;
    }
    consecutiveFailures = 0;

    // Skip duplicates (same question code)
    if (qData.questionCode && seenCodes.has(qData.questionCode)) {
      log("Duplicate question code:", qData.questionCode, "— skipping");
      const next = document.querySelector(SEL.nextToolbar);
      if (next) simulateClick(next);
      await sleep(CONFIG.nextQuestionDelay);
      questionIndex++;
      continue;
    }
    if (qData.questionCode) seenCodes.add(qData.questionCode);

    log(
      "Code:",
      qData.questionCode,
      "| Stem:",
      qData.stem.slice(0, 60) + "...",
    );
    log("Options:", qData.options.length, "| Passage:", !!qData.passage);

    // 2. Check if answer is already revealed (review mode)
    let result;
    const alreadyRevealed = document.querySelector(SEL.correctOption);
    if (alreadyRevealed) {
      log("Answer already revealed (review mode)");
      result = extractAnswerResult();
    } else {
      // 3. Practice mode: click answer → Confirm → extract result
      const clicked = clickFirstOption();
      if (!clicked) {
        warn("Could not click option. Trying Next.");
        const next = document.querySelector(SEL.nextToolbar);
        if (next) simulateClick(next);
        await sleep(CONFIG.nextQuestionDelay);
        questionIndex++;
        continue;
      }
      await sleep(600);

      const confirmed = await clickConfirm();
      if (!confirmed) {
        warn("Confirm failed. Trying Next.");
        const next = document.querySelector(SEL.nextToolbar);
        if (next) simulateClick(next);
        await sleep(CONFIG.nextQuestionDelay);
        questionIndex++;
        continue;
      }
      await sleep(CONFIG.answerRevealDelay);

      result = extractAnswerResult();
    }

    log(
      "Correct:",
      result.correctAnswer,
      "| Explanation:",
      result.explanation ? result.explanation.length + " chars" : "none",
    );

    // 4. Detect question type from content
    const typeInfo = detectQuestionType(
      qData.stem,
      qData.options,
      qData.passage,
    );

    // 5. Build question object (matches import-official.ts OfficialQuestion)
    const question = {
      section: typeInfo.section,
      questionType: typeInfo.questionType,
      subsection: typeInfo.subsection,
      difficulty: estimateDifficulty(qData.stem),
      stem: qData.stem,
      ...(qData.passage ? { passage: qData.passage } : {}),
      options: qData.options,
      correctAnswer: result.correctAnswer || "?",
      explanation: result.explanation || "",
      tags: [
        "official-guide",
        typeInfo.questionType.toLowerCase().replace(/_/g, "-"),
      ],
    };

    collected.push(question);
    log(`Collected ${collected.length} questions`);

    // 6. Auto-save backup
    if (
      CONFIG.autoSaveInterval > 0 &&
      collected.length % CONFIG.autoSaveInterval === 0
    ) {
      const backupName = `og-backup-${collected.length}-${Date.now()}.json`;
      downloadJSON(collected, backupName);
      log(`Auto-saved backup: ${backupName}`);
    }

    // 7. Advance to next question
    await sleep(400);
    const advanced = await clickContinue();
    if (!advanced) {
      log("Could not advance. May be the last question.");
      break;
    }
    await sleep(CONFIG.nextQuestionDelay);

    questionIndex++;
  }

  // ── Download Final Results ────────────────────
  console.log("");
  console.log("═══════════════════════════════════════════════");
  console.log(`Extraction complete! ${collected.length} questions collected.`);
  console.log("═══════════════════════════════════════════════");

  // Summary by section
  const sectionCounts = {};
  for (const q of collected) {
    const key = `${q.section} / ${q.questionType}`;
    sectionCounts[key] = (sectionCounts[key] || 0) + 1;
  }
  console.log("Breakdown:");
  for (const [key, count] of Object.entries(sectionCounts)) {
    console.log(`  ${key}: ${count}`);
  }

  // Count questions with missing data
  const missingAnswer = collected.filter(
    (q) => q.correctAnswer === "?",
  ).length;
  const missingExplanation = collected.filter((q) => !q.explanation).length;
  if (missingAnswer > 0)
    console.log(`⚠ ${missingAnswer} questions with unknown correct answer`);
  if (missingExplanation > 0)
    console.log(`⚠ ${missingExplanation} questions without explanation`);

  if (collected.length > 0) {
    const filename = `official-questions-${collected.length}-${Date.now()}.json`;
    downloadJSON(collected, filename);
    console.log(`\nDownloaded: ${filename}`);
    console.log("");
    console.log("Next steps:");
    console.log(
      "1. Move downloaded file to: data/official-questions.json",
    );
    console.log(
      "   (or merge with existing: node scripts/merge-extractions.js *.json)",
    );
    console.log("2. Run: npx tsx scripts/import-official.ts");
  }

  window.__GMATE_EXTRACTED = collected;
  console.log("Data also at: window.__GMATE_EXTRACTED");

  return collected;
})();
