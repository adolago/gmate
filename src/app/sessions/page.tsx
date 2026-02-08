"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SessionSummary {
  id: string;
  sessionType: string;
  section: string | null;
  difficulty: string | null;
  totalQuestions: number;
  status: string;
  correctCount: number;
  startedAt: string;
  finishedAt: string | null;
  _count: { attempts: number; sessionQuestions: number };
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // New session form
  const [section, setSection] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [questionCount, setQuestionCount] = useState("10");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then(setSessions)
      .finally(() => setLoading(false));
  }, []);

  const handleCreateSession = async () => {
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        sessionType: "PRACTICE",
        totalQuestions: parseInt(questionCount),
        timeLimitMs: 45 * 60 * 1000,
      };
      if (section !== "all") body.section = section;
      if (difficulty !== "all") body.difficulty = difficulty;

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const session = await res.json();
      if (session.id) {
        router.push(`/sessions/${session.id}`);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Study Sessions</h1>
        <p className="text-muted-foreground">
          Practice with timed question sets
        </p>
      </div>

      {/* New Session */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start New Session</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Section
              </label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  <SelectItem value="QUANTITATIVE_REASONING">Quant</SelectItem>
                  <SelectItem value="VERBAL_REASONING">Verbal</SelectItem>
                  <SelectItem value="DATA_INSIGHTS">Data Insights</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Difficulty
              </label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="EASY">Easy</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HARD">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Questions
              </label>
              <Select value={questionCount} onValueChange={setQuestionCount}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreateSession} disabled={creating}>
              {creating ? "Creating..." : "Start Session"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Session History */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent Sessions</h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="h-16" />
              </Card>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No sessions yet. Start one above!
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <Card
                key={s.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => router.push(`/sessions/${s.id}`)}
              >
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {s.section?.replace(/_/g, " ") || "Mixed"} &middot;{" "}
                        {s.sessionType}
                      </span>
                      <Badge
                        variant={
                          s.status === "COMPLETED"
                            ? "default"
                            : s.status === "IN_PROGRESS"
                              ? "secondary"
                              : "outline"
                        }
                        className="text-xs"
                      >
                        {s.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.startedAt).toLocaleDateString()} &middot;{" "}
                      {s.totalQuestions} questions
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">
                      {s.correctCount}/{s._count.attempts}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s._count.attempts > 0
                        ? `${Math.round((s.correctCount / s._count.attempts) * 100)}%`
                        : "—"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
