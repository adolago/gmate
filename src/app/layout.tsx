import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavSidebar } from "@/components/layout/nav-sidebar";
import { AISidebar } from "@/components/layout/ai-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { QuestionContextProvider } from "@/hooks/use-question-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GMATE — GMAT Study Platform",
  description: "AI-powered GMAT 2026 study companion with Kemi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QuestionContextProvider>
          <div className="flex h-screen flex-col">
            <TopBar />
            <div className="flex flex-1 overflow-hidden">
              <NavSidebar />
              <main className="flex-1 overflow-y-auto p-6">{children}</main>
              <AISidebar />
            </div>
          </div>
        </QuestionContextProvider>
      </body>
    </html>
  );
}
