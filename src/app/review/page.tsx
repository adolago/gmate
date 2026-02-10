"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface ReviewItem {
  id: string;
  topicId: string;
  topicName: string;
  retention: number;
  urgency: number;
  scheduledAt: string;
  isDue: boolean;
  masteryLevel: number;
  masteryStage: string;
}

interface ReviewData {
  all: ReviewItem[];
  due: ReviewItem[];
  dueCount: number;
}

const STAGE_COLORS: Record<string, string> = {
  UNKNOWN: "bg-zinc-100 text-zinc-600",
  INTRODUCED: "bg-blue-100 text-blue-700",
  DEVELOPING: "bg-amber-100 text-amber-700",
  PROFICIENT: "bg-emerald-100 text-emerald-700",
  MASTERED: "bg-purple-100 text-purple-700",
  FLUENT: "bg-pink-100 text-pink-700",
};

export default function ReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/review-queue")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
        <p className="text-muted-foreground">
          {data
            ? `${data.dueCount} topics due for review`
            : "Loading..."}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-16" />
            </Card>
          ))}
        </div>
      ) : !data || data.all.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No topics in review queue yet. Practice some questions first!
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Due Items */}
          {data.due.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold">Due Now</h2>
              <div className="space-y-3">
                {data.due.map((item) => (
                  <ReviewCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* All Topics */}
          <div>
            <h2 className="mb-3 text-lg font-semibold">All Topics</h2>
            <div className="space-y-3">
              {data.all.map((item) => (
                <ReviewCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/study-next?topicId=${item.topicId}&count=1`);
      const data = await res.json();
      if (data.tasks?.[0]?.questionId) {
        router.push(`/questions/${data.tasks[0].questionId}`);
      } else {
        router.push(`/questions?topicId=${item.topicId}`);
      }
    } catch {
      router.push(`/questions?topicId=${item.topicId}`);
    }
  }, [item.topicId, router]);

  return (
    <button onClick={handleClick} disabled={loading} className="w-full text-left">
      <Card className={`transition-colors hover:bg-accent/50 ${item.isDue ? "border-amber-300" : ""} ${loading ? "opacity-60" : ""}`}>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{item.topicName}</span>
              <Badge className={`text-xs ${STAGE_COLORS[item.masteryStage] || ""}`}>
                {item.masteryStage}
              </Badge>
              {item.isDue && (
                <Badge variant="outline" className="text-xs text-amber-600">
                  Due
                </Badge>
              )}
              {loading && (
                <span className="text-xs text-muted-foreground animate-pulse">Finding best question...</span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-4">
              <div className="flex-1">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Retention</span>
                  <span>{item.retention}%</span>
                </div>
                <Progress value={item.retention} className="h-1.5" />
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>Mastery: {Math.round(item.masteryLevel * 100)}%</div>
                <div>Urgency: {item.urgency}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
