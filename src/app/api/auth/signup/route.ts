import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const signupName = name?.trim() || email.split("@")[0] || "GMATE User";

    const { user } = await auth.api.signUpEmail({
      headers: request.headers,
      body: {
        email,
        password,
        name: signupName,
      },
    });

    return NextResponse.json({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : "signup failed";

    if (
      message.includes("already exists") ||
      message.includes("another email") ||
      message.includes("user already exists")
    ) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Could not create account. Please try again." },
      { status: 400 }
    );
  }
}
