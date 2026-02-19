import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/signup"];

function isPublic(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    // If authenticated and visiting login/signup, redirect to dashboard
    if (PUBLIC_PATHS.includes(pathname)) {
      const token = request.cookies.get("session")?.value;
      if (token) {
        const session = await verifyToken(token);
        if (session) {
          return NextResponse.redirect(new URL("/", request.url));
        }
      }
    }
    return NextResponse.next();
  }

  const token = request.cookies.get("session")?.value;
  if (!token) {
    return redirectOrReject(request, pathname);
  }

  const session = await verifyToken(token);
  if (!session) {
    return redirectOrReject(request, pathname);
  }

  return NextResponse.next();
}

function redirectOrReject(request: NextRequest, pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
