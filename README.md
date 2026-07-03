# Baseline

Freelance business site for Kindja Kabangu ("Build + Audit") — custom ops tools and security audits for local trade and logistics businesses. Visitors can book a service directly from the site.

Static HTML/CSS/JS, no build step or framework, plus two small Vercel serverless functions under `/api` that exist solely to talk to Stripe (see [Payments](#payments-stripe-deposits) below) — everything else is served as-is with no server.

## Booking

- Service request form posts to Formspree: `https://formspree.io/f/xlgyoljd`.
- "Book a call" button links to Calendly: `https://calendly.com/kjkabangu8/30min`.

## Run locally

Open `index.html` directly in a browser, or serve it:

```bash
npx serve .
```

## Deploy

1. Push this repo to GitHub.
2. In Vercel, "Add New Project" → import the GitHub repo.
3. Framework preset: **Other** (static site). No build command or output directory needed — Vercel will serve the root as-is.
4. Deploy. Vercel serves `/admin/index.html` at `/admin/` and `/portal/index.html` at `/portal/` automatically — no extra config.

## Backend (Supabase)

Admin dashboard (`/admin/`) and client portal (`/portal/`) run on Supabase (Postgres + Auth). The public booking form still posts to Formspree as the source of truth for the visitor-facing success message; it also mirrors each submission into Supabase (best-effort, fire-and-forget) so it shows up in the admin dashboard.

**One-time setup:**

1. Create a project at [supabase.com](https://supabase.com).
2. Project Settings → API → copy the **Project URL** and **anon public key** into [`supabase-client.js`](supabase-client.js), replacing the `REPLACE_WITH_...` placeholders. These two values are **meant to be public** and are safe to commit — every table has Row Level Security enabled (see `supabase/schema.sql`), so the anon key only grants what the RLS policies allow. **The `service_role` key on that same page must never be pasted anywhere in this repo.**
3. SQL Editor → New query → paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) → Run. Confirm all four tables (`profiles`, `bookings`, `availability_slots`, `invoices`) show the RLS shield icon in Table Editor.
4. Authentication → Sign In / Providers → Email: keep enabled, magic link on. Turn **off** "Allow new users to sign up" — invited users can still sign in via magic link, but strangers can't self-register.
5. Authentication → URL Configuration → Site URL = your production domain. Add Redirect URLs for `https://<domain>/admin/`, `https://<domain>/portal/`, and `http://localhost:*/**` for local testing.
6. Authentication → Users → Invite user → your own email. Accepting the invite creates the `auth.users` row, which a trigger mirrors into `profiles`.
7. In the SQL Editor, run the one-line `update public.profiles set role = 'admin' where lower(email) = '...'` statement at the bottom of `supabase/schema.sql` for your own email. This is the only manual role edit ever needed.

**Per-client onboarding (ongoing):** when accepting a booking, invite that client's email the same way (Authentication → Users → Invite user) so they can sign into `/portal/`.

**Out of scope for v1:** in-app client invitations (needs the `service_role` key server-side, same mechanism the Stripe functions below now use, but no UI has been built for it), rate limiting/CAPTCHA on the public booking insert (honeypot field only).

## Payments (Stripe deposits)

When admin creates an invoice, a `deposit_amount` column in Postgres (a **generated column**, always exactly 25% of `amount`) is what actually gets charged — the browser never gets to supply or influence that number. Once an invoice's status is `sent`, the client can pay the deposit from `/portal/`, which redirects to a Stripe-hosted Checkout page. Two serverless functions make this possible:

- `/api/create-checkout-session` — takes only an `invoiceId` from the client, re-reads the deposit amount server-side (as the calling user, so the same RLS policy that already governs invoice reads enforces ownership), and creates the Stripe Checkout Session.
- `/api/stripe-webhook` — Stripe calls this after a successful payment; it's the authoritative place `deposit_paid` gets flipped to `true` (not the browser redirect back to the portal, which can be interrupted).

The full invoice `status` (draft/sent/paid) is still set manually by the admin and is unrelated to the deposit — this only automates the 25% deposit, not full project payment.

**One-time setup, in addition to the Supabase steps above:**

1. Create an account at [stripe.com](https://stripe.com) (test mode is fine to start).
2. Developers → API keys → copy the **Secret key**.
3. In Vercel → Project Settings → Environment Variables, add (server-side only — none of these go in any file in this repo):
   - `SUPABASE_URL` — same Project URL used in `supabase-client.js`.
   - `SUPABASE_ANON_KEY` — same anon key used in `supabase-client.js`.
   - `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Project Settings → API. This is the one key that must never be committed; it only ever lives in Vercel's environment variable store.
   - `STRIPE_SECRET_KEY` — from Stripe step 2.
   - `SITE_URL` — your production domain, e.g. `https://baseline-xyz.vercel.app`, used to build the Stripe success/cancel redirect URLs.
4. Redeploy (env var changes need a new deployment to take effect).
5. Stripe dashboard → Developers → Webhooks → Add endpoint → URL: `https://<domain>/api/stripe-webhook`, event: `checkout.session.completed`. Copy the **Signing secret** it generates and add it to Vercel as `STRIPE_WEBHOOK_SECRET`, then redeploy again.
6. Test with a [Stripe test card](https://docs.stripe.com/testing) (`4242 4242 4242 4242`, any future date/CVC) against an invoice with status `sent` before switching the Stripe account out of test mode.
