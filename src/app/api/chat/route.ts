import { NextRequest } from "next/server";
import {
  createStreamingResponse,
  type ChatCompletionMessage,
} from "@/lib/ai";
import {
  buildSystemPrompt,
  type QuestionContext,
  type StudentContext,
} from "@/lib/ai-context";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    message,
    history = [],
    questionContext,
    studentContext,
  }: {
    message: string;
    history: { role: "user" | "assistant"; content: string }[];
    questionContext: QuestionContext | null;
    studentContext: StudentContext | null;
  } = body;

  // Build context-aware system prompt
  const systemPrompt = buildSystemPrompt(questionContext, studentContext);

  // Assemble messages
  const messages: ChatCompletionMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10), // Keep last 10 messages for context window
    { role: "user", content: message },
  ];

  try {
    const stream = await createStreamingResponse(messages);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown AI error";
    return Response.json({ error: errorMessage }, { status: 502 });
  }
}
