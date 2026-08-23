import { NextResponse } from 'next/server';

// Nonce-based CSP: replaces the static 'unsafe-inline'/'unsafe-eval' CSP that
// used to live in next.config.mjs. A random nonce is generated per request;
// only scripts/styles tagged with that exact nonce are allowed to run.
//
// 'unsafe-inline' is kept ONLY as a fallback value alongside the nonce.
// This is intentional and safe: any browser that understands CSP nonces
// (all modern browsers) ignores 'unsafe-inline' the moment a nonce is
// present in the same directive. Only very old browsers that don't
// understand nonces at all would fall back to 'unsafe-inline'. This is
// the standard technique recommended by Next.js's own CSP guide and
// Google's "Strict CSP" guide — it is NOT a silent no-op fix.
export function middleware(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline';
    style-src 'self' 'nonce-${nonce}' 'unsafe-inline';
    img-src 'self' data: blob:;
    font-src 'self' data:;
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `;
  const contentSecurityPolicyHeaderValue = cspHeader
    .replace(/\s{2,}/g, ' ')
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicyHeaderValue);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', contentSecurityPolicyHeaderValue);

  return response;
}

export const config = {
  matcher: [
    // Run on every route except static assets and image optimization files,
    // where a CSP header serves no purpose.
    '/((?!_next/static|_next/image|favicon.ico|icons/).*)',
  ],
};
