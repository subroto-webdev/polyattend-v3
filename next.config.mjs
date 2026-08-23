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

  // pdfkit ke webpack bundling theke bad dewa hocche, karon webpack eta
  // bundle korar somoy .afm font-metric file gulo thikmoto copy kore na
  // (fole runtime e "ENOENT ... Helvetica.afm" error hoy). Ei option
  // pdfkit ke sadharon Node.js require() diye load korte bole, jate
  // node_modules theke sorasori .afm file gulo pora jay.
  serverExternalPackages: ['pdfkit'],

  // SECURITY: headers applied to every route (pages + API).
  // NOTE: Content-Security-Policy is now set in middleware.js instead of
  // here, because CSP needs a fresh per-request nonce (nonce-based CSP —
  // see middleware.js for details on why 'unsafe-inline'/'unsafe-eval'
  // were removed). Keeping a second static CSP here would cause the
  // browser to enforce BOTH headers as an intersection, which can break
  // things in confusing ways — so CSP lives in exactly one place now.
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
            // Disables browser features this app doesn't use. NOTE: if
            // QR-code camera scanning (html5-qrcode) stops being able to
            // access the camera, this is the line to loosen for that
            // specific route (e.g. camera=(self)).
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
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
