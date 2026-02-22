import { NavSidebar } from "@/components/layout/nav-sidebar";
import { AISidebar } from "@/components/layout/ai-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { QuestionContextProvider } from "@/hooks/use-question-context";

const aiEnabled = !!process.env.AI_BASE_URL;

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <QuestionContextProvider>
      <div className="flex h-screen flex-col">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <NavSidebar />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
          {aiEnabled && <AISidebar />}
        </div>
      </div>
    </QuestionContextProvider>
  );
}
