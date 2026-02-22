import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = session.user;

  return NextResponse.json({ id: user.id, email: user.email, name: user.name });
}
