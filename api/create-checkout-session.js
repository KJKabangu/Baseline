// Vercel serverless function: POST /api/create-checkout-session
// Body: { invoiceId }
// Header: Authorization: Bearer <supabase access token>
//
// The deposit amount charged is always read server-side from the invoices
// row (deposit_amount is a generated column, exactly 25% of amount) -- the
// client only ever supplies an invoice id, never an amount. Ownership is
// enforced by querying as the caller (their own JWT), which is subject to
// the same "client reads own sent invoices" RLS policy used everywhere else.
const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    res.status(401).json({ error: "Missing session" });
    return;
  }

  const { invoiceId } = req.body || {};
  if (!invoiceId) {
    res.status(400).json({ error: "Missing invoiceId" });
    return;
  }

  const siteUrl = process.env.SITE_URL || req.headers.origin;

  try {
    const supabaseAsUser = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: invoice, error } = await supabaseAsUser
      .from("invoices")
      .select("id, deposit_amount, deposit_paid, status, description")
      .eq("id", invoiceId)
      .single();

    if (error || !invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    if (invoice.status === "draft") {
      res.status(403).json({ error: "Invoice is not available yet" });
      return;
    }

    if (invoice.deposit_paid) {
      res.status(400).json({ error: "Deposit already paid" });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(Number(invoice.deposit_amount) * 100),
            product_data: {
              name: `Deposit — ${invoice.description || "Baseline project"}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/portal/?payment=success`,
      cancel_url: `${siteUrl}/portal/?payment=cancelled`,
      metadata: { invoice_id: invoice.id },
    });

    // Clients cannot UPDATE invoices themselves (select-only RLS policy), so
    // recording the session id needs the elevated service_role key.
    const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await supabaseAdmin
      .from("invoices")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", invoice.id);

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session failed:", err);
    res.status(500).json({ error: "Could not start payment. Try again shortly." });
  }
};
