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
4. Deploy.
