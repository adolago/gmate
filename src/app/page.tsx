"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface SectionStat {
  section: string;
  total: number;
  correct: number;
  accuracy: number;
}

interface StatsData {
  totalAttempts: number;
  overallAccuracy: number;
  accuracy7d: number;
  dueCount: number;
  completedSessions: number;
  questionCount: number;
  avgMastery: number;
  streak: number;
  errorBreakdown: Record<string, number>;
  sectionStats: SectionStat[];
}

const SECTION_LABELS: Record<string, string> = {
  QUANTITATIVE_REASONING: "Quantitative Reasoning",
  VERBAL_REASONING: "Verbal Reasoning",
  DATA_INSIGHTS: "Data Insights",
};

const SECTION_COLORS: Record<string, string> = {
  QUANTITATIVE_REASONING: "bg-blue-500",
  VERBAL_REASONING: "bg-emerald-500",
  DATA_INSIGHTS: "bg-purple-500",
};

const ERROR_LABELS: Record<string, string> = {
  CONCEPTUAL: "Conceptual",
  PROCEDURAL: "Procedural",
  CARELESS: "Careless",
  KNOWLEDGE_GAP: "Knowledge Gap",
};

export default function Dashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here&apos;s your GMAT study overview.
        </p>
      </div>

      {/* Stats overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Questions Practiced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "..." : stats?.totalAttempts || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats && stats.totalAttempts > 0
                ? `${Math.round(stats.overallAccuracy * 100)}% accuracy`
                : "Start practicing!"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              7-Day Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading
                ? "..."
                : stats && stats.accuracy7d > 0
                  ? `${Math.round(stats.accuracy7d * 100)}%`
                  : "--"}
            </div>
            <Progress
              value={stats ? stats.accuracy7d * 100 : 0}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Review Due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "..." : stats?.dueCount || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats && stats.dueCount > 0 ? (
                <Link href="/review" className="underline">
                  Start review
                </Link>
              ) : (
                "All caught up"
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Study Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "..." : stats?.streak || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats && stats.streak > 0 ? "consecutive days" : "Start today!"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sections */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Sections</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(stats?.sectionStats || []).map((s) => (
            <Link key={s.section} href={`/questions?section=${s.section}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {SECTION_LABELS[s.section] || s.section}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {s.total} attempted
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full ${SECTION_COLORS[s.section] || "bg-zinc-500"}`}
                      style={{ width: `${s.accuracy * 100}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {s.total > 0
                      ? `${Math.round(s.accuracy * 100)}% accuracy · ${s.correct}/${s.total} correct`
                      : "Not started yet"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
          {!stats && !loading && (
            <p className="col-span-3 text-sm text-muted-foreground">
              No stats available yet.
            </p>
          )}
        </div>
      </div>

      {/* Error Breakdown */}
      {stats &&
        Object.keys(stats.errorBreakdown).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Error Breakdown (30 days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                {Object.entries(stats.errorBreakdown).map(([type, count]) => (
                  <div key={type} className="rounded-lg border px-3 py-2">
                    <div className="text-lg font-bold">{count}</div>
                    <div className="text-xs text-muted-foreground">
                      {ERROR_LABELS[type] || type}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Quick Actions */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/sessions">
            <Button>Start Practice Session</Button>
          </Link>
          <Link href="/questions">
            <Button variant="outline">Browse Questions</Button>
          </Link>
          <Link href="/review">
            <Button variant="outline">
              Review Queue
              {stats && stats.dueCount > 0 && (
                <Badge className="ml-2" variant="secondary">
                  {stats.dueCount}
                </Badge>
              )}
            </Button>
          </Link>
          <Link href="/progress">
            <Button variant="outline">View Progress</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
