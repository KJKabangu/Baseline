import { supabase } from "../supabase-client.js";

const loginView = document.getElementById("loginView");
const deniedView = document.getElementById("deniedView");
const dashboardView = document.getElementById("dashboardView");
const whoami = document.getElementById("whoami");
const whoamiEmail = document.getElementById("whoamiEmail");
const signOutBtn = document.getElementById("signOutBtn");

const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginStatus = document.getElementById("loginStatus");

const bookingsBody = document.getElementById("bookingsBody");
const bookingsEmpty = document.getElementById("bookingsEmpty");

const slotForm = document.getElementById("slotForm");
const slotStart = document.getElementById("slotStart");
const slotEnd = document.getElementById("slotEnd");
const slotStatus = document.getElementById("slotStatus");
const slotsBody = document.getElementById("slotsBody");
const slotsEmpty = document.getElementById("slotsEmpty");

const invoiceForm = document.getElementById("invoiceForm");
const invoiceClient = document.getElementById("invoiceClient");
const invoiceBooking = document.getElementById("invoiceBooking");
const invoiceAmount = document.getElementById("invoiceAmount");
const invoiceDue = document.getElementById("invoiceDue");
const invoiceDescription = document.getElementById("invoiceDescription");
const invoiceStatus = document.getElementById("invoiceStatus");
const invoicesBody = document.getElementById("invoicesBody");
const invoicesEmpty = document.getElementById("invoicesEmpty");

const BOOKING_STATUSES = ["new", "accepted", "scheduled", "completed", "declined"];
const INVOICE_STATUSES = ["draft", "sent", "paid"];

let bookingsCache = [];

function showView(view) {
  loginView.hidden = view !== "login";
  deniedView.hidden = view !== "denied";
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

// ---------- auth ----------

async function handleSession(session) {
  if (!session) {
    showView("login");
    return;
  }

  whoamiEmail.textContent = session.user.email;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (error || !profile || profile.role !== "admin") {
    showView("denied");
    return;
  }

  showView("dashboard");
  loadAll();
}

supabase.auth.getSession().then(({ data }) => handleSession(data.session));
supabase.auth.onAuthStateChange((_event, session) => handleSession(session));

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginStatus.textContent = "Sending magic link...";
  loginStatus.className = "form-status";

  const { error } = await supabase.auth.signInWithOtp({
    email: loginEmail.value.trim(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.origin + "/admin/",
    },
  });

  if (error) {
    loginStatus.textContent = error.message;
    loginStatus.className = "form-status err";
  } else {
    loginStatus.textContent = "Check your email for the sign-in link.";
    loginStatus.className = "form-status ok";
  }
});

signOutBtn.addEventListener("click", () => supabase.auth.signOut());

// ---------- load ----------

async function loadAll() {
  await Promise.all([loadBookings(), loadSlots(), loadInvoices(), loadClients()]);
}

// ---------- bookings ----------

async function loadBookings() {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadBookings failed:", error);
    return;
  }

  bookingsCache = data;
  renderBookings(data);
  populateBookingSelect(data);
}

function renderBookings(rows) {
  bookingsBody.innerHTML = "";
  bookingsEmpty.hidden = rows.length > 0;

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.dataset.id = row.id;

    const statusOptions = BOOKING_STATUSES.map(
      (s) => `<option value="${s}" ${s === row.status ? "selected" : ""}>${s}</option>`
    ).join("");

    tr.innerHTML = `
      <td>${fmtDateTime(row.created_at)}</td>
      <td><strong>${escapeHtml(row.name)}</strong><br><span class="dash-dim">${escapeHtml(row.email)}</span></td>
      <td>${escapeHtml(row.business || "—")}</td>
      <td>${escapeHtml(row.package || "—")}</td>
      <td>${escapeHtml(row.timeline || "—")}</td>
      <td class="dash-details">${escapeHtml(row.details || "")}</td>
      <td><select class="booking-status-select" data-id="${row.id}">${statusOptions}</select></td>
      <td><textarea class="booking-notes-input" data-id="${row.id}" rows="2" placeholder="Notes...">${escapeHtml(row.admin_notes || "")}</textarea></td>
    `;
    bookingsBody.appendChild(tr);
  }
}

bookingsBody.addEventListener("change", async (e) => {
  if (!e.target.classList.contains("booking-status-select")) return;
  const id = e.target.dataset.id;
  const { error } = await supabase.from("bookings").update({ status: e.target.value }).eq("id", id);
  if (error) {
    console.error("update booking status failed:", error);
    return;
  }
  loadBookings();
});

bookingsBody.addEventListener(
  "blur",
  async (e) => {
    if (!e.target.classList.contains("booking-notes-input")) return;
    const id = e.target.dataset.id;
    const { error } = await supabase.from("bookings").update({ admin_notes: e.target.value }).eq("id", id);
    if (error) console.error("update booking notes failed:", error);
  },
  true
);

// ---------- slots ----------

async function loadSlots() {
  const { data, error } = await supabase
    .from("availability_slots")
    .select("*, bookings(name, email)")
    .order("start_time", { ascending: true });

  if (error) {
    console.error("loadSlots failed:", error);
    return;
  }

  renderSlots(data);
}

function renderSlots(rows) {
  slotsBody.innerHTML = "";
  slotsEmpty.hidden = rows.length > 0;

  for (const row of rows) {
    const tr = document.createElement("tr");
    const bookedBy = row.bookings ? `${escapeHtml(row.bookings.name)} (${escapeHtml(row.bookings.email)})` : "—";
    tr.innerHTML = `
      <td>${fmtDateTime(row.start_time)}</td>
      <td>${fmtDateTime(row.end_time)}</td>
      <td>${row.is_booked ? "Booked" : "Open"}</td>
      <td>${bookedBy}</td>
      <td>${row.is_booked ? "" : `<button type="button" class="btn btn-ghost btn-small slot-delete-btn" data-id="${row.id}">Delete</button>`}</td>
    `;
    slotsBody.appendChild(tr);
  }
}

slotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  slotStatus.textContent = "Adding...";
  slotStatus.className = "form-status";

  const start = new Date(slotStart.value);
  const end = new Date(slotEnd.value);

  if (!(end > start)) {
    slotStatus.textContent = "End time must be after start time.";
    slotStatus.className = "form-status err";
    return;
  }

  const { error } = await supabase.from("availability_slots").insert({
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  });

  if (error) {
    slotStatus.textContent = error.message;
    slotStatus.className = "form-status err";
    return;
  }

  slotStatus.textContent = "Slot added.";
  slotStatus.className = "form-status ok";
  slotForm.reset();
  loadSlots();
});

slotsBody.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("slot-delete-btn")) return;
  const id = e.target.dataset.id;
  const { error } = await supabase.from("availability_slots").delete().eq("id", id);
  if (error) {
    console.error("delete slot failed:", error);
    return;
  }
  loadSlots();
});

// ---------- invoices ----------

async function loadClients() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "client")
    .order("email", { ascending: true });

  if (error) {
    console.error("loadClients failed:", error);
    return;
  }

  invoiceClient.innerHTML = data
    .map((c) => `<option value="${c.id}">${escapeHtml(c.full_name || c.email)}</option>`)
    .join("");
}

function populateBookingSelect(rows) {
  const options = rows
    .map((b) => `<option value="${b.id}">${escapeHtml(b.name)} — ${escapeHtml(b.package || "")}</option>`)
    .join("");
  invoiceBooking.innerHTML = `<option value="">— none —</option>${options}`;
}

async function loadInvoices() {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, profiles(email, full_name)")
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
    const clientLabel = row.profiles ? row.profiles.full_name || row.profiles.email : "—";
    const statusOptions = INVOICE_STATUSES.map(
      (s) => `<option value="${s}" ${s === row.status ? "selected" : ""}>${s}</option>`
    ).join("");

    tr.innerHTML = `
      <td>${escapeHtml(clientLabel)}</td>
      <td>$${Number(row.amount).toFixed(2)}</td>
      <td>${escapeHtml(row.description || "—")}</td>
      <td>${row.due_date || "—"}</td>
      <td><select class="invoice-status-select" data-id="${row.id}">${statusOptions}</select></td>
    `;
    invoicesBody.appendChild(tr);
  }
}

invoiceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  invoiceStatus.textContent = "Creating...";
  invoiceStatus.className = "form-status";

  const { error } = await supabase.from("invoices").insert({
    client_id: invoiceClient.value,
    booking_id: invoiceBooking.value || null,
    amount: invoiceAmount.value,
    description: invoiceDescription.value || null,
    due_date: invoiceDue.value || null,
  });

  if (error) {
    invoiceStatus.textContent = error.message;
    invoiceStatus.className = "form-status err";
    return;
  }

  invoiceStatus.textContent = "Invoice created.";
  invoiceStatus.className = "form-status ok";
  invoiceForm.reset();
  loadInvoices();
});

invoicesBody.addEventListener("change", async (e) => {
  if (!e.target.classList.contains("invoice-status-select")) return;
  const id = e.target.dataset.id;
  const { error } = await supabase.from("invoices").update({ status: e.target.value }).eq("id", id);
  if (error) {
    console.error("update invoice status failed:", error);
    return;
  }
  loadInvoices();
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
