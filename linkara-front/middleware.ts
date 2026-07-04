import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "linkara_token";
const PROTECTED_PATHS = ["/dashboard", "/organizations", "/workflows", "/runs"];
const AUTH_PATHS = ["/login", "/signup"];

export function middleware(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const isAuthPage = AUTH_PATHS.includes(pathname);

  if (isProtected && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/organizations/:path*", "/workflows/:path*", "/runs/:path*", "/login", "/signup"],
};
