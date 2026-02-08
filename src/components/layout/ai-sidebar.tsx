"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuestionContext } from "@/hooks/use-question-context";
import { useChat } from "@/hooks/use-chat";
import { SCAFFOLD_LEVELS } from "@/lib/gmat-constants";

export function AISidebar() {
  const [input, setInput] = useState("");
  const { question, student } = useQuestionContext();
  const { messages, isStreaming, sendMessage, clearMessages } = useChat({
    questionContext: question,
    studentContext: student,
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const scaffoldLevel = student?.scaffoldLevel ?? 1;
  const scaffoldConfig = SCAFFOLD_LEVELS[scaffoldLevel];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <aside className="flex w-[380px] flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Kemi</span>
          <Badge
            variant="outline"
            className="text-xs"
            title={scaffoldConfig.description}
          >
            L{scaffoldLevel}
          </Badge>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground"
            onClick={clearMessages}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Context Badge */}
      <div className="border-b border-border px-4 py-2">
        {question ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="truncate text-muted-foreground">
              {question.section} &middot; {question.subsection} &middot;{" "}
              {question.difficulty}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-zinc-400" />
            No question selected
          </div>
        )}
        {student && (
          <div className="mt-1 text-xs text-muted-foreground">
            {student.topicName} &middot; Mastery{" "}
            {Math.round(student.masteryLevel * 100)}% &middot;{" "}
            {scaffoldConfig.label}
          </div>
        )}
      </div>

      {/* Chat Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="flex flex-col gap-3 p-4">
          {messages.length === 0 && (
            <div className="rounded-lg bg-muted px-3 py-2 text-sm">
              <p className="text-muted-foreground">
                Hi! I&apos;m Kemi, your GMAT study companion. Select a question to
                get started, or ask me anything about the GMAT.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={
                msg.role === "user"
                  ? "ml-8 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "mr-8 rounded-lg bg-muted px-3 py-2 text-sm"
              }
            >
              <p className="whitespace-pre-wrap">{msg.content || (isStreaming ? "..." : "")}</p>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Separator />

      {/* Hint Button */}
      <div className="flex gap-2 px-4 py-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={!question || isStreaming}
          onClick={() => sendMessage("I need a hint.")}
        >
          Hint
        </Button>
        {question && !question.hasAttempted && (
          <span className="flex items-center text-xs text-muted-foreground">
            Won&apos;t reveal the answer
          </span>
        )}
      </div>

      {/* Chat Input */}
      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              question
                ? "Ask about this question..."
                : "Ask about GMAT..."
            }
            className="text-sm"
            disabled={isStreaming}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? "..." : "Send"}
          </Button>
        </form>
      </div>
    </aside>
  );
}
