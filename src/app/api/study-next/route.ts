import { NextRequest } from "next/server";
import { loadLearningState } from "@/lib/learning-state";
import { selectNextTasks } from "@/lib/task-selector";
import { pickQuestion } from "@/lib/question-picker";

export async function GET(request: NextRequest) {
  const count = parseInt(request.nextUrl.searchParams.get("count") ?? "5", 10);
  const topicIdFilter = request.nextUrl.searchParams.get("topicId");
  const now = new Date();
  const snapshot = await loadLearningState(now);

  const filteredQueue = topicIdFilter
    ? snapshot.reviewQueue.filter((r) => r.topicId === topicIdFilter)
    : snapshot.reviewQueue;
  const focusTopic = topicIdFilter
    ? snapshot.allTopics.find((topic) => topic.id === topicIdFilter)
    : null;
  const focusedTopicIds = new Set([
    ...(topicIdFilter ? [topicIdFilter] : []),
    ...(focusTopic?.prerequisites.map((prereq) => prereq.id) ?? []),
  ]);
  const filteredSignals =
    focusedTopicIds.size > 0
      ? snapshot.topicSignals.filter((signal) =>
          focusedTopicIds.has(signal.topicId)
        )
      : snapshot.topicSignals;

  // Select tasks
  const tasks = selectNextTasks(
    {
      allTopics: snapshot.allTopics,
      allMastery: snapshot.allMastery,
      reviewQueue: filteredQueue,
      topicSignals: filteredSignals,
    },
    count,
    now
  );

  // Resolve question IDs for each task
  const resolvedTasks = await Promise.all(
    tasks.map(async (task) => {
      if (task.questionId) return task;
      const questionId = await pickQuestion(task.topicId, task.difficulty);
      return { ...task, questionId };
    })
  );

  // Filter out tasks where no question could be found
  const validTasks = resolvedTasks.filter((t) => t.questionId !== null);

  const dueCount = snapshot.reviewQueue.filter((r) => r.isDue).length;
  const frontierCount = tasks.filter((t) => t.taskType === "NEW_TOPIC").length;
  const reviewCount = tasks.filter(
    (t) =>
      t.taskType === "REVIEW" ||
      t.taskType === "CONSOLIDATION" ||
      t.taskType === "REMEDIATION" ||
      t.taskType === "FLUENCY"
  ).length;

  return Response.json({
    tasks: validTasks,
    meta: {
      dueReviewCount: dueCount,
      frontierTopicCount: frontierCount,
      reviewPercentage:
        validTasks.length > 0
          ? Math.round((reviewCount / validTasks.length) * 100)
          : 0,
      consolidationsUsed: tasks.filter((t) => t.taskType === "CONSOLIDATION")
        .length,
      remediationUsed: tasks.filter((t) => t.taskType === "REMEDIATION").length,
      fluencyUsed: tasks.filter((t) => t.taskType === "FLUENCY").length,
    },
  });
}
