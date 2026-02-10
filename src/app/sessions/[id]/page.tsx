"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQuestionContext } from "@/hooks/use-question-context";
import { getScaffoldLevel } from "@/lib/gmat-constants";

interface QuestionOption {
  label: string;
  text: string;
}

interface SessionQuestion {
  id: string;
  orderIndex: number;
  question: {
    id: string;
    section: string;
    questionType: string;
    subsection: string;
    difficulty: string;
    stem: string;
    passage: string | null;
    options: QuestionOption[];
    correctAnswer: string;
    explanation: string;
    topic: { id: string; name: string } | null;
  };
}

interface AttemptRecord {
  id: string;
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  timeSpentMs: number;
  errorType: string | null;
}

interface SessionData {
  id: string;
  sessionType: string;
  section: string | null;
  difficulty: string | null;
  totalQuestions: number;
  timeLimitMs: number;
  status: string;
  correctCount: number;
  totalTimeMs: number;
  sessionQuestions: SessionQuestion[];
  attempts: AttemptRecord[];
}

type SessionPhase = "loading" | "active" | "results";

const DIFFICULTY_COLORS: Record<string, string> = {
  EASY: "bg-emerald-100 text-emerald-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  HARD: "bg-red-100 text-red-800",
};

export default function ActiveSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { setQuestion, setStudent } = useQuestionContext();

  const [session, setSession] = useState<SessionData | null>(null);
  const [phase, setPhase] = useState<SessionPhase>("loading");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [remainingMs, setRemainingMs] = useState(0);
  const [localAttempts, setLocalAttempts] = useState<
    { questionId: string; isCorrect: boolean; selectedAnswer: string; timeSpentMs: number; correctAnswer: string; explanation: string }[]
  >([]);

  const [masteryMap, setMasteryMap] = useState<
    Map<string, { masteryLevel: number; accuracy7d: number; practiceCount: number }>
  >(new Map());

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartRef = useRef<number>(Date.now());

  // Fetch session data
  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then((data: SessionData) => {
        setSession(data);
        if (data.status === "COMPLETED" || data.status === "ABANDONED") {
          setPhase("results");
        } else {
          // Resume from where we left off (skip already-attempted questions)
          const attemptedIds = new Set(data.attempts.map((a) => a.questionId));
          const nextIndex = data.sessionQuestions.findIndex(
            (sq) => !attemptedIds.has(sq.question.id)
          );
          setCurrentIndex(nextIndex === -1 ? data.sessionQuestions.length : nextIndex);
          setRemainingMs(data.timeLimitMs);
          sessionStartRef.current = Date.now();
          setQuestionStartTime(Date.now());
          setPhase(nextIndex === -1 ? "results" : "active");
        }
      });
  }, [id]);

  // Fetch mastery data for all topics in this session
  useEffect(() => {
    if (!session) return;
    const topicIds = new Set(
      session.sessionQuestions
        .map((sq) => sq.question.topic?.id)
        .filter((id): id is string => !!id)
    );
    if (topicIds.size === 0) return;

    fetch("/api/mastery")
      .then((r) => r.json())
      .then((records: { topicId: string; masteryLevel: number; accuracy7d: number; practiceCount: number }[]) => {
        const map = new Map<string, { masteryLevel: number; accuracy7d: number; practiceCount: number }>();
        for (const r of records) {
          if (topicIds.has(r.topicId)) {
            map.set(r.topicId, {
              masteryLevel: r.masteryLevel ?? 0,
              accuracy7d: r.accuracy7d ?? 0,
              practiceCount: r.practiceCount ?? 0,
            });
          }
        }
        setMasteryMap(map);
      })
      .catch(() => {});
  }, [session]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "active" || !session) return;

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - sessionStartRef.current;
      const remaining = Math.max(0, session.timeLimitMs - elapsed);
      setRemainingMs(remaining);

      if (remaining <= 0) {
        handleFinishSession();
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, session]);

  // Update AI sidebar context for current question
  useEffect(() => {
    if (phase !== "active" || !session) return;
    const sq = session.sessionQuestions[currentIndex];
    if (!sq) return;

    const q = sq.question;
    setQuestion({
      questionId: q.id,
      stem: q.stem,
      options: q.options,
      section: q.section,
      questionType: q.questionType,
      difficulty: q.difficulty,
      subsection: q.subsection,
      hasAttempted: false,
      passage: q.passage,
    });

    const topicMastery = q.topic?.id ? masteryMap.get(q.topic.id) : undefined;
    const mastery = topicMastery?.masteryLevel ?? 0;
    const accuracy = topicMastery?.accuracy7d ?? 0;
    const practice = topicMastery?.practiceCount ?? localAttempts.length;

    setStudent({
      masteryLevel: mastery,
      scaffoldLevel: getScaffoldLevel(mastery, accuracy, practice),
      accuracy7d: accuracy,
      practiceCount: practice,
      topicName: q.topic?.name || q.subsection,
    });

    return () => {
      setQuestion(null);
      setStudent(null);
    };
  }, [phase, session, currentIndex, setQuestion, setStudent, localAttempts.length, masteryMap]);

  const handleSubmitAnswer = useCallback(async () => {
    if (!selected || !session || submitting) return;

    const sq = session.sessionQuestions[currentIndex];
    if (!sq) return;

    setSubmitting(true);
    const timeSpentMs = Date.now() - questionStartTime;

    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: sq.question.id,
          selectedAnswer: selected,
          timeSpentMs,
          sessionId: session.id,
          scaffoldLevel: (() => {
            const tm = sq.question.topic?.id ? masteryMap.get(sq.question.topic.id) : undefined;
            return getScaffoldLevel(
              tm?.masteryLevel ?? 0,
              tm?.accuracy7d ?? 0,
              tm?.practiceCount ?? 0
            );
          })(),
          hintsUsed: 0,
        }),
      });
      const data = await res.json();

      setLocalAttempts((prev) => [
        ...prev,
        {
          questionId: sq.question.id,
          isCorrect: data.isCorrect,
          selectedAnswer: selected,
          timeSpentMs,
          correctAnswer: data.correctAnswer,
          explanation: data.explanation,
        },
      ]);
    } catch {
      // Fallback: local correctness check
      const isCorrect = selected === sq.question.correctAnswer;
      setLocalAttempts((prev) => [
        ...prev,
        {
          questionId: sq.question.id,
          isCorrect,
          selectedAnswer: selected,
          timeSpentMs,
          correctAnswer: sq.question.correctAnswer,
          explanation: sq.question.explanation,
        },
      ]);
    }

    setSubmitting(false);
    setSelected(null);

    // Move to next question or finish
    const nextIndex = currentIndex + 1;
    if (nextIndex >= session.sessionQuestions.length) {
      handleFinishSession();
    } else {
      setCurrentIndex(nextIndex);
      setQuestionStartTime(Date.now());
    }
  }, [selected, session, currentIndex, questionStartTime, submitting, masteryMap]);

  const handleFinishSession = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (session && session.status !== "COMPLETED") {
      await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
    }

    setPhase("results");
  }, [session]);

  // --- Loading ---
  if (phase === "loading" || !session) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-64 animate-pulse rounded bg-muted" />
        <div className="h-2 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  // --- Results ---
  if (phase === "results") {
    return (
      <SessionResults
        session={session}
        localAttempts={localAttempts}
        onBackToSessions={() => router.push("/sessions")}
        onReviewMistakes={() => {
          // Navigate to first incorrect question
          const firstWrong = localAttempts.find((a) => !a.isCorrect);
          if (firstWrong) {
            router.push(`/questions/${firstWrong.questionId}`);
          }
        }}
      />
    );
  }

  // --- Active Session ---
  const sq = session.sessionQuestions[currentIndex];
  if (!sq) return null;

  const q = sq.question;
  const progress = ((currentIndex) / session.totalQuestions) * 100;
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const timerUrgent = remainingMs < 120000; // Under 2 minutes

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Session Header: Timer + Progress */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Question {currentIndex + 1} of {session.totalQuestions}
        </div>
        <div
          className={`font-mono text-lg font-bold ${timerUrgent ? "text-red-500" : "text-foreground"}`}
        >
          {minutes}:{seconds.toString().padStart(2, "0")}
        </div>
      </div>
      <Progress value={progress} className="h-2" />

      {/* Question badges */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{q.section.replace(/_/g, " ")}</Badge>
        <Badge className={DIFFICULTY_COLORS[q.difficulty] || ""}>
          {q.difficulty}
        </Badge>
        {q.topic && <Badge variant="outline">{q.topic.name}</Badge>}
      </div>

      {/* Passage */}
      {q.passage && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Passage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {q.passage}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stem */}
      <p className="text-base leading-relaxed">{q.stem}</p>

      {/* Options */}
      <div className="space-y-2">
        {q.options.map((option) => {
          const isSelected = selected === option.label;
          return (
            <button
              key={option.label}
              onClick={() => setSelected(option.label)}
              className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent/50"
              } cursor-pointer`}
            >
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border"
                }`}
              >
                {option.label}
              </span>
              <span className="pt-0.5">{option.text}</span>
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={handleSubmitAnswer}
          disabled={!selected || submitting}
          className="flex-1"
          size="lg"
        >
          {submitting
            ? "Submitting..."
            : currentIndex === session.totalQuestions - 1
              ? "Submit & Finish"
              : "Submit & Next"}
        </Button>
        <Button variant="outline" onClick={handleFinishSession}>
          End Session
        </Button>
      </div>

      {/* Quick nav dots */}
      <div className="flex justify-center gap-1.5">
        {session.sessionQuestions.map((_, i) => {
          const attempted = i < localAttempts.length;
          const isCurrent = i === currentIndex;
          return (
            <div
              key={i}
              className={`h-2 w-2 rounded-full ${
                isCurrent
                  ? "bg-primary"
                  : attempted
                    ? localAttempts[i]?.isCorrect
                      ? "bg-emerald-500"
                      : "bg-red-500"
                    : "bg-muted"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

function computePerformanceSummary(
  localAttempts: {
    questionId: string;
    isCorrect: boolean;
    timeSpentMs: number;
    correctAnswer: string;
  }[],
  sessionQuestions: SessionQuestion[]
): {
  accuracy: number;
  avgTimeMs: number;
  difficultyBreakdown: { difficulty: string; correct: number; total: number }[];
  recommendation: string;
} {
  if (localAttempts.length === 0) {
    return { accuracy: 0, avgTimeMs: 0, difficultyBreakdown: [], recommendation: "" };
  }

  // Build a questionId → difficulty lookup from session questions
  const difficultyMap = new Map<string, string>();
  for (const sq of sessionQuestions) {
    difficultyMap.set(sq.question.id, sq.question.difficulty);
  }

  // Overall metrics
  const correct = localAttempts.filter((a) => a.isCorrect).length;
  const accuracy = correct / localAttempts.length;
  const avgTimeMs =
    localAttempts.reduce((sum, a) => sum + a.timeSpentMs, 0) / localAttempts.length;

  // Group by difficulty
  const groups: Record<string, { correct: number; total: number }> = {};
  for (const attempt of localAttempts) {
    const diff = difficultyMap.get(attempt.questionId) || "UNKNOWN";
    if (!groups[diff]) groups[diff] = { correct: 0, total: 0 };
    groups[diff].total++;
    if (attempt.isCorrect) groups[diff].correct++;
  }

  // Ordered breakdown
  const order = ["EASY", "MEDIUM", "HARD"];
  const difficultyBreakdown = order
    .filter((d) => groups[d])
    .map((d) => ({ difficulty: d, ...groups[d] }));

  // Recommendation based on the 70-85% optimal learning zone
  let recommendation = "";
  const weakest = difficultyBreakdown
    .filter((d) => d.total >= 2)
    .sort((a, b) => a.correct / a.total - b.correct / b.total)[0];

  if (accuracy >= 0.85) {
    recommendation =
      "Great session! You're above the optimal zone — consider increasing difficulty to keep challenging yourself.";
  } else if (accuracy >= 0.7) {
    recommendation =
      "You're in the optimal learning zone (70-85%). This is where the most growth happens — keep this pace.";
  } else if (accuracy >= 0.5) {
    if (weakest) {
      const weakAcc = Math.round((weakest.correct / weakest.total) * 100);
      recommendation = `Focus on ${weakest.difficulty.toLowerCase()} questions (${weakAcc}% accuracy). Consider reviewing prerequisite topics before retrying.`;
    } else {
      recommendation =
        "Below the optimal zone. Try dropping down a difficulty level or reviewing fundamentals first.";
    }
  } else {
    recommendation =
      "This was a tough session. Review the explanations for each missed question, then try an easier set to rebuild confidence.";
  }

  return { accuracy, avgTimeMs, difficultyBreakdown, recommendation };
}

function SessionResults({
  session,
  localAttempts,
  onBackToSessions,
  onReviewMistakes,
}: {
  session: SessionData;
  localAttempts: {
    questionId: string;
    isCorrect: boolean;
    selectedAnswer: string;
    timeSpentMs: number;
    correctAnswer: string;
    explanation: string;
  }[];
  onBackToSessions: () => void;
  onReviewMistakes: () => void;
}) {
  const correct = localAttempts.filter((a) => a.isCorrect).length;
  const total = localAttempts.length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const totalTimeMs = localAttempts.reduce((sum, a) => sum + a.timeSpentMs, 0);
  const avgTimeSec = total > 0 ? Math.round(totalTimeMs / total / 1000) : 0;

  const summary = computePerformanceSummary(localAttempts, session.sessionQuestions);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Session Complete</h1>
        <p className="text-muted-foreground">
          {session.section?.replace(/_/g, " ") || "Mixed"} &middot;{" "}
          {session.sessionType}
        </p>
      </div>

      {/* Score Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {correct}/{total}
            </div>
            <Progress value={accuracy} className="mt-2 h-2" />
            <p className="mt-1 text-xs text-muted-foreground">{accuracy}% accuracy</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{avgTimeSec}s</div>
            <p className="mt-1 text-xs text-muted-foreground">per question</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {Math.round(totalTimeMs / 60000)}m
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              of {Math.round(session.timeLimitMs / 60000)}m limit
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Difficulty Breakdown */}
      {summary.difficultyBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Difficulty Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.difficultyBreakdown.map((d) => (
              <div key={d.difficulty} className="flex items-center gap-3">
                <Badge className={`w-20 justify-center ${DIFFICULTY_COLORS[d.difficulty] || ""}`}>
                  {d.difficulty}
                </Badge>
                <div className="flex-1">
                  <Progress
                    value={d.total > 0 ? (d.correct / d.total) * 100 : 0}
                    className="h-2"
                  />
                </div>
                <span className="w-16 text-right text-sm text-muted-foreground">
                  {d.correct}/{d.total}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recommendation */}
      {summary.recommendation && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              {summary.recommendation}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Question-by-Question Review */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Question Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {localAttempts.map((attempt, i) => {
            const sq = session.sessionQuestions[i];
            return (
              <div
                key={attempt.questionId}
                className="flex items-center gap-3 rounded-lg border px-3 py-2"
              >
                <div
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${
                    attempt.isCorrect ? "bg-emerald-500" : "bg-red-500"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="flex-1 truncate text-sm">
                  {sq?.question.stem.slice(0, 80)}...
                </div>
                <span className="text-xs text-muted-foreground">
                  {Math.round(attempt.timeSpentMs / 1000)}s
                </span>
                <span className="text-xs">
                  {attempt.isCorrect ? attempt.selectedAnswer : `${attempt.selectedAnswer} → ${attempt.correctAnswer}`}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBackToSessions}>
          Back to Sessions
        </Button>
        {localAttempts.some((a) => !a.isCorrect) && (
          <Button onClick={onReviewMistakes}>Review Mistakes</Button>
        )}
      </div>
    </div>
  );
}
