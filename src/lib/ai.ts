/**
 * AI Client — OpenAI-Compatible Streaming Client
 *
 * Connects to vLLM at vllm.home.arpa (or any OpenAI-compatible endpoint).
 * Swap to Kimi K2.5 by changing AI_BASE_URL and AI_MODEL in .env.
 */

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getConfig(): AIConfig {
  return {
    baseUrl: process.env.AI_BASE_URL || "http://vllm.home.arpa/v1",
    apiKey: process.env.AI_API_KEY || "not-needed",
    model: process.env.AI_MODEL || "default",
  };
}

/**
 * Send a streaming chat completion request.
 * Returns a ReadableStream of SSE chunks.
 */
export async function streamChat(
  messages: ChatCompletionMessage[]
): Promise<ReadableStream<Uint8Array>> {
  const config = getConfig();

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API error (${response.status}): ${error}`);
  }

  if (!response.body) {
    throw new Error("AI API returned no body");
  }

  return response.body;
}

/**
 * Parse a Server-Sent Events stream into text chunks.
 * Handles the OpenAI streaming format: `data: {"choices":[{"delta":{"content":"..."}}]}`
 */
export function parseSSEStream(
  stream: ReadableStream<Uint8Array>
): ReadableStream<string> {
  const decoder = new TextDecoder();
  let buffer = "";

  return new TransformStream<Uint8Array, string>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            controller.enqueue(content);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    },
    flush(controller) {
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data: ") && trimmed.slice(6) !== "[DONE]") {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) controller.enqueue(content);
          } catch {
            // ignore
          }
        }
      }
    },
  }).readable.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
    })
  );

  // Wire it up: pipe the raw stream through the SSE parser
}

/**
 * Create a text-encoded ReadableStream from the SSE parser output.
 * Suitable for returning from a Next.js API route.
 */
export async function createStreamingResponse(
  messages: ChatCompletionMessage[]
): Promise<ReadableStream<Uint8Array>> {
  const rawStream = await streamChat(messages);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = rawStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              controller.close();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
