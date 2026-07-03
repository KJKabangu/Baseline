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
    packageSelect.classList.remove("flash");
    void packageSelect.offsetWidth; // restart the animation if clicked again before it finishes
    packageSelect.classList.add("flash");
    document.getElementById("book").scrollIntoView({ behavior: "smooth" });
    document.getElementById("name").focus({ preventScroll: true });
  });
});
packageSelect.addEventListener("animationend", () => packageSelect.classList.remove("flash"));

// Booking form: submit via fetch so the visitor gets an inline status instead of leaving the page
const bookingForm = document.getElementById("bookingForm");
const formStatus = document.getElementById("formStatus");

// Inline validation: browser default tooltips are suppressed via novalidate
// on the form (index.html); this renders styled messages next to each field.
function fieldErrorMessage(field) {
  if (field.validity.valueMissing) return "This field is required.";
  if (field.validity.typeMismatch) return "Enter a valid email address.";
  return field.validationMessage;
}

function showFieldError(field, message) {
  field.classList.add("invalid");
  let err = field.parentElement.querySelector(".field-error");
  if (!err) {
    err = document.createElement("p");
    err.className = "field-error";
    field.insertAdjacentElement("afterend", err);
  }
  err.textContent = message;
}

function clearFieldError(field) {
  field.classList.remove("invalid");
  const err = field.parentElement.querySelector(".field-error");
  if (err) err.remove();
}

const requiredFields = bookingForm.querySelectorAll("[required]");
requiredFields.forEach((field) => {
  field.addEventListener("input", () => clearFieldError(field));
  field.addEventListener("change", () => clearFieldError(field));
});

bookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = bookingForm.querySelector(".btn-submit");

  let firstInvalid = null;
  requiredFields.forEach((field) => {
    if (field.checkValidity()) {
      clearFieldError(field);
    } else {
      showFieldError(field, fieldErrorMessage(field));
      firstInvalid = firstInvalid || field;
    }
  });
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  formStatus.textContent = "Sending...";
  formStatus.className = "form-status";
  submitBtn.disabled = true;
  submitBtn.classList.add("is-loading");

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
    submitBtn.classList.remove("is-loading");
  }
});
