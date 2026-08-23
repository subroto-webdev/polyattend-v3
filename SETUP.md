# সংশোধন: এবার তোমার আসল config file ব্যবহার করা হয়েছে

## আগের ভুল যা ঠিক করলাম

তুমি আসল project folder-এর screenshot পাঠানোর পর বুঝলাম, তোমার project-এ আগে থেকেই
`tailwind.config.js`, `jsconfig.json`, `postcss.config.js`, `capacitor.config.json`
ছিল — আমাকে শুধু `src/` zip করে পাঠানো হয়েছিল বলে আমি এগুলো দেখতে পাইনি, আর
নিজে থেকে সাধারণ default version বানিয়ে ফেলেছিলাম।

**সবচেয়ে গুরুত্বপূর্ণ ভুল:** আমার বানানো `tailwind.config.js`-এ তোমার আসল brand
color (`#10b981` ইত্যাদি), custom shadow (`shadow-brand`), animation (`fade-in`,
`scale-in`) কিছুই ছিল না। ওটা ব্যবহার করলে পুরো site-এর design/color scheme
হারিয়ে যেত।

**এখন ঠিক করা হয়েছে:** তুমি upload করা আসল ফাইলগুলোই ব্যবহার করা হয়েছে —
`tailwind.config.js`, `jsconfig.json`, `postcss.config.js`, `capacitor.config.json`,
`.gitignore`, `.env.example` — কোনোটাই নতুন করে বানানো হয়নি।

আবার সত্যিই build করে verify করেছি — এবার generated CSS-এ তোমার আসল brand color
(`#10b981`), `shadow-brand`, `fadeIn` animation সব আছে তা নিশ্চিত করে দেখেছি।

## এই zip-এ কী কী তোমার আসল ফাইল, আর কী কী edited

| ফাইল | Status |
|---|---|
| `src/` | তোমার আসল কোড + আগের security/Next-16 fix (rate limiting, params fix ইত্যাদি) |
| `tailwind.config.js` | **তোমার আসল ফাইল, অপরিবর্তিত** |
| `jsconfig.json` | **তোমার আসল ফাইল, অপরিবর্তিত** |
| `postcss.config.js` | **তোমার আসল ফাইল, অপরিবর্তিত** (এটা আমারটার সাথে already same ছিল) |
| `capacitor.config.json` | **তোমার আসল ফাইল, অপরিবর্তিত** |
| `.env.example` | **তোমার আসল ফাইল, অপরিবর্তিত** |
| `.gitignore` | তোমার আসল ফাইল + ১ লাইন যোগ (`README.md` বাদ দেওয়া — নিচে দেখো কেন) |
| `next.config.mjs` | **edited** — তোমার আসল ফাইলের উপর ভিত্তি করে, Next 16-এর জন্য জরুরি ফিক্স সহ |
| `package.json` | **edited** — তোমার আসল ফাইলের উপর ভিত্তি করে, version bump + `--webpack` build/dev flag সহ |

## ⚠️ আরেকটা ফিক্স — `npm run dev` এ Turbopack error

তুমি `npm run dev` চালিয়ে এই error পেয়েছিলে:
```
ERROR: This build is using Turbopack, with a `webpack` config and no `turbopack` config.
```

কারণ: আমি আগে শুধু `build` script-এ `--webpack` flag বসিয়েছিলাম, `dev` script-এ না।
Next.js 16-এ `next dev` default-ভাবে Turbopack ব্যবহার করে, যেটা `next-pwa`-র webpack
config-এর সাথে সংঘর্ষে যায় — build-এর মতোই dev-এও একই সমস্যা। এখন `dev` script-ও
`next dev --webpack` করে দেওয়া হয়েছে, আর সত্যিই `npm run dev` চালিয়ে server ঠিকভাবে
start হতে দেখেছি (verified, শুধু build না)।

## ⚠️ জরুরি নিরাপত্তা সতর্কতা — তোমার `README.md` নিয়ে

তোমার uploaded `README.md`-এ এই লেখা আছে:
```
POLY2024TEACHER@SECRET
```

এটা তোমার `.env.local`-এর `TEACHER_SECRET_KEY`-এর মতোই মনে হচ্ছে — মানে এটা একটা
real secret (teacher registration-এ ব্যবহৃত), যেটা plaintext-এ `README.md`-তে বসানো
আছে। যদি এই repo কখনো GitHub-এ push করা হয় (public হোক বা private, private
repo-ও leak হতে পারে collaborator বাড়লে), **এই secret সবার কাছে দেখা যাবে।**

আমি `.gitignore`-এ `README.md` যোগ করে দিয়েছি যাতে এটা আর commit না হয় — কিন্তু
এটা শুধু ভবিষ্যতের জন্য protection। **তোমাকে যা করতে হবে:**

1. যদি এই repo আগে থেকেই কোনো git history-তে push করা থাকে (এমনকি private repo-তেও),
   ধরে নাও `POLY2024TEACHER@SECRET` leak হয়ে গেছে — **এই secret বদলে ফেলো।**
2. `.env.local`-এ নতুন `TEACHER_SECRET_KEY` বসাও।
3. `README.md`-এর ভেতরের actual secret সরিয়ে ফেলো (শুধু `.env.local`-এ রাখো, README-তে না)।

## Setup করার ধাপ (আগের মতোই)

```bash
rm -rf node_modules package-lock.json .next
npm install
npm run build
```

এবার real config দিয়ে সত্যিই build করে দেখেছি — সফল হয়েছে, real brand
color/shadow/animation compiled CSS-এ পাওয়া গেছে।

```bash
npm run dev
```
দিয়ে হাতে সব পেজ ঘুরে test করে নিয়ে তারপর deploy করো।

বাকি সব detail (Next 16 upgrade, security fix লিস্ট) → `README-SECURITY-FIXES.md` দেখো।
