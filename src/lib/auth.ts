import { NextResponse } from "next/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";

const authSecret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET;
if (!authSecret) {
  throw new Error("BETTER_AUTH_SECRET (or AUTH_SECRET fallback) is not set");
}

const baseURL =
  process.env.BETTER_AUTH_URL ??
  process.env.BETTER_AUTH_BASE_URL ??
  "http://localhost:3000";

export const auth = betterAuth({
  secret: authSecret,
  baseURL,
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    process.env.BETTER_AUTH_URL,
    process.env.BETTER_AUTH_BASE_URL,
  ].filter(Boolean) as string[],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      console.info(`[auth] Password reset link for ${user.email}: ${url}`);
    },
  },
  user: {
    modelName: "User",
  },
  session: {
    modelName: "AuthSession",
  },
  account: {
    modelName: "AuthAccount",
  },
  verification: {
    modelName: "AuthVerification",
  },
  plugins: [nextCookies()],
});

export async function getRequestSession(request: Request) {
  return auth.api.getSession({
    headers: request.headers,
  });
}

export async function requireRequestSession(request: Request) {
  const session = await getRequestSession(request);
  if (!session) {
    return {
      session: null,
      response: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      ),
    } as const;
  }
  return { session, response: null } as const;
}
