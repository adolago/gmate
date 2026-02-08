"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface MasteryData {
  id: string;
  topicId: string;
  masteryLevel: number;
  masteryStage: string;
  practiceCount: number;
  accuracy7d: number;
  accuracy30d: number;
  avgTimeMs: number;
  topic: { name: string; section: string };
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

const STAGE_COLORS: Record<string, string> = {
  UNKNOWN: "text-zinc-400",
  INTRODUCED: "text-blue-500",
  DEVELOPING: "text-amber-500",
  PROFICIENT: "text-emerald-500",
  MASTERED: "text-purple-500",
  FLUENT: "text-pink-500",
};

export default function ProgressPage() {
  const [mastery, setMastery] = useState<MasteryData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/mastery")
      .then((r) => r.json())
      .then(setMastery)
      .finally(() => setLoading(false));
  }, []);

  // Group by section
  const sections = mastery.reduce(
    (acc, m) => {
      const section = m.topic.section;
      if (!acc[section]) acc[section] = [];
      acc[section].push(m);
      return acc;
    },
    {} as Record<string, MasteryData[]>
  );

  // Overall stats
  const totalPracticed = mastery.reduce(
    (sum, m) => sum + m.practiceCount,
    0
  );
  const avgMastery =
    mastery.length > 0
      ? mastery.reduce((sum, m) => sum + m.masteryLevel, 0) / mastery.length
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <p className="text-muted-foreground">
          Track your mastery across all GMAT topics
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Overall Mastery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "..." : `${Math.round(avgMastery * 100)}%`}
            </div>
            <Progress
              value={avgMastery * 100}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Topics Tracked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mastery.length}</div>
            <p className="text-xs text-muted-foreground">
              across {Object.keys(sections).length} sections
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Practice
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPracticed}</div>
            <p className="text-xs text-muted-foreground">questions attempted</p>
          </CardContent>
        </Card>
      </div>

      {/* Mastery by Section */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-32" />
            </Card>
          ))}
        </div>
      ) : Object.keys(sections).length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No mastery data yet. Practice questions to see your progress!
          </CardContent>
        </Card>
      ) : (
        Object.entries(sections).map(([section, topics]) => {
          const sectionAvg =
            topics.reduce((sum, t) => sum + t.masteryLevel, 0) / topics.length;
          return (
            <Card key={section}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {SECTION_LABELS[section] || section}
                  </CardTitle>
                  <Badge variant="outline">
                    {Math.round(sectionAvg * 100)}% avg
                  </Badge>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full ${SECTION_COLORS[section] || "bg-zinc-500"}`}
                    style={{ width: `${sectionAvg * 100}%` }}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topics
                    .sort((a, b) => b.masteryLevel - a.masteryLevel)
                    .map((t) => (
                      <div key={t.id} className="flex items-center gap-3">
                        <div className="w-36 truncate text-sm">
                          {t.topic.name}
                        </div>
                        <div className="flex-1">
                          <Progress
                            value={t.masteryLevel * 100}
                            className="h-2"
                          />
                        </div>
                        <span
                          className={`w-20 text-right text-xs font-medium ${STAGE_COLORS[t.masteryStage] || ""}`}
                        >
                          {t.masteryStage}
                        </span>
                        <span className="w-12 text-right text-xs text-muted-foreground">
                          {Math.round(t.masteryLevel * 100)}%
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
