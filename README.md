# Baseline

Freelance business site for Kindja Kabangu ("Build + Audit") — custom ops tools and security audits for local trade and logistics businesses. Visitors can book a service directly from the site.

Static HTML/CSS/JS, no build step or framework.

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

Admin dashboard (`/admin/`) and client portal (`/portal/`) run on Supabase (Postgres + Auth), no server/serverless functions. The public booking form still posts to Formspree as the source of truth for the visitor-facing success message; it also mirrors each submission into Supabase (best-effort, fire-and-forget) so it shows up in the admin dashboard.

**One-time setup:**

1. Create a project at [supabase.com](https://supabase.com).
2. Project Settings → API → copy the **Project URL** and **anon public key** into [`supabase-client.js`](supabase-client.js), replacing the `REPLACE_WITH_...` placeholders. These two values are **meant to be public** and are safe to commit — every table has Row Level Security enabled (see `supabase/schema.sql`), so the anon key only grants what the RLS policies allow. **The `service_role` key on that same page must never be pasted anywhere in this repo.**
3. SQL Editor → New query → paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) → Run. Confirm all four tables (`profiles`, `bookings`, `availability_slots`, `invoices`) show the RLS shield icon in Table Editor.
4. Authentication → Sign In / Providers → Email: keep enabled, magic link on. Turn **off** "Allow new users to sign up" — invited users can still sign in via magic link, but strangers can't self-register.
5. Authentication → URL Configuration → Site URL = your production domain. Add Redirect URLs for `https://<domain>/admin/`, `https://<domain>/portal/`, and `http://localhost:*/**` for local testing.
6. Authentication → Users → Invite user → your own email. Accepting the invite creates the `auth.users` row, which a trigger mirrors into `profiles`.
7. In the SQL Editor, run the one-line `update public.profiles set role = 'admin' where lower(email) = '...'` statement at the bottom of `supabase/schema.sql` for your own email. This is the only manual role edit ever needed.

**Per-client onboarding (ongoing):** when accepting a booking, invite that client's email the same way (Authentication → Users → Invite user) so they can sign into `/portal/`.

**Out of scope for v1:** in-app client invitations (needs the `service_role` key → needs a server), rate limiting/CAPTCHA on the public booking insert (honeypot field only), and payment collection — invoices are status-tracking only.
