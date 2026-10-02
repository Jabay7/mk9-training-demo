"""End to end checks for trainwithmk9.com, run in the installed Chrome.

Tests the live site by default. To test a local copy before deploying, serve
the mk9 folder and point MK9_SITE at it (see README.md in this folder).

The contact form is always tested with its network calls intercepted, so no
real lead is ever sent to the business.
"""
import io
import json
import os
import re

import pytest
from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

SITE = os.environ.get("MK9_SITE", "https://trainwithmk9.com/").rstrip("/") + "/"
GL_ARGS = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"]
LEAD_ENDPOINTS = ["**/script.google.com/**", "**/script.googleusercontent.com/**", "**/formsubmit.co/**"]


@pytest.fixture(scope="session")
def pw():
    with sync_playwright() as p:
        yield p


@pytest.fixture(scope="session")
def browser(pw):
    b = pw.chromium.launch(channel="chrome", headless=True, args=GL_ARGS)
    yield b
    b.close()


def open_page(browser, **ctx):
    """New page with console and network logs attached. Lead endpoints are always intercepted."""
    context = browser.new_context(**ctx)
    page = context.new_page()
    page.errors, page.console_errors, page.bad_responses, page.lead_requests = [], [], [], []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and page.console_errors.append(m.text))
    page.on("response", lambda r: r.status >= 400 and page.bad_responses.append(f"{r.status} {r.url}"))
    page.lead_reply = {"tracker": None, "formsubmit": None}

    def lead_route(route):
        url = route.request.url
        page.lead_requests.append(url)
        reply = page.lead_reply["formsubmit" if "formsubmit" in url else "tracker"]
        if reply is None:
            route.abort()
        else:
            route.fulfill(status=200, content_type="application/json", body=json.dumps(reply))

    for pattern in LEAD_ENDPOINTS:
        page.route(pattern, lead_route)
    return page


def goto(page, url=SITE):
    page.goto(url + ("&" if "?" in url else "?") + "test=1", wait_until="load")
    page.wait_for_timeout(1500)


def shot(locator):
    return Image.open(io.BytesIO(locator.screenshot())).convert("RGB")


def diff(a, b):
    return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3


# ---------------------------------------------------------------- basics

def test_page_loads_with_no_errors_and_no_broken_assets(browser):
    page = open_page(browser, viewport={"width": 1440, "height": 900})
    goto(page)
    # walk the whole page so lazy images load
    h = page.evaluate("document.documentElement.scrollHeight")
    for y in range(0, h, 600):
        page.evaluate(f"scrollTo(0, {y})")
        page.wait_for_timeout(120)
    page.wait_for_timeout(800)
    broken = page.evaluate("[...document.images].filter(i => !i.closest('#k9Corner') && !(i.complete && i.naturalWidth > 0)).map(i => i.src)")
    assert broken == [], broken
    assert page.bad_responses == [], page.bad_responses
    assert page.errors == [], page.errors
    assert page.console_errors == [], page.console_errors
    page.context.close()


@pytest.mark.skipif("trainwithmk9.com" not in SITE, reason="only the live host applies the publish rules")
def test_private_files_are_not_public(browser):
    page = open_page(browser)
    for path in ["marketing/", "mk9-cursor-prototype/index.html", "MK9-3D.png", "MK9-Cursor-Prototype.zip",
                 "milblue-original.jpeg", "README.md", "automation/README.md", "content-calendar.md"]:
        r = page.request.get(SITE + path)
        assert r.status == 404, f"{path} is publicly reachable ({r.status})"
    page.context.close()


def test_seo_and_support_files(browser):
    page = open_page(browser)
    goto(page)
    assert "MK9 Training" in page.title()
    assert page.locator('meta[name="description"]').get_attribute("content")
    assert page.locator('link[rel="canonical"]').get_attribute("href") == "https://trainwithmk9.com/"
    assert page.locator('meta[property="og:image"]').get_attribute("content").startswith("https://")
    for block in page.locator('script[type="application/ld+json"]').all_inner_texts():
        json.loads(block)  # raises if the structured data is malformed
    for path in ["robots.txt", "sitemap.xml", "logo.jpeg", "card/"]:
        assert page.request.get(SITE + path).status == 200, path
    page.context.close()


def test_security_policy_present(browser):
    page = open_page(browser)
    goto(page)
    csp = page.locator('meta[http-equiv="Content-Security-Policy"]').get_attribute("content")
    assert "script-src 'self'" in csp and "'unsafe-inline'" not in csp.split("script-src")[1].split(";")[0]
    page.context.close()


def test_every_in_page_link_has_a_target(browser):
    page = open_page(browser)
    goto(page)
    missing = page.evaluate("""[...new Set([...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')))]
        .filter(h => h.length > 1 && !document.getElementById(h.slice(1)))""")
    assert missing == [], missing
    page.context.close()


def test_hero_content_and_actions(browser):
    # reduced motion makes the anchor jump instant; headless Chrome's smooth scroll can stall under load
    page = open_page(browser, viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    goto(page)
    assert re.sub(r"\s+", " ", page.locator("h1").inner_text()).upper().startswith("A DOG YOU CAN TRUST")
    ctas = page.locator(".mhero__cta a")
    assert ctas.nth(0).get_attribute("href") == "#contact"
    assert "Claim Your Free Transformation Session".lower() in ctas.nth(0).inner_text().lower()
    assert ctas.nth(1).get_attribute("href") == "#services"
    assert page.locator('.mhero a[href="tel:+17602715998"]').count() == 1
    ctas.nth(0).click()
    page.wait_for_timeout(600)
    top = page.evaluate("document.getElementById('contact').getBoundingClientRect().top")
    assert abs(top) < 200, f"booking button did not bring the form into view (top={top})"
    page.context.close()


@pytest.mark.parametrize("width,height", [(1440, 900), (1024, 768), (820, 1180), (390, 844), (360, 740)])
def test_no_sideways_scroll(browser, width, height):
    page = open_page(browser, viewport={"width": width, "height": height})
    goto(page)
    over = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert over <= 0, f"page scrolls sideways by {over}px at {width}px"
    page.context.close()


# ---------------------------------------------------------------- the dogs (desktop)

def test_both_dogs_render(browser):
    page = open_page(browser, viewport={"width": 1440, "height": 900})
    goto(page)
    assert "is-live" in page.get_attribute("#mascot", "class")
    assert "is-live" in page.get_attribute("#k9Corner", "class")
    hero = page.locator("#mascot .mascot__dog canvas").bounding_box()
    corner = page.locator("#k9Corner").bounding_box()
    assert hero["width"] > 200 and corner["width"] > 40
    assert corner["x"] < 40 and corner["y"] + corner["height"] > 900 - 40, "corner dog is not bottom left"
    page.context.close()


def test_hero_dog_follows_the_cursor(browser):
    page = open_page(browser, viewport={"width": 1440, "height": 900})
    goto(page)
    canvas = page.locator("#mascot .mascot__dog canvas")
    page.mouse.move(40, 120); page.wait_for_timeout(1500)
    left = shot(canvas)
    page.mouse.move(1420, 880); page.wait_for_timeout(1500)
    right = shot(canvas)
    assert diff(left, right) > 2, "hero dog did not move with the cursor"
    page.context.close()


def test_corner_dog_follows_the_cursor_and_stays_put_on_scroll(browser):
    page = open_page(browser, viewport={"width": 1440, "height": 900})
    goto(page)
    corner = page.locator("#k9Corner .k9-corner__dog")
    before_box = page.locator("#k9Corner").bounding_box()
    page.mouse.move(1400, 60); page.wait_for_timeout(1500)
    a = shot(corner)
    page.mouse.move(20, 600); page.wait_for_timeout(1500)
    b = shot(corner)
    assert diff(a, b) > 2, "corner dog did not move with the cursor"
    page.evaluate("scrollTo(0, 3000)"); page.wait_for_timeout(600)
    assert page.locator("#k9Corner").bounding_box() == before_box, "corner dog moved when the page scrolled"
    page.context.close()


def test_corner_dog_never_blocks_clicks(browser):
    page = open_page(browser, viewport={"width": 1440, "height": 900})
    goto(page)
    assert page.evaluate("getComputedStyle(document.getElementById('k9Corner')).pointerEvents") == "none"
    hits = page.evaluate("""(() => { const r = document.getElementById('k9Corner').getBoundingClientRect(); const out = [];
        for (const fx of [.2, .5, .8]) for (const fy of [.1, .5, .9]) {
          const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
          out.push(!!(el && el.closest('#k9Corner'))); }
        return out; })()""")
    assert not any(hits), "something in the corner dog intercepts clicks"
    assert page.get_attribute("#k9Corner", "aria-hidden") == "true"
    page.context.close()


PAST_BADGE = "scrollTo(0, document.getElementById('mascot').getBoundingClientRect().bottom + scrollY + 40)"


@pytest.mark.parametrize("phone", [False, True])
def test_woof_waits_until_the_badge_is_passed(browser, phone):
    page = open_page(browser, **(PHONE if phone else dict(viewport={"width": 1440, "height": 900})))
    goto(page)
    page.wait_for_timeout(3000)
    assert "is-on" not in page.get_attribute(".k9-corner__woof", "class"), "Woof showed on load"
    page.mouse.wheel(0, 120); page.wait_for_timeout(1500)
    assert "is-on" not in page.get_attribute(".k9-corner__woof", "class"), "Woof showed before the badge was passed"
    page.evaluate(PAST_BADGE)
    page.wait_for_selector(".k9-corner__woof.is-on", timeout=3000)
    assert page.locator(".k9-corner__woof").inner_text().strip() == "Woof!"
    assert page.evaluate("getComputedStyle(document.querySelector('.k9-corner__woof')).pointerEvents") == "none"
    page.context.close()


def test_hello_bubble_by_right_ear_clear_of_emblem_and_stars(browser):
    for ctx in (dict(viewport={"width": 1440, "height": 900}), PHONE):
        page = open_page(browser, **ctx)
        goto(page)
        page.wait_for_timeout(800)
        hello = page.locator(".mascot__hello")
        assert hello.inner_text().strip() == "Hello, I’m Cali!"
        assert page.evaluate("getComputedStyle(document.querySelector('.mascot__hello')).pointerEvents") == "none"
        b = hello.bounding_box()
        m = page.locator("#mascot").bounding_box()
        # in badge units (viewBox 0..1000): the Eagle, Globe and Anchor spans x 446..676, y 226..371;
        # the first star on the right ring sits near x 885, y 410
        x0, x1 = (b["x"] - m["x"]) / m["width"] * 1000, (b["x"] + b["width"] - m["x"]) / m["width"] * 1000
        y0, y1 = (b["y"] - m["y"]) / m["height"] * 1000, (b["y"] + b["height"] - m["y"]) / m["height"] * 1000
        assert x0 > 676 or y1 < 226 or y0 > 371, f"bubble covers the emblem ({x0:.0f}..{x1:.0f}, {y0:.0f}..{y1:.0f})"
        assert y1 < 385, f"bubble reaches the first right star ({y1:.0f})"
        assert x0 > 500, "bubble is not on the right side"
        assert b["x"] + b["width"] <= ctx["viewport"]["width"], "bubble runs off screen"
        page.context.close()


def test_pause_button_is_gone(browser):
    page = open_page(browser)
    goto(page)
    assert page.locator("#mascotPause").count() == 0
    assert page.get_by_text("Pause motion").count() == 0
    page.context.close()


# ---------------------------------------------------------------- phones

PHONE = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2,
             user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")


def test_phone_layout(browser):
    page = open_page(browser, **PHONE)
    goto(page)
    assert "is-live" in page.get_attribute("#mascot", "class")
    assert "is-live" in page.get_attribute("#k9Corner", "class")
    flag = page.locator(".mhero__flag").bounding_box()
    badge = page.locator("#mascot").bounding_box()
    assert flag["y"] < badge["y"] + badge["height"] and flag["y"] + flag["height"] > badge["y"], "flag is not behind the badge"
    flag_mid, badge_mid = flag["y"] + flag["height"] / 2, badge["y"] + badge["height"] / 2
    assert abs(flag_mid - badge_mid) < 12, f"flag is not centered on the badge ({flag_mid:.0f} vs {badge_mid:.0f})"
    h1 = page.locator("h1").bounding_box()
    assert badge["y"] + badge["height"] <= h1["y"], "the badge should come before the headline on phones"
    assert badge["y"] < 844, "the badge is not on the first screen"
    text_right = page.evaluate("Math.max(...[...document.querySelectorAll('.mhero__content > *')].map(e => e.getBoundingClientRect().right))")
    assert text_right <= 390, f"hero text runs off screen ({text_right}px)"
    corner = page.locator("#k9Corner").bounding_box()
    assert corner["width"] <= 56, "corner dog too big on phones"
    page.context.close()


def test_phone_corner_dog_steps_above_booking_button(browser):
    page = open_page(browser, **PHONE)
    goto(page)
    page.evaluate("scrollTo(0, 1600)"); page.wait_for_timeout(1200)
    assert "show" in page.get_attribute("#stickyCta", "class")
    cta = page.locator("#stickyCta").bounding_box()
    dog = page.locator("#k9Corner").bounding_box()
    overlap = not (dog["y"] + dog["height"] <= cta["y"] or dog["x"] + dog["width"] <= cta["x"] or cta["x"] + cta["width"] <= dog["x"])
    assert not overlap, f"corner dog overlaps the booking button: dog={dog} cta={cta}"
    page.context.close()


def test_phone_menu_opens_and_covers_corner_dog(browser):
    page = open_page(browser, **PHONE)
    goto(page)
    page.click("#navToggle"); page.wait_for_timeout(700)
    menu_open = page.evaluate("!!document.querySelector('.mobile-menu.open')")
    assert menu_open, "phone menu did not open"
    r = page.locator("#k9Corner").bounding_box()
    on_top = page.evaluate(f"document.elementFromPoint({r['x'] + r['width'] / 2}, {r['y'] + r['height'] / 2})?.closest('.mobile-menu') !== null")
    assert on_top, "corner dog shows over the open menu"
    page.context.close()


def test_phone_dogs_follow_the_scroll(browser):
    page = open_page(browser, **PHONE)
    goto(page)
    corner = page.locator("#k9Corner .k9-corner__dog")
    page.wait_for_timeout(1500)
    a = shot(corner)
    for y in range(0, 1400, 70):
        page.mouse.wheel(0, 70); page.wait_for_timeout(30)
    page.wait_for_timeout(250)
    b = shot(corner)
    assert diff(a, b) > 1.5, "corner dog did not react to scrolling on a phone"
    page.context.close()


# ---------------------------------------------------------------- accessibility fallbacks

def test_reduced_motion_holds_still(browser):
    page = open_page(browser, viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    goto(page)
    assert "is-on" not in page.get_attribute(".k9-corner__woof", "class"), "Woof showed before the visitor scrolled"
    page.evaluate(PAST_BADGE)
    page.wait_for_selector(".k9-corner__woof.is-on", timeout=3000)       # shows without animating
    page.evaluate("scrollTo(0, 0)"); page.wait_for_timeout(300)
    canvas = page.locator("#mascot .mascot__dog canvas")
    page.mouse.move(40, 120); page.wait_for_timeout(1200)
    a = shot(canvas)
    page.mouse.move(1420, 880); page.wait_for_timeout(1200)
    b = shot(canvas)
    assert diff(a, b) < 0.5, "dog moved even though reduced motion is on"
    page.context.close()


def test_without_webgl_the_still_artwork_shows(pw):
    b = pw.chromium.launch(channel="chrome", headless=True, args=["--disable-webgl", "--disable-3d-apis"])
    page = open_page(b, viewport={"width": 1440, "height": 900})
    goto(page)
    assert "is-live" not in page.get_attribute("#mascot", "class")
    assert page.evaluate("getComputedStyle(document.querySelector('#mascot .mascot__dog img')).opacity") == "1"
    assert page.evaluate("getComputedStyle(document.getElementById('k9Corner')).opacity") == "0"
    assert page.errors == [], page.errors
    b.close()


# ---------------------------------------------------------------- contact form (network intercepted)

def fill_form(page, name="Test Visitor", email="test@example.com"):
    page.locator("#contact").scroll_into_view_if_needed()
    page.fill("#name", name)
    page.fill("#email", email)
    page.fill("#phone", "7602715998")


def submit(page):
    page.locator('#leadForm button[type="submit"]').click()
    page.wait_for_timeout(1500)
    return page.locator("#formNote").inner_text()


def test_form_rejects_empty_and_bad_email_without_sending(browser):
    page = open_page(browser, viewport={"width": 1440, "height": 900})
    goto(page)
    page.locator("#contact").scroll_into_view_if_needed()
    assert "valid email" in submit(page)
    fill_form(page, email="not-an-email")
    assert "valid email" in submit(page)
    assert page.lead_requests == []
    page.context.close()


def test_phone_number_formats_as_typed(browser):
    page = open_page(browser, viewport={"width": 1440, "height": 900})
    goto(page)
    page.locator("#contact").scroll_into_view_if_needed()
    page.type("#phone", "7602715998")
    assert page.input_value("#phone") == "(760) 271-5998"
    page.context.close()


def test_form_success_through_tracker(browser):
    page = open_page(browser, viewport={"width": 1440, "height": 900})
    page.lead_reply["tracker"] = {"success": "true"}
    goto(page)
    fill_form(page)
    assert "Thank you" in submit(page)
    assert len(page.lead_requests) == 1 and "script.google" in page.lead_requests[0]
    assert page.input_value("#name") == "", "form should clear after success"
    page.context.close()


def test_form_falls_back_to_email_when_tracker_fails(browser):
    page = open_page(browser, viewport={"width": 1440, "height": 900})
    page.lead_reply["tracker"] = {"success": "false"}
    page.lead_reply["formsubmit"] = {"success": "true"}
    goto(page)
    fill_form(page)
    assert "Thank you" in submit(page)
    assert any("formsubmit" in u for u in page.lead_requests)
    page.context.close()


def test_form_shows_phone_when_everything_fails(browser):
    page = open_page(browser, viewport={"width": 1440, "height": 900})
    goto(page)  # both endpoints aborted
    fill_form(page)
    note = submit(page)
    assert "(760) 271-5998" in note
    assert page.locator('#leadForm button[type="submit"]').is_enabled()
    page.context.close()


def test_honeypot_blocks_bots_silently(browser):
    page = open_page(browser, viewport={"width": 1440, "height": 900})
    page.lead_reply["tracker"] = {"success": "true"}
    goto(page)
    fill_form(page)
    page.evaluate("document.querySelector('[name=\"_honey\"]').value = 'bot'")
    assert "Thank you" in submit(page)
    assert page.lead_requests == []
    page.context.close()


# ---------------------------------------------------------------- other page

def test_wallet_card_page(browser):
    page = open_page(browser, **PHONE)
    page.goto(SITE + "card/", wait_until="load")
    page.wait_for_timeout(800)
    assert page.errors == [], page.errors
    assert page.bad_responses == [], page.bad_responses
    page.context.close()
