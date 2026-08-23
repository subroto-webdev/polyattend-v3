import withPWA from 'next-pwa';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // DEV-ONLY UI: hides the black "N" dev indicator badge (bottom-left)
  // that Next.js shows during `npm run dev`. This is purely a local
  // development aid (shows route/compile status) — it never appears on
  // the live/deployed site regardless of this setting. Next.js will
  // still show an overlay if there's an actual build or runtime error,
  // so this only removes the routine status badge, not error reporting.
  devIndicators: false,

  // NEXT 16 FIX: `eslint.ignoreDuringBuilds` in next.config.mjs is no
  // longer read by Next.js 16 — confirmed by a real build attempt, which
  // now just warns "Unrecognized key(s)". If you want lint errors to not
  // block `next build`, that behavior now lives with the ESLint config
  // itself / the `next lint` CLI, not here. Removed to avoid the warning;
  // functionally builds were never actually blocked by lint errors even
  // before this (Next only warns, doesn't fail the build for lint issues
  // by default), so removing this key does not change build behavior.

  // pdfkit ke webpack bundling theke bad dewa hocche, karon webpack eta
  // bundle korar somoy .afm font-metric file gulo thikmoto copy kore na
  // (fole runtime e "ENOENT ... Helvetica.afm" error hoy). Ei option
  // pdfkit ke sadharon Node.js require() diye load korte bole, jate
  // node_modules theke sorasori .afm file gulo pora jay.
  //
  // NEXT 15/16 FIX: `experimental.serverComponentsExternalPackages` was
  // renamed to the top-level `serverExternalPackages` starting in
  // Next.js 15 — the old experimental key is rejected ("Unrecognized
  // key(s) in object") and the build fails on Next 15+. Same setting,
  // new location.
  serverExternalPackages: ['pdfkit'],

  // SECURITY: headers applied to every route (pages + API). See inline
  // comments below for why each one is here and any known tradeoffs.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            // Blocks this site from being embedded in an <iframe> on another
            // origin (clickjacking protection).
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            // Stops the browser from "sniffing" a different content type
            // than what the server declared.
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            // Limits how much of this site's URL is sent as the Referer
            // header when a link is followed to another site.
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            // Forces HTTPS for this domain (and subdomains) for a year.
            // Only meaningful once the site is actually served over HTTPS
            // in production.
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            // Disables browser features this app doesn't use. Extend this
            // if a future feature (e.g. QR-code camera scanning via
            // html5-qrcode) needs camera access on that specific route.
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            // Content-Security-Policy: restricts where scripts, styles,
            // images, fonts, etc. can load from.
            //
            // NOTE: 'unsafe-inline'/'unsafe-eval' are kept because Next.js
            // injects inline runtime scripts and some UI libraries rely on
            // inline styles — removing them needs nonce-based CSP wiring
            // (a proxy/middleware generating a per-request nonce) plus
            // testing every page for breakage. Left as a follow-up.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

const withPWAConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

export default withPWAConfig(nextConfig);
