"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { QuestionContext, StudentContext } from "@/lib/ai-context";

interface QuestionContextState {
  question: QuestionContext | null;
  student: StudentContext | null;
  setQuestion: (q: QuestionContext | null) => void;
  setStudent: (s: StudentContext | null) => void;
  clearContext: () => void;
}

const Ctx = createContext<QuestionContextState | null>(null);

export function QuestionContextProvider({ children }: { children: ReactNode }) {
  const [question, setQuestionState] = useState<QuestionContext | null>(null);
  const [student, setStudentState] = useState<StudentContext | null>(null);

  const setQuestion = useCallback((q: QuestionContext | null) => {
    setQuestionState(q);
  }, []);

  const setStudent = useCallback((s: StudentContext | null) => {
    setStudentState(s);
  }, []);

  const clearContext = useCallback(() => {
    setQuestionState(null);
    setStudentState(null);
  }, []);

  return (
    <Ctx.Provider
      value={{ question, student, setQuestion, setStudent, clearContext }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useQuestionContext() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useQuestionContext must be used within a QuestionContextProvider"
    );
  }
  return ctx;
}
