// Vercel serverless function: POST /api/stripe-webhook
// Configured as a webhook endpoint in the Stripe dashboard, listening for
// checkout.session.completed. This is the authoritative source for marking
// a deposit paid -- never trust the browser redirect back to success_url
// alone, since the visitor can close the tab before it loads.
const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports.config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const signature = req.headers["stripe-signature"];
  const rawBody = await readRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const invoiceId = session.metadata && session.metadata.invoice_id;

    if (invoiceId) {
      const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await supabaseAdmin
        .from("invoices")
        .update({
          deposit_paid: true,
          stripe_payment_intent_id: session.payment_intent,
        })
        .eq("id", invoiceId);

      if (error) console.error("stripe-webhook: failed to mark deposit paid:", error);
    }
  }

  res.status(200).json({ received: true });
};
