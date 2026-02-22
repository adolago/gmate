import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const { user } = await auth.api.signInEmail({
      headers: request.headers,
      body: {
        email,
        password,
      },
    });

    return NextResponse.json({ id: user.id, email: user.email, name: user.name });
  } catch {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }
}
