import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  await auth.api.signOut({
    headers: request.headers,
  });
  return NextResponse.json({ ok: true });
}
