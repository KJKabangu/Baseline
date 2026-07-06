import { supabase } from "../supabase-client.js";

const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const whoami = document.getElementById("whoami");
const whoamiEmail = document.getElementById("whoamiEmail");
const signOutBtn = document.getElementById("signOutBtn");

const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginStatus = document.getElementById("loginStatus");
const loginSent = document.getElementById("loginSent");
const sentEmail = document.getElementById("sentEmail");
const resendBtn = document.getElementById("resendBtn");
const changeEmailBtn = document.getElementById("changeEmailBtn");
const resendStatus = document.getElementById("resendStatus");

const bookingsList = document.getElementById("bookingsList");
const bookingsEmpty = document.getElementById("bookingsEmpty");

const invoicesBody = document.getElementById("invoicesBody");
const invoicesEmpty = document.getElementById("invoicesEmpty");
const paymentBanner = document.getElementById("paymentBanner");

let currentUserId = null;

function showView(view) {
  loginView.hidden = view !== "login";
  dashboardView.hidden = view !== "dashboard";
  whoami.hidden = view === "login";
}

function fmtDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ---------- payment return banner ----------

(function showPaymentBanner() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get("payment");
  if (!payment) return;

  if (payment === "success") {
    paymentBanner.textContent = "Payment received — thank you! It may take a moment to show as paid below.";
    paymentBanner.className = "form-status ok";
  } else if (payment === "cancelled") {
    paymentBanner.textContent = "Payment was cancelled — no charge was made.";
    paymentBanner.className = "form-status err";
  }

  params.delete("payment");
  const cleanUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
  window.history.replaceState({}, "", cleanUrl);
})();

// ---------- auth ----------

async function handleSession(session) {
  if (!session) {
    currentUserId = null;
    resetLoginState();
    showView("login");
    return;
  }

  currentUserId = session.user.id;
  whoamiEmail.textContent = session.user.email;
  showView("dashboard");
  loadAll();
}

supabase.auth.getSession().then(({ data }) => handleSession(data.session));
supabase.auth.onAuthStateChange((_event, session) => handleSession(session));

// Supabase only sends one magic link per address per 60 seconds, so the
// resend button stays disabled with a countdown until a resend can succeed.
const RESEND_COOLDOWN_S = 60;
let resendTimer = null;

function sendMagicLink(email) {
  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.origin + "/portal/",
    },
  });
}

function startResendCooldown() {
  let remaining = RESEND_COOLDOWN_S;
  resendBtn.disabled = true;
  resendBtn.textContent = `Resend link (${remaining}s)`;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(resendTimer);
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend link";
    } else {
      resendBtn.textContent = `Resend link (${remaining}s)`;
    }
  }, 1000);
}

function resetLoginState() {
  clearInterval(resendTimer);
  loginSent.hidden = true;
  loginForm.hidden = false;
  loginStatus.textContent = "";
  loginStatus.className = "form-status";
  resendStatus.textContent = "";
  resendStatus.className = "form-status";
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginStatus.textContent = "Sending magic link...";
  loginStatus.className = "form-status";

  const email = loginEmail.value.trim();
  const { error } = await sendMagicLink(email);

  if (error) {
    loginStatus.textContent = error.message;
    loginStatus.className = "form-status err";
    return;
  }

  loginStatus.textContent = "";
  sentEmail.textContent = email;
  loginForm.hidden = true;
  loginSent.hidden = false;
  startResendCooldown();
});

resendBtn.addEventListener("click", async () => {
  resendBtn.disabled = true;
  resendStatus.textContent = "Resending...";
  resendStatus.className = "form-status";

  const { error } = await sendMagicLink(sentEmail.textContent);

  if (error) {
    resendStatus.textContent = error.message;
    resendStatus.className = "form-status err";
    resendBtn.disabled = false;
  } else {
    resendStatus.textContent = "A new link is on its way.";
    resendStatus.className = "form-status ok";
    startResendCooldown();
  }
});

changeEmailBtn.addEventListener("click", () => {
  resetLoginState();
  loginEmail.focus();
});

signOutBtn.addEventListener("click", () => supabase.auth.signOut());

// ---------- load ----------

function loadAll() {
  loadBookings();
  loadInvoices();
}

// ---------- bookings ----------

async function loadBookings() {
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("*, availability_slots(start_time, end_time)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadBookings failed:", error);
    return;
  }

  let openSlots = [];
  if (bookings.some((b) => b.status === "accepted" && b.availability_slots.length === 0)) {
    const { data, error: slotsError } = await supabase
      .from("availability_slots")
      .select("*")
      .eq("is_booked", false)
      .order("start_time", { ascending: true });
    if (slotsError) {
      console.error("load open slots failed:", slotsError);
    } else {
      openSlots = data;
    }
  }

  renderBookings(bookings, openSlots);
}

function renderBookings(bookings, openSlots) {
  bookingsList.innerHTML = "";
  bookingsEmpty.hidden = bookings.length > 0;

  for (const b of bookings) {
    const card = document.createElement("article");
    card.className = "portal-booking-card";

    const scheduledSlot = b.availability_slots[0];
    let scheduleHtml = "";

    if (scheduledSlot) {
      scheduleHtml = `<p class="portal-slot-confirmed">Scheduled: ${fmtDateTime(scheduledSlot.start_time)} &ndash; ${fmtDateTime(scheduledSlot.end_time)}</p>`;
    } else if (b.status === "accepted") {
      if (openSlots.length === 0) {
        scheduleHtml = `<p class="dash-dim">No open times yet — check back soon.</p>`;
      } else {
        const options = openSlots
          .map(
            (s) =>
              `<button type="button" class="btn btn-ghost btn-small slot-pick-btn" data-booking-id="${b.id}" data-slot-id="${s.id}">${fmtDateTime(s.start_time)}</button>`
          )
          .join("");
        scheduleHtml = `<p class="dash-dim">Pick a time:</p><div class="portal-slot-options">${options}</div>`;
      }
    }

    card.innerHTML = `
      <div class="portal-booking-head">
        <h3>${escapeHtml(b.package || "Booking")}</h3>
        <span class="status-badge status-${b.status}">${b.status}</span>
      </div>
      <p class="dash-dim">Submitted ${fmtDateTime(b.created_at)}</p>
      ${b.details ? `<p>${escapeHtml(b.details)}</p>` : ""}
      ${scheduleHtml}
      <p class="portal-slot-msg" data-booking-id="${b.id}"></p>
    `;
    bookingsList.appendChild(card);
  }
}

bookingsList.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("slot-pick-btn")) return;
  const bookingId = e.target.dataset.bookingId;
  const slotId = e.target.dataset.slotId;
  const msgEl = bookingsList.querySelector(`.portal-slot-msg[data-booking-id="${bookingId}"]`);

  e.target.disabled = true;
  const { data: claimed, error } = await supabase.rpc("claim_slot", {
    p_slot_id: slotId,
    p_booking_id: bookingId,
  });

  if (error) {
    if (msgEl) {
      msgEl.textContent = error.message;
      msgEl.className = "portal-slot-msg err";
    }
    e.target.disabled = false;
    return;
  }

  if (!claimed) {
    if (msgEl) {
      msgEl.textContent = "That slot was just taken — pick another.";
      msgEl.className = "portal-slot-msg err";
    }
    loadBookings();
    return;
  }

  loadBookings();
});

// ---------- invoices ----------

async function loadInvoices() {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("client_id", currentUserId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadInvoices failed:", error);
    return;
  }

  renderInvoices(data);
}

function renderInvoices(rows) {
  invoicesBody.innerHTML = "";
  invoicesEmpty.hidden = rows.length > 0;

  for (const row of rows) {
    const tr = document.createElement("tr");

    let depositCell;
    if (row.deposit_paid) {
      depositCell = `<span class="status-badge status-paid">Paid — $${Number(row.deposit_amount).toFixed(2)}</span>`;
    } else {
      depositCell = `<button type="button" class="btn btn-primary btn-small pay-deposit-btn" data-invoice-id="${row.id}">Pay deposit — $${Number(row.deposit_amount).toFixed(2)}</button>`;
    }

    tr.innerHTML = `
      <td>${escapeHtml(row.description || "—")}</td>
      <td>$${Number(row.amount).toFixed(2)}</td>
      <td>${row.due_date || "—"}</td>
      <td><span class="status-badge status-${row.status}">${row.status}</span></td>
      <td>${depositCell}</td>
    `;
    invoicesBody.appendChild(tr);
  }
}

invoicesBody.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("pay-deposit-btn")) return;
  const btn = e.target;
  const invoiceId = btn.dataset.invoiceId;
  const originalLabel = btn.textContent;

  btn.disabled = true;
  btn.textContent = "Redirecting to payment...";
  paymentBanner.textContent = "";

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ invoiceId }),
    });

    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not start payment.");

    window.location.href = body.url;
  } catch (err) {
    paymentBanner.textContent = err.message;
    paymentBanner.className = "form-status err";
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

// ---------- utils ----------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}
