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
     To deliver leads for real: create a free form at https://formspree.io, then paste its
     endpoint below, e.g. "https://formspree.io/f/abcdwxyz". Leave it "" to keep demo mode
     (validates + confirms on screen but does NOT send). Netlify Forms users: add the
     `netlify` attribute to the <form> tag in index.html instead and leave this as "". */
  var FORM_ENDPOINT = "";

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

      function onSuccess() {
        note.textContent = "Thank you! Your request is in. We'll reach out within 1 business day. 🇺🇸";
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

      fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { "Accept": "application/json" },
        body: new FormData(form)
      }).then(function (res) {
        if (res.ok) onSuccess();
        else throw new Error("Bad response");
      }).catch(function () {
        note.textContent = "Something went wrong. Please call (760) 271-5998 or email us directly.";
        note.className = "contact__form-note error";
      }).finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }
})();
