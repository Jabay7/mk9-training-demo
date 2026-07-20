/* =========================================================
   MK9 TRAINING — interactions
   ========================================================= */
(function () {
  "use strict";

  /* ---- Current year in footer ---- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---- Analytics helper (safe no-op until GA4 / Meta Pixel is configured) ---- */
  function track(name, params) {
    try { if (typeof window.gtag === "function") window.gtag("event", name, params || {}); } catch (e) {}
    try { if (typeof window.fbq === "function") window.fbq("trackCustom", name, params || {}); } catch (e) {}
  }

  /* ---- Track CTA + phone clicks (conversion signals) ---- */
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (href.indexOf("tel:") === 0) { track("phone_click", { phone: href.replace("tel:", "") }); return; }
    if (a.classList.contains("btn--primary") || a.classList.contains("topbar__cta") ||
        a.classList.contains("sticky-cta") || a.classList.contains("nav__cta") || href === "#contact") {
      track("cta_click", { label: (a.textContent || "").trim().slice(0, 60) });
    }
  }, { passive: true });

  /* ---- Nav background on scroll ---- */
  var nav = document.getElementById("nav");
  var stickyCta = document.getElementById("stickyCta");
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (nav) nav.classList.toggle("scrolled", y > 20);
    if (stickyCta) stickyCta.classList.toggle("show", y > 600);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu ---- */
  var toggle = document.getElementById("navToggle");
  var menu = document.getElementById("mobileMenu");
  function setMenu(open) {
    if (!toggle || !menu) return;
    toggle.classList.toggle("open", open);
    menu.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = open ? "hidden" : "";
  }
  if (toggle) toggle.addEventListener("click", function () {
    setMenu(!menu.classList.contains("open"));
  });
  if (menu) menu.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function () { setMenu(false); });
  });

  /* ---- Scroll reveal ---- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---- Animated stat counters ---- */
  var counters = document.querySelectorAll(".stat__num[data-count]");
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var prefix = el.getAttribute("data-prefix") || "";
    var suffix = el.getAttribute("data-suffix") || "";
    var dur = 1400, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = prefix + target + suffix;
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { animateCount(e.target); co.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { co.observe(el); });
  }

  /* ---- Single-open FAQ (accordion) ---- */
  var faqItems = document.querySelectorAll(".faq__item");
  faqItems.forEach(function (item) {
    item.addEventListener("toggle", function () {
      if (item.open) {
        faqItems.forEach(function (other) {
          if (other !== item) other.removeAttribute("open");
        });
      }
    });
  });

  /* ---- Lead form (validation + delivery) ----
     Delivery runs through FormSubmit, which needs no account. Submissions are emailed
     to the address in the endpoint below.

     NOTE: the very first submission triggers a one-time activation email to that address.
     Until someone clicks the link in it, submissions are accepted but NOT forwarded.

     Optional hardening: once activated, FormSubmit issues a random alias. Swapping the
     address here for "https://formsubmit.co/ajax/<alias>" keeps the inbox out of the
     page source. Setting this back to "" restores demo mode (confirms but never sends). */
  var FORM_ENDPOINT = "https://formsubmit.co/ajax/cali@trainwithmk9.com";

  /* Primary destination: the Apps Script lead tracker, which logs the submission to
     the spreadsheet, books a follow-up on the calendar, and emails an alert. Paste
     its web app URL here once deployed (it ends in /exec) — see automation/README.md.
     While this is "", submissions go straight to FORM_ENDPOINT above, which only
     emails. FORM_ENDPOINT stays wired up either way as the fallback, so a tracker
     outage costs a duplicate email at worst rather than a lost enquiry. */
  var TRACKER_ENDPOINT = "https://script.google.com/macros/s/AKfycby7DvKedtDkCiv99QkjczzA3_TY5tBeDRsSVQXOuEA3wjZphhvMvyEM-JVrm_w4JYYQ/exec";

  /* Shown both on a real success and on a honeypot hit, so the two must stay
     identical — any difference between them tells a bot which field is the trap. */
  var SUCCESS_MESSAGE = "Thank you! We've got your request and will be in contact " +
    "with you shortly to set up your free session.";

  /* Format the phone field as it is typed, so the tracker, the alert email and the
     click-to-call link all get (760) 271-5998 rather than a run of ten digits.
     Formatting here rather than on submit means the visitor sees it too, which is
     also the moment a mistyped number is easiest to spot. */
  var phoneField = document.getElementById("phone");
  if (phoneField) {
    phoneField.addEventListener("input", function () {
      var caretAtEnd = phoneField.selectionStart === phoneField.value.length;
      var d = phoneField.value.replace(/\D/g, "");
      if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);  // tolerate a leading 1
      d = d.slice(0, 10);

      var out = d;
      if (d.length > 6) out = "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
      else if (d.length > 3) out = "(" + d.slice(0, 3) + ") " + d.slice(3);
      else if (d.length > 0) out = "(" + d;

      phoneField.value = out;
      // Only chase the caret to the end when it was already there, so editing
      // mid-number does not yank the cursor away.
      if (caretAtEnd) phoneField.setSelectionRange(out.length, out.length);
    });
  }

  var form = document.getElementById("leadForm");
  var note = document.getElementById("formNote");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.querySelector("#name");
      var email = form.querySelector("#email");
      var ok = true;

      [name, email].forEach(function (f) {
        var bad = !f.value.trim() || (f.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.value));
        f.classList.toggle("invalid", bad);
        if (bad) ok = false;
      });

      if (!ok) {
        note.textContent = "Please add your name and a valid email so we can reach you.";
        note.className = "contact__form-note error";
        return;
      }

      /* Spam trap. FormSubmit does not enforce _honey on its /ajax/ endpoint (confirmed by
         testing: submissions with the field filled were still delivered), so the honeypot
         is enforced here instead. A bot that fills every field sees the normal confirmation
         and nothing is sent. Deliberately does not call onSuccess, so fake submissions stay
         out of the conversion tracking. */
      var honey = form.querySelector('[name="_honey"]');
      if (honey && honey.value) {
        note.textContent = SUCCESS_MESSAGE;
        note.className = "contact__form-note success";
        form.reset();
        return;
      }

      function onSuccess() {
        note.textContent = SUCCESS_MESSAGE;
        note.className = "contact__form-note success";
        track("generate_lead", {
          program: (form.querySelector("#program") || {}).value || "",
          first_responder: (form.querySelector("#service") || {}).value || ""
        });
        form.reset();
      }

      // Demo mode (no endpoint configured): confirm on screen, fire tracking, but don't send.
      if (!FORM_ENDPOINT) { onSuccess(); return; }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      note.textContent = "Sending…";
      note.className = "contact__form-note";

      var payload = new FormData(form);
      payload.append("_subject", "New lead from trainwithmk9.com");
      payload.append("_template", "table");
      payload.append("_captcha", "false");

      /* Both endpoints answer HTTP 200 even when they have not accepted the
         submission, so the response body decides. Trusting res.ok alone is what
         used to report a cheerful success while the lead went nowhere. */
      function post(url) {
        if (!url) return Promise.reject(new Error("no endpoint configured"));
        return fetch(url, {
          method: "POST",
          headers: { "Accept": "application/json" },
          body: payload
        }).then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (res.ok && String(data.success) === "true") return data;
            throw new Error(data.message || "Bad response");
          });
        });
      }

      post(TRACKER_ENDPOINT)
        .catch(function () { return post(FORM_ENDPOINT); })
        .then(onSuccess)
        .catch(function () {
          note.textContent = "Something went wrong. Please call (760) 271-5998 or email cali@trainwithmk9.com.";
          note.className = "contact__form-note error";
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }
})();
