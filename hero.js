/* MK9 mascot hero.
   The badge is static SVG. The dog is a cut-out of the finished mascot art,
   drawn in WebGL with a hand placed depth map so the head and muzzle shift
   more than the chest, the head tilts a little, the eyes lead the head, and
   fur coloured lids sweep down for blinks. It is a 2.5D treatment of a flat
   illustration, not a rigged 3D model.
   Keeps the normal cursor, never captures touch, sleeps offscreen and in
   hidden tabs, and shows a still pose for reduced motion. */
(function () {
  'use strict';

  var hero = document.getElementById('home');
  var stage = document.getElementById('mascot');
  var badge = stage.querySelector('.badge');
  var img = stage.querySelector('.mascot__dog img');
  var canvas = stage.querySelector('.mascot__dog canvas');
  var pauseBtn = document.getElementById('mascotPause');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var fine = matchMedia('(hover: hover) and (pointer: fine)');
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var now = function () { return performance.now() / 1000; };
  var PAD = 0.08; // canvas padding around the art, must match .mascot__dog > img inset

  /* ---------- attention ---------- */
  var att = { x: 0, y: 0, inside: false, lastMove: -1e9, nextGlance: 0, idle: null, paused: false };

  // soft response: precise near the face, eases out toward the limits
  var soft = function (v) { return v / (1 + Math.abs(v)) * 2; };

  // where a screen point sits relative to the dog's eyes, in -1..1
  function lookAt(px, py) {
    var r = stage.getBoundingClientRect();
    var fx = r.left + r.width * 0.5, fy = r.top + r.height * 0.43;        // the dog's eyes on screen
    return {
      x: clamp(soft((px - fx) / (r.width * 0.9)), -1, 1),
      y: clamp(soft((py - fy) / (r.height * 0.9)), -1, 1)
    };
  }

  function onMove(e) {
    if (e.pointerType === 'touch') return;
    var l = lookAt(e.clientX, e.clientY);
    att.x = l.x; att.y = l.y;
    att.inside = true; att.lastMove = now();
  }
  // listen on the whole page so the dog keeps watching while the cursor is over the nav or text
  document.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', function () { att.inside = false; att.lastMove = now(); });

  /* ---------- phones: follow the scroll, and glance at a finger ----------
     Passive listeners only, so scrolling is never delayed or blocked. */
  var touch = { x: 0, y: 0, at: -1e9 };
  var scroll = { y: window.scrollY, at: -1e9, vel: 0, sway: 0 };
  function onTouch(e) {
    var p = e.touches && e.touches[0]; if (!p) return;
    var l = lookAt(p.clientX, p.clientY);
    touch.x = l.x; touch.y = l.y; touch.at = now();
  }
  document.addEventListener('touchstart', onTouch, { passive: true });
  document.addEventListener('touchmove', onTouch, { passive: true });
  window.addEventListener('scroll', function () {
    var t = now(), y = window.scrollY, dt = Math.max(t - scroll.at, 0.016);
    if (t - scroll.at < 0.3) scroll.vel = scroll.vel * 0.6 + ((y - scroll.y) / dt) * 0.4; else scroll.vel = 0;
    scroll.sway += (y - scroll.y) * 0.0035;                                 // head sweeps side to side as the page moves
    scroll.y = y; scroll.at = t;
  }, { passive: true });

  function touchTarget(t) {
    if (t - touch.at < 1.6) return { x: touch.x, y: touch.y };              // looking at the finger
    if (t - scroll.at < 2.2) {
      // keep his eyes on the middle of the screen as the badge moves, plus a nod in the scroll direction
      var l = lookAt(window.innerWidth / 2, window.innerHeight * 0.45);
      var fresh = Math.max(0, 1 - (t - scroll.at) / 0.4);
      return {
        x: clamp(Math.sin(scroll.sway) * 0.55, -1, 1),
        y: clamp(l.y + clamp(scroll.vel * 0.0006, -0.5, 0.5) * fresh, -1, 1)
      };
    }
    return null;
  }

  function target(t) {
    if (reduced.matches || att.paused) return { x: 0, y: 0 };
    if (!fine.matches) {
      var tt = touchTarget(t);
      if (tt) { att.nextGlance = t + 1.2; return tt; }
    }
    var since = t - att.lastMove;
    if (att.inside && since < 2.2) return { x: att.x, y: att.y };           // tracking, then holding
    if (!att.inside && since < 3) return { x: 0, y: 0 };                    // cursor left: settle
    if (t > att.nextGlance) {                                               // idle look around
      var spots = [[-0.7, 0.1], [0.65, -0.2], [0.2, 0.45], [-0.35, -0.3], [0, 0], [0.8, 0.15], [0, 0]];
      var s = spots[Math.floor(Math.random() * spots.length)];
      att.idle = { x: s[0], y: s[1] };
      att.nextGlance = t + 1.6 + Math.random() * 2.4;
    }
    return att.idle || { x: 0, y: 0 };
  }

  function spring(k, d) {
    return { x: 0, v: 0, step: function (g, dt) { this.v += (g - this.x) * k * dt; this.v *= Math.exp(-d * dt); this.x += this.v * dt; return this.x; } };
  }

  /* ---------- blinking ---------- */
  var blink = { start: -1, next: 1.5, double: false };
  function blinkAmount(t, headSpeed) {
    if (reduced.matches || att.paused) return 0;
    if (blink.start < 0 && (t > blink.next || headSpeed > 2.6 && t - blink.lastEnd > 1.2)) { blink.start = t; }
    if (blink.start < 0) return 0;
    var p = (t - blink.start) / 0.2;                       // 80ms close, 120ms open
    if (p >= 1) {
      blink.start = -1; blink.lastEnd = t;
      if (!blink.double && Math.random() < 0.25) { blink.double = true; blink.next = t + 0.12; }
      else { blink.double = false; blink.next = t + 2.4 + Math.random() * 3.6; }
      return 0;
    }
    return p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
  }
  blink.lastEnd = 0;

  /* ---------- run loop ---------- */
  function loop(tick) {
    var raf = 0, onscreen = true, last = now();
    function run() { var t = now(), dt = Math.min(t - last, 0.05); last = t; tick(dt, t); raf = requestAnimationFrame(run); }
    function sync() { cancelAnimationFrame(raf); raf = 0; if (onscreen && !document.hidden) { last = now(); raf = requestAnimationFrame(run); } }
    var io = new IntersectionObserver(function (en) { onscreen = en[en.length - 1].isIntersecting; sync(); });
    io.observe(stage);
    document.addEventListener('visibilitychange', sync);
    sync();
    return { stop: function () { cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', sync); } };
  }

  /* ---------- shaders ---------- */
  var VERT = 'attribute vec2 a; varying vec2 v_uv; void main(){ v_uv = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5); gl_Position = vec4(a, 0.0, 1.0); }';
  var FRAG = [
    'precision highp float;',
    'uniform sampler2D u_img; uniform vec2 u_head; uniform vec2 u_eye; uniform float u_blink; uniform float u_breath; uniform float u_pad;',
    'varying vec2 v_uv;',
    'float dome(vec2 p, vec2 c, vec2 r){ float d = length((p - c) / r); return 1.0 - smoothstep(0.0, 1.0, d * d); }',
    // coordinates are in the cut-out art (0..1), measured from the illustration
    'float headMask(vec2 p){ return dome(p, vec2(0.45, 0.33), vec2(0.34, 0.36)); }',
    'float depth(vec2 p){',
    '  float h = dome(p, vec2(0.45, 0.33), vec2(0.31, 0.33)) * 0.6;',
    '  h += dome(p, vec2(0.515, 0.48), vec2(0.21, 0.18)) * 0.34;',          // muzzle, mouth
    '  h += dome(p, vec2(0.54, 0.31), vec2(0.08, 0.07)) * 0.22;',            // nose
    '  float ears = max(dome(p, vec2(0.12, 0.14), vec2(0.13, 0.15)), dome(p, vec2(0.77, 0.14), vec2(0.13, 0.15))) * 0.5;',
    '  float collar = dome(p, vec2(0.43, 0.68), vec2(0.32, 0.12)) * 0.3;',
    '  float chest = dome(p, vec2(0.48, 0.88), vec2(0.46, 0.18)) * 0.14;',
    '  return max(max(h, ears), max(collar, chest));',
    '}',
    'vec4 tex(vec2 p){ if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return vec4(0.0); return texture2D(u_img, p); }',
    'vec4 eyeLid(vec2 p, vec4 col, vec2 c, vec2 r){',
    '  vec2 q = (p - c) / r;',
    '  float inside = 1.0 - smoothstep(0.85, 1.12, length(q));',
    // the eye itself shifts toward the cursor ahead of the head
    '  float irisW = 1.0 - smoothstep(0.45, 0.95, length(q));',
    '  col = mix(col, tex(p - u_eye * r * 0.22), irisW);',
    // lid: fur from just above the brow slides down over the eye
    '  float lid = mix(-1.25, 1.2, u_blink);',
    '  float cover = smoothstep(lid + 0.06, lid - 0.06, q.y) * inside;',
    '  vec4 fur = tex(p - vec2(0.0, r.y * 2.3));',
    '  fur.rgb *= 0.9 + 0.1 * q.y;',
    '  col = mix(col, fur, cover);',
    '  float lash = (1.0 - smoothstep(0.0, 0.12, abs(q.y - lid))) * inside * step(0.02, u_blink);',
    '  col.rgb *= 1.0 - lash * 0.55;',
    '  return col;',
    '}',
    'void main(){',
    '  vec2 p = (v_uv - u_pad) / (1.0 - 2.0 * u_pad);',
    // breathing: chest swells a touch
    '  p.y += u_breath * 0.004 * dome(p, vec2(0.48, 0.9), vec2(0.5, 0.3));',
    // tilt the head around the neck toward the look direction
    '  float hm = smoothstep(0.08, 0.55, headMask(p));',
    '  vec2 pivot = vec2(0.45, 0.62); float ang = -u_head.x * 0.05 * hm;',
    '  vec2 d0 = p - pivot; p = pivot + vec2(cos(ang) * d0.x - sin(ang) * d0.y, sin(ang) * d0.x + cos(ang) * d0.y);',
    // parallax: nearer parts travel farther
    '  float d = depth(p);',
    '  p -= u_head * d * vec2(0.05, 0.034);',
    '  vec4 col = tex(p);',
    '  col = eyeLid(p, col, vec2(0.350, 0.199), vec2(0.050, 0.034));',
    '  col = eyeLid(p, col, vec2(0.634, 0.199), vec2(0.048, 0.034));',
    // the side turning toward the viewer catches a little more light
    '  float e = 0.004; vec2 g = vec2(depth(p + vec2(e, 0.0)) - depth(p - vec2(e, 0.0)), depth(p + vec2(0.0, e)) - depth(p - vec2(0.0, e))) / (2.0 * e);',
    '  col.rgb *= 1.0 + clamp(dot(g, -u_head) * 0.03, -0.06, 0.06);',
    '  gl_FragColor = col;',
    '}'
  ].join('\n');

  function start() {
    var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error('WebGL unavailable');
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    var U = {}; ['u_head', 'u_eye', 'u_blink', 'u_breath', 'u_pad'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1f(U.u_pad, PAD);
    gl.clearColor(0, 0, 0, 0);

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    var ro = new ResizeObserver(size); ro.observe(canvas); size();

    var hx = spring(38, 7.5), hy = spring(38, 7.5);   // head: weighty, slight overshoot
    var ex = spring(160, 16), ey = spring(160, 16);   // eyes: quick, they lead the head
    var prevHx = 0;
    function frame(dt, t) {
      var g = target(t);
      var x = hx.step(g.x, dt), y = hy.step(g.y, dt);
      var speed = Math.abs(x - prevHx) / Math.max(dt, 1e-4); prevHx = x;
      gl.uniform2f(U.u_head, x, y);
      gl.uniform2f(U.u_eye, ex.step(g.x, dt) - x * 0.6, ey.step(g.y, dt) - y * 0.6);
      gl.uniform1f(U.u_blink, blinkAmount(t, speed));
      gl.uniform1f(U.u_breath, reduced.matches ? 0 : Math.sin(t * 1.7));
      badge.style.transform = 'translate(' + (-x * 4).toFixed(2) + 'px,' + (-y * 3).toFixed(2) + 'px)';
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // draw right away (and after every resize) so the dog shows even before the loop runs
    var redraw = function () { frame(0, now()); };

    ro.disconnect(); ro = new ResizeObserver(function () { size(); redraw(); }); ro.observe(canvas);
    size(); redraw();
    var l = loop(frame);
    stage.classList.add('is-live');
    return { stop: function () { l.stop(); ro.disconnect(); gl.deleteTexture(tex); gl.deleteBuffer(buf); gl.deleteProgram(prog); stage.classList.remove('is-live'); badge.style.transform = ''; } };
  }

  var active = null;
  function boot() {
    try { active = start(); }
    catch (err) { console.warn('[mk9 mascot] showing still artwork:', err); } // the <img> stays visible
  }
  if (img.complete && img.naturalWidth) boot(); else img.addEventListener('load', boot, { once: true });

  function syncPause() {
    pauseBtn.hidden = reduced.matches;
    pauseBtn.textContent = att.paused ? 'Resume motion' : 'Pause motion';
    pauseBtn.setAttribute('aria-pressed', String(att.paused));
  }
  pauseBtn.addEventListener('click', function () { att.paused = !att.paused; syncPause(); });
  reduced.addEventListener('change', syncPause);
  syncPause();
  window.addEventListener('pagehide', function (e) { if (!e.persisted && active) { active.stop(); active = null; } });
  window.addEventListener('pageshow', function (e) { if (e.persisted && !active) boot(); });
})();
