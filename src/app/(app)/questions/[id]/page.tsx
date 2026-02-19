"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuestionContext } from "@/hooks/use-question-context";
import { getScaffoldLevel } from "@/lib/gmat-constants";
import { MathText } from "@/components/ui/math-text";

interface QuestionOption {
  label: string;
  text: string;
}

interface QuestionData {
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
  attempts: {
    id: string;
    selectedAnswer: string;
    isCorrect: boolean;
    timeSpentMs: number;
    createdAt: string;
  }[];
}

const DIFFICULTY_COLORS: Record<string, string> = {
  EASY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  HARD: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function QuestionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { setQuestion, setStudent } = useQuestionContext();

  const [question, setQuestionData] = useState<QuestionData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{
    isCorrect: boolean;
    correctAnswer: string;
    explanation: string;
    next?: { questionId: string; topicName: string; reason: string; taskType: string } | null;
    masteryUpdate?: { newMasteryLevel: number; newMasteryStage: string; scaffoldLevel: number };
  } | null>(null);
  const [startTime] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [topicMastery, setTopicMastery] = useState<{
    masteryLevel: number;
    accuracy7d: number;
    practiceCount: number;
  } | null>(null);

  // Fetch question data
  useEffect(() => {
    fetch(`/api/questions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setQuestionData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  // Fetch real mastery data for this question's topic
  useEffect(() => {
    if (!question?.topic?.id) return;
    fetch(`/api/mastery?topicId=${question.topic.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setTopicMastery({
            masteryLevel: data.masteryLevel ?? 0,
            accuracy7d: data.accuracy7d ?? 0,
            practiceCount: data.practiceCount ?? 0,
          });
        }
      })
      .catch(() => {});
  }, [question?.topic?.id]);

  // Update AI sidebar context when question loads
  useEffect(() => {
    if (!question) return;

    setQuestion({
      questionId: question.id,
      stem: question.stem,
      options: question.options,
      section: question.section,
      questionType: question.questionType,
      difficulty: question.difficulty,
      subsection: question.subsection,
      hasAttempted: submitted,
      correctAnswer: submitted ? question.correctAnswer : undefined,
      explanation: submitted ? question.explanation : undefined,
      passage: question.passage,
    });

    const mastery = topicMastery?.masteryLevel ?? 0;
    const accuracy = topicMastery?.accuracy7d ?? 0;
    const practice = topicMastery?.practiceCount ?? question.attempts.length;

    setStudent({
      masteryLevel: mastery,
      scaffoldLevel: getScaffoldLevel(mastery, accuracy, practice),
      accuracy7d: accuracy,
      practiceCount: practice,
      topicName: question.topic?.name || question.subsection,
    });

    return () => {
      setQuestion(null);
      setStudent(null);
    };
  }, [question, submitted, topicMastery, setQuestion, setStudent]);

  const handleSubmit = useCallback(async () => {
    if (!selected || !question) return;

    const timeSpentMs = Date.now() - startTime;
    setSubmitted(true);

    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          selectedAnswer: selected,
          timeSpentMs,
          scaffoldLevel: getScaffoldLevel(
            topicMastery?.masteryLevel ?? 0,
            topicMastery?.accuracy7d ?? null,
            topicMastery?.practiceCount ?? 0
          ),
          hintsUsed: 0,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      // Still show result from local data
      setResult({
        isCorrect: selected === question.correctAnswer,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
      });
    }
  }, [selected, question, startTime]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded bg-muted" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Question not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Badge variant="secondary">{question.section.replace(/_/g, " ")}</Badge>
        <Badge variant="secondary">
          {question.questionType.replace(/_/g, " ")}
        </Badge>
        <Badge className={DIFFICULTY_COLORS[question.difficulty] || ""}>
          {question.difficulty}
        </Badge>
        {question.topic && (
          <Badge variant="outline">{question.topic.name}</Badge>
        )}
      </div>

      {/* Passage (if applicable) */}
      {question.passage && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Passage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MathText className="whitespace-pre-wrap text-sm leading-relaxed">
              {question.passage}
            </MathText>
          </CardContent>
        </Card>
      )}

      {/* Question Stem */}
      <div>
        <p className="text-base leading-relaxed">
          <MathText>{question.stem}</MathText>
        </p>
      </div>

      {/* Answer Options */}
      <div className="space-y-2">
        {question.options.map((option) => {
          const isSelected = selected === option.label;
          const isCorrect =
            submitted && option.label === result?.correctAnswer;
          const isWrong =
            submitted && isSelected && option.label !== result?.correctAnswer;

          return (
            <button
              key={option.label}
              onClick={() => !submitted && setSelected(option.label)}
              disabled={submitted}
              className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                isCorrect
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                  : isWrong
                    ? "border-red-500 bg-red-50 dark:bg-red-950"
                    : isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent/50"
              } ${submitted ? "cursor-default" : "cursor-pointer"}`}
            >
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                  isCorrect
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : isWrong
                      ? "border-red-500 bg-red-500 text-white"
                      : isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                }`}
              >
                {option.label}
              </span>
              <span className="pt-0.5"><MathText>{option.text}</MathText></span>
            </button>
          );
        })}
      </div>

      {/* Submit / Result */}
      {!submitted ? (
        <Button
          onClick={handleSubmit}
          disabled={!selected}
          className="w-full"
          size="lg"
        >
          Submit Answer
        </Button>
      ) : result ? (
        <div className="space-y-4">
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium ${
              result.isCorrect
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
            }`}
          >
            {result.isCorrect ? "Correct!" : `Incorrect. The answer is ${result.correctAnswer}.`}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Explanation</CardTitle>
            </CardHeader>
            <CardContent>
              <MathText className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {result.explanation}
              </MathText>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            {result.next?.questionId ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {result.next.reason}
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() =>
                      router.push(`/questions/${result.next!.questionId}`)
                    }
                  >
                    Next: {result.next.topicName}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push("/questions")}
                  >
                    Browse Instead
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => router.back()}>
                  Back to Questions
                </Button>
                <Button onClick={() => router.push("/questions")}>
                  Browse Questions
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Time indicator */}
      <div className="text-xs text-muted-foreground">
        Time: {Math.round((Date.now() - startTime) / 1000)}s
        {question.attempts.length > 0 && (
          <> &middot; {question.attempts.length} previous attempt{question.attempts.length !== 1 ? "s" : ""}</>
        )}
      </div>
    </div>
  );
}
