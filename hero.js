/* MK9 mascot.
   The badge is static SVG. The dog is a cut-out of the finished mascot art,
   drawn in WebGL with a hand placed depth map so the head and muzzle shift
   more than the chest, the head tilts a little, the eyes lead the head, and
   fur coloured lids sweep down for blinks. It is a 2.5D treatment of a flat
   illustration, not a rigged 3D model.
   Two dogs share this renderer: the big one in the hero badge, and a small
   head that stays in the bottom left corner of every scroll position.
   Keeps the normal cursor, never captures touch or clicks, sleeps offscreen
   and in hidden tabs, and shows a still pose for reduced motion. */
(function () {
  'use strict';

  var stage = document.getElementById('mascot');
  var badge = stage && stage.querySelector('.badge');
  var corner = document.getElementById('k9Corner');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var fine = matchMedia('(hover: hover) and (pointer: fine)');
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var now = function () { return performance.now() / 1000; };
  var PAD = 0.08; // hero canvas padding around the art, must match .mascot__dog > img inset

  /* ---------- attention, shared by both dogs ----------
     Raw screen points are kept, and each dog works out its own angle to them. */
  var att = { inside: false, px: 0, py: 0, lastMove: -1e9, paused: false };
  var touch = { px: 0, py: 0, at: -1e9 };
  var scroll = { y: window.scrollY, at: -1e9, vel: 0, sway: 0 };

  // soft response: precise near the face, eases out toward the limits
  var soft = function (v) { return v / (1 + Math.abs(v)) * 2; };

  document.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    att.px = e.clientX; att.py = e.clientY; att.inside = true; att.lastMove = now();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', function () { att.inside = false; att.lastMove = now(); });

  // phones: follow the scroll and glance at a finger. Passive only, so scrolling is never delayed.
  function onTouch(e) {
    var p = e.touches && e.touches[0]; if (!p) return;
    touch.px = p.clientX; touch.py = p.clientY; touch.at = now();
  }
  document.addEventListener('touchstart', onTouch, { passive: true });
  document.addEventListener('touchmove', onTouch, { passive: true });
  window.addEventListener('scroll', function () {
    var t = now(), y = window.scrollY, dt = Math.max(t - scroll.at, 0.016);
    if (t - scroll.at < 0.3) scroll.vel = scroll.vel * 0.6 + ((y - scroll.y) / dt) * 0.4; else scroll.vel = 0;
    scroll.sway += (y - scroll.y) * 0.0035;                                 // head sweeps side to side as the page moves
    scroll.y = y; scroll.at = t;
  }, { passive: true });

  function spring(k, d) {
    return { x: 0, v: 0, step: function (g, dt) { this.v += (g - this.x) * k * dt; this.v *= Math.exp(-d * dt); this.x += this.v * dt; return this.x; } };
  }

  /* where a screen point sits relative to one dog's eyes, in -1..1 */
  function makeLook(el, faceX, faceY, reach) {
    return function (px, py) {
      var r = el.getBoundingClientRect();
      var fx = r.left + r.width * faceX, fy = r.top + r.height * faceY;
      var s = Math.max(r.width, r.height) * 0.9, rx = Math.max(s, reach), ry = Math.max(s, reach * 0.8);
      return { x: clamp(soft((px - fx) / rx), -1, 1), y: clamp(soft((py - fy) / ry), -1, 1) };
    };
  }

  /* each dog's gaze: cursor on desktop, scroll and finger on phones, then idle look around */
  function makeTarget(look, mod) {
    var st = { nextGlance: 0, idle: null };
    var base = function (t) {
      if (reduced.matches || att.paused) return { x: 0, y: 0 };
      if (!fine.matches) {
        if (t - touch.at < 1.6) { st.nextGlance = t + 1.2; return look(touch.px, touch.py); }
        if (t - scroll.at < 2.2) {
          // eyes on the middle of the screen as the page moves, plus a nod in the scroll direction
          var l = look(window.innerWidth / 2, window.innerHeight * 0.45);
          var fresh = Math.max(0, 1 - (t - scroll.at) / 0.4);
          st.nextGlance = t + 1.2;
          return { x: clamp(l.x * 0.5 + Math.sin(scroll.sway) * 0.5, -1, 1), y: clamp(l.y + clamp(scroll.vel * 0.0006, -0.5, 0.5) * fresh, -1, 1) };
        }
      }
      var since = t - att.lastMove;
      if (att.inside && since < 2.2) return look(att.px, att.py);           // tracking, then holding
      if (!att.inside && since < 3) return { x: 0, y: 0 };                  // cursor left the page: settle
      if (t > st.nextGlance) {                                              // idle look around
        var spots = [[-0.7, 0.1], [0.65, -0.2], [0.2, 0.45], [-0.35, -0.3], [0, 0], [0.8, 0.15], [0, 0]];
        var s = spots[Math.floor(Math.random() * spots.length)];
        st.idle = { x: s[0], y: s[1] };
        st.nextGlance = t + 1.6 + Math.random() * 2.4;
      }
      return st.idle || { x: 0, y: 0 };
    };
    return mod ? function (t) { return mod(t, base(t)); } : base;
  }

  /* blinking, one schedule per dog so they never blink in unison */
  function makeBlink() {
    var b = { start: -1, next: 1 + Math.random() * 2, double: false, lastEnd: 0 };
    return function (t, headSpeed) {
      if (reduced.matches || att.paused) return 0;
      if (b.start < 0 && (t > b.next || headSpeed > 2.6 && t - b.lastEnd > 1.2)) b.start = t;
      if (b.start < 0) return 0;
      var p = (t - b.start) / 0.2;                       // 80ms close, 120ms open
      if (p >= 1) {
        b.start = -1; b.lastEnd = t;
        if (!b.double && Math.random() < 0.25) { b.double = true; b.next = t + 0.12; }
        else { b.double = false; b.next = t + 2.4 + Math.random() * 3.6; }
        return 0;
      }
      return p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
    };
  }

  /* run loop that sleeps when its element is offscreen or the tab is hidden */
  function loop(el, tick) {
    var raf = 0, onscreen = true, last = now();
    function run() { var t = now(), dt = Math.min(t - last, 0.05); last = t; tick(dt, t); raf = requestAnimationFrame(run); }
    function sync() { cancelAnimationFrame(raf); raf = 0; if (onscreen && !document.hidden) { last = now(); raf = requestAnimationFrame(run); } }
    var io = new IntersectionObserver(function (en) { onscreen = en[en.length - 1].isIntersecting; sync(); });
    io.observe(el);
    document.addEventListener('visibilitychange', sync);
    sync();
    return { stop: function () { cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', sync); } };
  }

  /* ---------- shaders ---------- */
  var VERT = 'attribute vec2 a; varying vec2 v_uv; void main(){ v_uv = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5); gl_Position = vec4(a, 0.0, 1.0); }';
  var FRAG = [
    'precision highp float;',
    'uniform sampler2D u_img; uniform vec2 u_head; uniform vec2 u_eye; uniform float u_blink; uniform float u_breath;',
    'uniform vec4 u_view;',                                                   // which part of the art fills the canvas
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
    // the eye itself shifts toward the target ahead of the head
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
    '  vec2 p = u_view.xy + v_uv * u_view.zw;',
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

  /* one animated dog on one canvas.
     o.view: [x, y, w, h] of the art shown, o.look: gaze mapper, o.watch: element for the run loop,
     o.onFrame(x, y): optional hook (the hero badge drifts against the head) */
  function createDog(canvas, img, o) {
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
    var U = {}; ['u_head', 'u_eye', 'u_blink', 'u_breath', 'u_view'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.uniform4f(U.u_view, o.view[0], o.view[1], o.view[2], o.view[3]);
    gl.clearColor(0, 0, 0, 0);

    var target = makeTarget(o.look, o.mod), blink = makeBlink();
    var hx = spring(38, 7.5), hy = spring(38, 7.5);   // head: weighty, slight overshoot
    var ex = spring(160, 16), ey = spring(160, 16);   // eyes: quick, they lead the head
    var prevHx = 0;
    function frame(dt, t) {
      var g = target(t);
      var x = hx.step(g.x, dt), y = hy.step(g.y, dt);
      var speed = Math.abs(x - prevHx) / Math.max(dt, 1e-4); prevHx = x;
      gl.uniform2f(U.u_head, x, y);
      gl.uniform2f(U.u_eye, ex.step(g.x, dt) - x * 0.6, ey.step(g.y, dt) - y * 0.6);
      gl.uniform1f(U.u_blink, blink(t, speed));
      gl.uniform1f(U.u_breath, reduced.matches ? 0 : Math.sin(t * 1.7));
      if (o.onFrame) o.onFrame(x, y);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, o.maxDpr || 1.75);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr)); canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    // draw right away (and after every resize) so the dog shows even before the loop runs
    var ro = new ResizeObserver(function () { size(); frame(0, now()); }); ro.observe(canvas);
    size(); frame(0, now());
    var l = loop(o.watch, frame);
    return { stop: function () { l.stop(); ro.disconnect(); gl.deleteTexture(tex); gl.deleteBuffer(buf); gl.deleteProgram(prog); } };
  }

  /* ---------- the corner dog's "Woof!" ----------
     Waits for the visitor's first scroll, then pops in now and then; stays put for reduced motion or pause. */
  var woof = { el: corner && corner.querySelector('.k9-corner__woof'), timer: 0, until: 0 };
  function showWoof(ms) {
    if (!woof.el) return;
    woof.el.classList.add('is-on');
    woof.until = now() + 0.5;
    clearTimeout(woof.timer);
    woof.timer = setTimeout(function () {
      if (reduced.matches || att.paused) return;                           // keep it showing while motion is off
      woof.el.classList.remove('is-on');
      woof.timer = setTimeout(function () { showWoof(3000); }, 14000 + Math.random() * 10000);
    }, ms);
  }
  function onFirstScroll() {
    window.removeEventListener('scroll', onFirstScroll);
    if (reduced.matches) { woof.el.classList.add('is-on'); return; }
    woof.timer = setTimeout(function () { showWoof(3800); }, 350);
  }
  function startWoof() {
    if (!woof.el) return;
    window.addEventListener('scroll', onFirstScroll, { passive: true });
  }
  function stopWoof() {
    window.removeEventListener('scroll', onFirstScroll);
    clearTimeout(woof.timer); if (woof.el) woof.el.classList.remove('is-on');
  }

  /* ---------- the two dogs ---------- */
  var dogs = {};
  var span = 1 / (1 - 2 * PAD);
  var setups = {
    hero: stage && function () {
      var d = createDog(stage.querySelector('.mascot__dog canvas'), stage.querySelector('.mascot__dog img'), {
        view: [-PAD * span, -PAD * span, span, span],
        look: makeLook(stage, 0.5, 0.43, 0),
        watch: stage,
        onFrame: function (x, y) { badge.style.transform = 'translate(' + (-x * 4).toFixed(2) + 'px,' + (-y * 3).toFixed(2) + 'px)'; }
      });
      stage.classList.add('is-live');
      return { stop: function () { d.stop(); stage.classList.remove('is-live'); badge.style.transform = ''; } };
    },
    corner: corner && function () {
      var cv = corner.querySelector('canvas');
      // head and collar only; the art's top edge sits just above the ear tips
      var d = createDog(cv, corner.querySelector('img'), {
        view: [0.0, -0.06, 0.9, 0.9],
        look: makeLook(cv, 0.5, 0.3, 520),
        watch: corner,
        maxDpr: 2,
        mod: function (t, g) {                                              // a quick upward nod as he says it
          if (reduced.matches || att.paused || t > woof.until) return g;
          var p = 1 - (woof.until - t) / 0.5;
          return { x: g.x * 0.6, y: Math.max(-1, g.y - Math.sin(Math.min(p, 1) * Math.PI) * 0.7) };
        }
      });
      corner.classList.add('is-live');
      startWoof();
      return { stop: function () { d.stop(); stopWoof(); corner.classList.remove('is-live'); } };
    }
  };

  function boot(name) {
    if (!setups[name] || dogs[name]) return;
    var host = name === 'hero' ? stage.querySelector('.mascot__dog img') : corner.querySelector('img');
    var go = function () {
      try { dogs[name] = setups[name](); }
      catch (err) { console.warn('[mk9 mascot] ' + name + ' showing still artwork:', err); } // hero keeps its <img>; corner stays hidden
    };
    if (host.complete && host.naturalWidth) go(); else host.addEventListener('load', go, { once: true });
  }
  function bootAll() { boot('hero'); boot('corner'); }
  function stopAll() { Object.keys(dogs).forEach(function (k) { dogs[k].stop(); delete dogs[k]; }); }
  bootAll();

  window.addEventListener('pagehide', function (e) { if (!e.persisted) stopAll(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) bootAll(); });
})();
