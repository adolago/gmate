"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface QuestionSummary {
  id: string;
  section: string;
  questionType: string;
  subsection: string;
  difficulty: string;
  stem: string;
  tags: string[];
  _count: { attempts: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  EASY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  HARD: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [section, setSection] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (section !== "all") params.set("section", section);
    if (difficulty !== "all") params.set("difficulty", difficulty);
    params.set("page", String(page));
    params.set("limit", "20");

    setLoading(true);
    fetch(`/api/questions?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setQuestions(data.questions);
        setPagination(data.pagination);
      })
      .finally(() => setLoading(false));
  }, [section, difficulty, page]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Question Bank</h1>
        <p className="text-muted-foreground">
          {pagination
            ? `${pagination.total} questions available`
            : "Loading..."}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={section} onValueChange={(v) => { setSection(v); setPage(1); }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sections</SelectItem>
            <SelectItem value="QUANTITATIVE_REASONING">Quant</SelectItem>
            <SelectItem value="VERBAL_REASONING">Verbal</SelectItem>
            <SelectItem value="DATA_INSIGHTS">Data Insights</SelectItem>
          </SelectContent>
        </Select>

        <Select value={difficulty} onValueChange={(v) => { setDifficulty(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="EASY">Easy</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HARD">Hard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Question List */}
      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : questions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No questions found. Run the seed script to populate the question
            bank.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {questions.map((q) => (
            <Link key={q.id} href={`/questions/${q.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {q.subsection}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {q.questionType.replace(/_/g, " ")}
                      </Badge>
                      <Badge
                        className={`text-xs ${DIFFICULTY_COLORS[q.difficulty] || ""}`}
                      >
                        {q.difficulty}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {q.stem}
                  </p>
                  {q._count.attempts > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {q._count.attempts} attempt
                      {q._count.attempts !== 1 ? "s" : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="rounded px-3 py-1 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pagination.totalPages}
          </span>
          <button
            className="rounded px-3 py-1 text-sm disabled:opacity-50"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
