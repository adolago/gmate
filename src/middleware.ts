import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];
const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

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
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) =>
    Boolean(request.cookies.get(name)?.value)
  );

  if (isPublic(pathname)) {
    // If authenticated and visiting login/signup, redirect to dashboard
    if (PUBLIC_PATHS.includes(pathname) && hasSessionCookie) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSessionCookie) {
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
