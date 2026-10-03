import { NextRequest, NextResponse } from "next/server";
import { auth0, missingAuthConfiguration } from "@/lib/auth0";

export async function proxy(request: NextRequest) {
  if (missingAuthConfiguration().length) {
    if (request.nextUrl.pathname.startsWith("/auth/"))
      return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  return auth0().middleware(request);
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image|sitemap.xml|robots.txt).*)",
  ],
};

