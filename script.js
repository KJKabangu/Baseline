document.getElementById("year").textContent = new Date().getFullYear();

const navToggle = document.getElementById("navToggle");
const siteNav = document.getElementById("siteNav");

navToggle.addEventListener("click", () => {
  const isOpen = siteNav.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

siteNav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    siteNav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  });
});

// "Book this" buttons on service cards: jump to the form with the package preselected
const packageSelect = document.getElementById("package");
document.querySelectorAll(".btn-book").forEach((btn) => {
  btn.addEventListener("click", () => {
    packageSelect.value = btn.dataset.package;
    document.getElementById("book").scrollIntoView({ behavior: "smooth" });
    document.getElementById("name").focus({ preventScroll: true });
  });
});

// Booking form: submit via fetch so the visitor gets an inline status instead of leaving the page
const bookingForm = document.getElementById("bookingForm");
const formStatus = document.getElementById("formStatus");

bookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = bookingForm.querySelector(".btn-submit");
  formStatus.textContent = "Sending...";
  formStatus.className = "form-status";
  submitBtn.disabled = true;

  const formData = new FormData(bookingForm);

  // Best-effort mirror into Supabase so it shows up in the admin dashboard.
  // Formspree (below) remains the source of truth for the visitor-facing
  // success/failure message, so a Supabase outage never blocks a booking.
  if (!formData.get("company_site")) {
    import("./supabase-client.js")
      .then(({ supabase }) =>
        supabase.from("bookings").insert({
          name: formData.get("name"),
          email: formData.get("email"),
          business: formData.get("business") || null,
          package: formData.get("package"),
          timeline: formData.get("timeline"),
          details: formData.get("details"),
        })
      )
      .catch((err) => console.error("Supabase booking insert failed:", err));
  }

  try {
    const response = await fetch(bookingForm.action, {
      method: "POST",
      body: formData,
      headers: { Accept: "application/json" },
    });

    if (response.ok) {
      formStatus.textContent = "Request sent — I'll follow up by email shortly.";
      formStatus.className = "form-status ok";
      bookingForm.reset();
    } else {
      formStatus.textContent = "Something went wrong. Email kjkabangu8@gmail.com directly instead.";
      formStatus.className = "form-status err";
    }
  } catch {
    formStatus.textContent = "Something went wrong. Email kjkabangu8@gmail.com directly instead.";
    formStatus.className = "form-status err";
  } finally {
    submitBtn.disabled = false;
  }
});
