import { prisma } from "@/lib/db";

/**
 * Export chat conversations as JSONL for Tinker fine-tuning.
 * Each line is a complete conversation with context metadata.
 */
export async function GET() {
  const messages = await prisma.chatMessage.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      question: {
        select: {
          stem: true,
          section: true,
          questionType: true,
          difficulty: true,
          subsection: true,
          correctAnswer: true,
        },
      },
    },
  });

  // Group messages into conversations (by sessionId or questionId)
  const conversations = new Map<
    string,
    typeof messages
  >();

  for (const msg of messages) {
    const key = msg.sessionId || msg.questionId || "general";
    if (!conversations.has(key)) {
      conversations.set(key, []);
    }
    conversations.get(key)!.push(msg);
  }

  // Convert to JSONL
  const lines: string[] = [];
  for (const [contextKey, msgs] of conversations) {
    const entry = {
      context_key: contextKey,
      messages: msgs.map((m) => ({
        role: m.role.toLowerCase(),
        content: m.content,
      })),
      metadata: {
        question: msgs[0]?.question || null,
        section: msgs[0]?.section,
        scaffoldLevel: msgs[0]?.scaffoldLevel,
        additionalContext: msgs[0]?.metadata,
        messageCount: msgs.length,
        firstMessageAt: msgs[0]?.createdAt,
        lastMessageAt: msgs[msgs.length - 1]?.createdAt,
      },
    };
    lines.push(JSON.stringify(entry));
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "application/jsonl",
      "Content-Disposition":
        `attachment; filename="GMATE-training-data-${new Date().toISOString().split("T")[0]}.jsonl"`,
    },
  });
}
