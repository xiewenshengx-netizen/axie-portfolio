/* ============================================================
   cursor.js — 自定义光标（运行时 SVG data-URI）+ Hover 胶囊
   6 态 × 9 参数 → 插值 → 拼 SVG → 写入 html 的 --cur 变量
   结果字符串变了才写 DOM；Map 缓存超 800 条清空
   ============================================================ */
(function () {
  'use strict';
  var DK = window.DK;

  /* ---------------- 状态机 ---------------- */
  var STATES = {
    rest:     { w: 17,   h: 17,   sw: 2,   warm: 0, fill: 0, wave: 0, halo: 0, dot: 0, sides: 0, breathe: 0 },
    hover:    { w: 10.5, h: 10.5, sw: 2.4, warm: 1, fill: 0, wave: 1, halo: 0, dot: 0, sides: 0, breathe: 1 },
    press:    { w: 7.5,  h: 7.5,  sw: 0,   warm: 1, fill: 1, wave: 0, halo: 0, dot: 0, sides: 0, breathe: 0 },
    text:     { w: 3.4,  h: 18,   sw: 0,   warm: 0, fill: 1, wave: 0, halo: 0, dot: 0, sides: 0, breathe: 0 },
    grab:     { w: 11.5, h: 11.5, sw: 2.2, warm: 1, fill: 0, wave: 0, halo: 0, dot: 0, sides: 1, breathe: 0 },
    grabbing: { w: 11.5, h: 11.5, sw: 0,   warm: 1, fill: 1, wave: 0, halo: 0, dot: 0, sides: 1, breathe: 0 }
  };
  var KEYS = ['w', 'h', 'sw', 'warm', 'fill', 'wave', 'halo', 'dot', 'sides', 'breathe'];

  function mix(a, b, t) {
    var o = {};
    for (var i = 0; i < KEYS.length; i++) { var k = KEYS[i]; o[k] = a[k] + (b[k] - a[k]) * t; }
    return o;
  }

  /* ---------------- 拼 SVG ---------------- */
  function buildSVG(s, ripple, breatheScale) {
    var pad = 9;
    var bs = breatheScale == null ? 1 : breatheScale;
    var w = s.w * bs, h = s.h * bs;
    var W = Math.ceil(w + pad * 2), H = Math.ceil(h + pad * 2);
    var x = pad, y = pad, cx = W / 2, cy = H / 2;
    var col = s.warm > .5 ? '#ffb800' : '#ffffff';
    var colMix = s.warm > .5
      ? 'rgb(' + Math.round(255) + ',' + Math.round(184 + (255 - 184) * (1 - s.warm)) + ',' + Math.round(0 + 255 * (1 - s.warm)) + ')'
      : '#ffffff';
    var p = [];
    p.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">');

    /* 1. 黑色 keyline：保证任意背景可见 */
    if (s.sw > .05) {
      p.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + Math.min(w, h) / 2 +
        '" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="' + (s.sw + 2.4) + '"/>');
    }
    /* 2. 涟漪 wave */
    if (s.wave > .02 && ripple > 0) {
      for (var r = 0; r < 2; r++) {
        var rr = (w / 2) + ripple * (10 + r * 9);
        p.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + rr.toFixed(2) +
          '" fill="none" stroke="' + colMix + '" stroke-width="' + (1.3 * (1 - ripple)).toFixed(2) +
          '" opacity="' + ((1 - ripple) * .5 * s.wave).toFixed(3) + '"/>');
      }
    }
    /* 3. 虚光 halo */
    if (s.halo > .02) {
      p.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (w * .9).toFixed(2) +
        '" fill="url(#hl)" opacity="' + (s.halo * .5).toFixed(3) + '"/>');
    }
    /* 4. 主形状 */
    var fill = s.fill > .5 ? colMix : 'none';
    if (s.sw > .05) {
      p.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + Math.min(w, h) / 2 +
        '" fill="' + fill + '" stroke="' + colMix + '" stroke-width="' + s.sw.toFixed(2) + '"/>');
    } else if (s.fill > .5) {
      p.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + Math.min(w, h) / 2 +
        '" fill="' + colMix + '"/>');
    }
    /* 5. 两侧「耳朵」 */
    if (s.sides > .02) {
      var gap = 10.6 * s.sides;
      p.push('<circle cx="' + (cx - gap / 2 - 4.2) + '" cy="' + cy + '" r="' + (4.2 * s.sides).toFixed(2) +
        '" fill="' + (s.fill > .5 ? colMix : 'none') + '" stroke="' + colMix + '" stroke-width="1.4" opacity="' + s.sides.toFixed(2) + '"/>');
      p.push('<circle cx="' + (cx + gap / 2 + 4.6) + '" cy="' + cy + '" r="' + (4.6 * s.sides).toFixed(2) +
        '" fill="' + (s.fill > .5 ? colMix : 'none') + '" stroke="' + colMix + '" stroke-width="1.4" opacity="' + s.sides.toFixed(2) + '"/>');
    }
    /* 6. 中心点 */
    if (s.dot > .02) {
      p.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (1.8 * s.dot).toFixed(2) + '" fill="' + colMix + '"/>');
    }
    if (s.halo > .02) {
      p.push('<defs><radialGradient id="hl"><stop offset="0" stop-color="' + colMix + '" stop-opacity=".9"/>' +
        '<stop offset="1" stop-color="' + colMix + '" stop-opacity="0"/></radialGradient></defs>');
    }
    p.push('</svg>');
    return { svg: p.join(''), W: W, H: H };
  }

  var cache = new Map();
  function uriFor(s, ripple, bs) {
    var q = [];
    for (var i = 0; i < KEYS.length; i++) q.push(Math.round(s[KEYS[i]] * 100));
    q.push(Math.round(ripple * 20), Math.round(bs * 100));
    var key = q.join('_');
    var hit = cache.get(key);
    if (hit) return hit;
    var out = buildSVG(s, ripple, bs);
    var uri = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out.svg) + '") ' +
      Math.round(out.W / 2) + ' ' + Math.round(out.H / 2) + ', auto';
    if (cache.size > 800) cache.clear();
    cache.set(key, uri);
    return uri;
  }

  /* ---------------- 主组件 ---------------- */
  DK.cursor = {
    init: function () {
      if (!DK.env.fine || DK.env.reduce) return;
      var cur = {}, from = {}, to = {}, t = 1;
      KEYS.forEach(function (k) { cur[k] = STATES.rest[k]; from[k] = STATES.rest[k]; to[k] = STATES.rest[k]; });
      var ripple = 0, rippling = false, lastWrite = '', breathing = false;
      var mx = -100, my = -100, down = false, moved = 0, downAt = 0;
      var lastHover = '', lastHoverAt = 0;
      var root = document.documentElement;

      function set(state) {
        if (STATES[state] === to) return;
        KEYS.forEach(function (k) { from[k] = cur[k]; });
        to = STATES[state]; t = 0;
      }
      function hit(el) {
        var d = el.getAttribute && el.getAttribute('data-cursor');
        if (d && STATES[d]) return d;
        if (el.closest) {
          if (el.closest('a, button, [role="button"], .btn')) return 'hover';
          if (el.closest('.fader_track')) return 'grab';
          if (el.closest('p, blockquote, input[type="text"], textarea, .wave')) return 'text';
        }
        return 'rest';
      }
      document.addEventListener('pointerover', function (e) {
        var el = e.target;
        var st = hit(el);
        /* 悬停音：进入可交互态才响，状态不变不响，90ms 冷却 */
        var now = performance.now();
        if (DK.audio.enabled && (st === 'hover' || st === 'link') &&
            st !== lastHover && now - lastHoverAt > 90) {
          DK.audio.hover();
          lastHoverAt = now;
        }
        lastHover = st;
        set(st);
      }, true);
      document.addEventListener('pointerdown', function (e) {
        down = true; downAt = performance.now(); moved = 0;
        DK.audio.noise({ dur: .045, gain: .10, filters: [{ type: 'bandpass', freq: 780, q: 9 }] });
        set('press');
      }, true);
      document.addEventListener('pointerup', function () {
        down = false;
        if (performance.now() - downAt < 260 && moved < 6) burst(mx, my);
        set(hit(document.elementFromPoint(mx, my) || document.body));
      }, true);
      document.addEventListener('pointermove', function (e) {
        mx = e.clientX; my = e.clientY; moved += 1;
        if (down && moved > 2) set('grabbing');
      }, { passive: true });

      /* 点击爆裂：8 碎片 + 2 环 + 1 核心（全部 WAAPI + 内联样式，不污染全局选择器） */
      function burst(x, y) {
        if (DK.env.reduce) return;
        var host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;width:0;height:0;' +
          'z-index:700;pointer-events:none';
        var i, b;
        for (i = 0; i < 8; i++) {
          var f = document.createElement('i');
          var a = i * 45;
          f.style.cssText = 'position:absolute;width:5px;height:5px;background:#ffb800;border-radius:1px;' +
            'transform:rotate(' + a + 'deg) translateX(5px)';
          try {
            f.animate(
              [{ transform: 'rotate(' + a + 'deg) translateX(5px) scale(1)', opacity: 1 },
               { transform: 'rotate(' + a + 'deg) translateX(46px) scale(.5)', opacity: 0 }],
              { duration: 500, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
          } catch (e) { }
          host.appendChild(f);
        }
        for (b = 0; b < 2; b++) {
          var ring = document.createElement('b');
          ring.style.cssText = 'position:absolute;left:-5px;top:-5px;width:10px;height:10px;' +
            'border:2.4px solid #ffb800;border-radius:50%';
          try {
            ring.animate(
              [{ width: '10px', height: '10px', left: '-5px', top: '-5px', borderWidth: '2.4px', opacity: 1 },
               { width: '118px', height: '118px', left: '-59px', top: '-59px', borderWidth: '.4px', opacity: 0 }],
              { duration: 550, delay: b * 60, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
          } catch (e) { }
          host.appendChild(ring);
        }
        var core = document.createElement('s');
        core.style.cssText = 'position:absolute;left:-4px;top:-4px;width:8px;height:8px;' +
          'background:#fff3d6;border-radius:50%';
        try {
          core.animate(
            [{ width: '8px', height: '8px', left: '-4px', top: '-4px', opacity: 1 },
             { width: '46px', height: '46px', left: '-23px', top: '-23px', opacity: 0 }],
            { duration: 400, easing: 'ease-out', fill: 'forwards' });
        } catch (e) { }
        host.appendChild(core);
        document.body.appendChild(host);
        setTimeout(function () { host.remove(); }, 720);
      }

      var stop = DK.ticker.add(function (dt) {
        var busy = false;
        if (t < 1) { t = Math.min(1, t + dt * 7); busy = true; }
        for (var i = 0; i < KEYS.length; i++) {
          var k = KEYS[i];
          cur[k] = DK.damp(cur[k], to[k], .28, dt);
          if (Math.abs(cur[k] - to[k]) > .002) busy = true;
        }
        if (rippling) {
          ripple += dt * 2.6;
          if (ripple >= 1) { ripple = 0; rippling = false; }
          busy = true;
        }
        var bs = 1;
        if (cur.breathe > .5) {
          bs = 1 + .055 * Math.sin((performance.now() / 1500) * Math.PI * 2);
          busy = true;
        }
        var uri = uriFor(cur, ripple, bs);
        if (uri !== lastWrite) { root.style.setProperty('--cur', uri); lastWrite = uri; }
        if (!busy && !cur.breathe) return false;
        return true;
      });
      /* 涟漪触发 */
      document.addEventListener('pointerover', function () { rippling = true; }, true);
      return stop;
    }
  };

  /* ---------------- Hover 胶囊 ---------------- */
  DK.pill = {
    init: function () {
      if (!DK.env.fine || DK.env.reduce) return;
      var pill = DK.$('.pill');
      if (!pill) return;
      var stack = pill.querySelector('.pill_stack');
      var main = stack.querySelector('span:not(.is--ghost)');
      var ghost = stack.querySelector('span.is--ghost');
      var tx = 0, ty = 0, x = 0, y = 0, on = false, flip = false;
      pill.appendChild(stack);

      function show(el) {
        var txt = el.getAttribute('data-hover');
        if (!txt) return;
        if (main.textContent !== txt) {
          ghost.textContent = txt;
          pill.classList.add('is--flip');
          setTimeout(function () {
            main.textContent = txt;
            pill.classList.remove('is--flip');
          }, 170);
        }
        on = true; pill.classList.add('is--on');
      }
      function hide() { on = false; pill.classList.remove('is--on'); }

      document.addEventListener('pointerover', function (e) {
        var el = e.target.closest && e.target.closest('[data-hover]');
        if (el) show(el); else hide();
      }, true);
      document.addEventListener('pointermove', function (e) {
        tx = e.clientX + 16; ty = e.clientY + 16;
        var w = pill.offsetWidth || 60;
        if (tx + w > window.innerWidth - 8) tx = e.clientX - w - 16;   // 边界翻转
      }, { passive: true });

      return DK.ticker.add(function (dt) {
        x = DK.damp(x, tx, .19, dt);
        y = DK.damp(y, ty, .19, dt);
        pill.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
        var busy = Math.abs(x - tx) > .3 || Math.abs(y - ty) > .3;
        if (!busy && !on) return false;
        return true;
      });
    }
  };
})();
