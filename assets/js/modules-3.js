/* ============================================================
   modules-3.js — FAQ 手风琴 / 磁吸拼贴 / 页脚弦乐器 / 巨标自适应
   ============================================================ */
(function () {
  'use strict';
  var DK = window.DK;

  /* ============================================================
     6 · FAQ 手风琴（grid-template-rows 1fr/0fr，不用 max-height）
     ============================================================ */
  DK.faq = {
    init: function () {
      var items = DK.$$('.faq_item');
      items.forEach(function (item, i) {
        var q = item.querySelector('.faq_q');
        var a = item.querySelector('.faq_a');
        var id = 'faq-a-' + i;
        a.id = id;
        q.setAttribute('aria-expanded', 'false');
        q.setAttribute('aria-controls', id);
        q.addEventListener('click', function () {
          var open = item.classList.toggle('is--open');
          q.setAttribute('aria-expanded', open ? 'true' : 'false');
          if (DK.audio.enabled) {
            DK.audio.tone({ type: 'square', freq: open ? 587 : 440, dur: .09, gain: .035, attack: .006 });
            DK.audio.tone({ type: 'square', freq: open ? 880 : 660, dur: .07, gain: .02, attack: .006 });
            DK.audio.tone({ type: 'sine', freq: 78, dur: .34, gain: .09, attack: .01 });   /* 体感低频 */
          }
        });
      });
    }
  };

  /* ============================================================
     7 · Instagram 磁吸拼贴
     最近一张放大到前，其他按 1/(1+.45*dist^1.2) 衰减做位移/缩小/降饱和
     ============================================================ */
  DK.collage = {
    init: function () {
      var host = DK.$('.collage');
      if (!host) return;
      var items = DK.$$('.collage_item', host).map(function (el, i) {
        var s = el.style;
        var col = i % 4, row = Math.floor(i / 4);
        var left = 4 + col * 24 + (row % 2) * 5;
        var top = 6 + row * 44;
        s.left = 'calc(' + left + '% )';
        s.top = top + '%';
        s.width = (15 + (i % 3) * 2.5) + '%';
        return { el: el, x: 0, y: 0, sc: 1, sat: 1, tx: 0, ty: 0, tsc: 1, tsat: 1, z: 1 };
      });
      if (!items.length) return;

      var mx = -9999, my = -9999, near = -1, inside = false;
      function onMove(e) {
        mx = e.clientX; my = e.clientY; inside = true; kick();
      }
      host.addEventListener('pointermove', onMove);
      host.addEventListener('pointerleave', function () { inside = false; near = -1; kick(); });

      var stop = null;
      function frame(dt) {
        var busy = false;
        var hr = host.getBoundingClientRect();
        var best = -1, bestD = 1e9;
        items.forEach(function (it) {
          var r = it.el.getBoundingClientRect();
          var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          var d = Math.hypot(mx - cx, my - cy);
          if (d < bestD) { bestD = d; best = it; }
        });
        near = inside && bestD < Math.min(hr.width, hr.height) * .55 ? items.indexOf(best) : -1;

        items.forEach(function (it, i) {
          var r = it.el.getBoundingClientRect();
          var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          var dx = mx - cx, dy = my - cy;
          var dist = Math.hypot(dx, dy) / Math.max(120, hr.width * .28);
          var f = 1 / (1 + .45 * Math.pow(dist, 1.2));      /* 衰减 */
          if (!inside) f = 0;
          it.tsc = i === near ? 1.14 : DK.lerp(.86, 1, f);
          it.tx = i === near ? 0 : -dx * .10 * f;
          it.ty = i === near ? 0 : -dy * .10 * f;
          it.tsat = i === near ? 1 : DK.lerp(.25, 1, f);
          it.el.style.zIndex = i === near ? 5 : 1;

          it.x = DK.damp(it.x, it.tx, .13, dt);
          it.y = DK.damp(it.y, it.ty, .13, dt);
          it.sc = DK.damp(it.sc, it.tsc, .13, dt);
          it.sat = DK.damp(it.sat, it.tsat, .13, dt);
          if (Math.abs(it.x - it.tx) > .2 || Math.abs(it.sc - it.tsc) > .002) busy = true;
          it.el.style.transform =
            'translate3d(' + it.x.toFixed(1) + 'px,' + it.y.toFixed(1) + 'px,0) scale(' + it.sc.toFixed(3) + ')';
          it.el.style.filter = 'saturate(' + it.sat.toFixed(2) + ') brightness(' + DK.lerp(.8, 1, it.sat).toFixed(2) + ')';
        });
        if (!busy && !inside) return false;
        return true;
      }
      function kick() { DK.ticker.add(frame); }
      kick();
    }
  };

  /* ============================================================
     8 · 页脚弦乐器（Canvas 驻波 + 手速驱动音量 + 离屏烘历史笔画）
     ============================================================ */
  DK.instrument = {
    init: function () {
      var host = DK.$('[data-strings]');
      if (!host) return;
      if (DK.env.coarse || window.innerWidth <= 991 || DK.env.reduce) { host.style.display = 'none'; return; }

      var cv = document.createElement('canvas');
      host.appendChild(cv);
      var ctx = cv.getContext('2d');
      var print = document.createElement('canvas');
      var pctx = print.getContext('2d');
      var prints = [];
      var W = 0, H = 0, DPR = Math.min(2, window.devicePixelRatio || 1);
      var N = 9, SEG = 22;
      var strings = [], trails = [];
      var mx = -9999, my = -9999, px = -9999, py = -9999, inside = false;
      var speed = 0, lastMove = 0, voice = null, near = 0, lastIdx = -1;
      var demoed = false;
      try { demoed = sessionStorage.getItem('dk:demo') === '1'; } catch (e) { }

      for (var i = 0; i < N; i++) {
        strings.push({ amp: 0, phase: Math.random() * 6.28, bend: 0, freq: 5 + .85 * i, decay: .965 - .0022 * i });
      }

      function size() {
        var r = host.getBoundingClientRect();
        W = r.width; H = r.height;
        cv.width = W * DPR; cv.height = H * DPR;
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
        print.width = W * DPR; print.height = H * DPR;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        pctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        redrawPrint();
      }
      size();
      window.addEventListener('resize', size);

      function redrawPrint() {
        pctx.clearRect(0, 0, W, H);
        var now = performance.now();
        prints = prints.filter(function (p) { return now - p.t < 14000; });
        prints.forEach(function (p, i) {
          pctx.strokeStyle = 'rgba(255,184,0,' + (.07 + ((i + 1) / prints.length) * .16).toFixed(3) + ')';
          pctx.lineWidth = 1;
          pctx.stroke(p.path);
        });
      }

      /* ---------------- 音频 ---------------- */
      var SCALE = [0, 3, 5, 7, 10];
      function buildVoice() {
        if (voice || !DK.audio.enabled) return;
        var c = DK.audio.ctx; if (!c) return;
        var saw = c.createOscillator(); saw.type = 'sawtooth';
        var sin = c.createOscillator(); sin.type = 'sine';
        var mix = c.createGain(); mix.gain.value = .5;
        saw.connect(mix); sin.connect(mix);
        var nb = c.createBufferSource(); nb.buffer = DK.audio.noiseBuffer(2); nb.loop = true;
        var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = .8;
        var ng = c.createGain(); ng.gain.value = .06;
        nb.connect(bp); bp.connect(ng); ng.connect(mix);
        var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 4;
        mix.connect(lp);
        var vg = c.createGain(); vg.gain.value = 0;
        lp.connect(vg);
        var conv = c.createConvolver(); conv.buffer = DK.audio.makeIR(1.8, 2.6);
        var wet = c.createGain(); wet.gain.value = .3;
        vg.connect(conv); conv.connect(wet); wet.connect(DK.audio.master);
        vg.connect(DK.audio.master);
        saw.start(); sin.start(); nb.start();
        voice = { saw: saw, sin: sin, lp: lp, vg: vg, ng: ng };
      }
      function pluck(i, energy) {
        var s = strings[i % N];
        s.amp = Math.min(26, 10 + 16 * DK.clamp(energy || .5));
        if (!DK.audio.enabled) return;
        buildVoice();
        if (!voice) return;
        var c = DK.audio.ctx;
        var deg = SCALE[(i % 5)], oct = Math.floor(i / 5) % 2;
        var f = 110 * Math.pow(2, (deg + 12 * oct) / 12);
        voice.saw.frequency.setTargetAtTime(f, c.currentTime, .01);
        voice.sin.frequency.setTargetAtTime(f / 2, c.currentTime, .01);
      }
      function level(dt) {
        if (!voice) return 0;
        var fade = DK.clamp(1 - ((performance.now() - lastMove - 900) / 700), 0, 1);
        var v = .32 * (.28 * fade + .72 * Math.sqrt(DK.clamp((speed - .08) / .88, 0, 1)));
        voice.vg.gain.setTargetAtTime(inside ? v : 0, DK.audio.ctx.currentTime, .06);
        var yN = DK.clamp(my / Math.max(1, H), 0, 1);
        /* 鼠标越高 → 地面越亮 → 截止频率越高 */
        voice.lp.frequency.setTargetAtTime(320 + (2600 - 320) * (1 - yN), DK.audio.ctx.currentTime, .08);
        return v;
      }

      /* ---------------- 绘制 ---------------- */
      function frame(dt, now) {
        var r = host.getBoundingClientRect();
        var d = Math.hypot(mx - (r.left + r.width / 2), my - (r.top + r.height / 2));
        near = DK.clamp(1 - d / 220, 0, 1);

        ctx.clearRect(0, 0, W, H);

        /* 已凝固笔画 → 离屏 printLayer，每帧只 drawImage */
        ctx.drawImage(print, 0, 0, W, H);

        var gridFade = d < 60 ? 1 : d < 260 ? .7 : .45;
        var baked = false;

        for (var i = 0; i < N; i++) {
          var s = strings[i];
          s.phase += s.freq * dt * Math.PI * 2;
          if (s.amp > .05) {
            s.amp *= Math.pow(s.decay, dt * 60);
            if (s.amp <= .05) { bake(i); baked = true; }
          }
          var c = s.amp * Math.sin(s.phase);
          var baseX = (W / (N - 1)) * i;
          /* 靠近效应：高斯吸向光标 X */
          var dx = mx - r.left - baseX;
          var lean = dx * .12 * Math.exp(-(dx * dx) / (2 * 140 * 140)) * near;
          s.bend = DK.damp(s.bend, lean, .12, dt);

          ctx.beginPath();
          for (var j = 0; j <= SEG; j++) {
            var t = j / SEG;
          var x = baseX + (c + s.bend) * Math.sin(Math.PI * t) * (6 + s.amp * .55);
            var y = t * H;
            if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          var a = (s.amp > .4 ? DK.lerp(.2, .85, s.amp / 26) : .2) * gridFade;
          ctx.strokeStyle = 'rgba(255,184,0,' + a.toFixed(3) + ')';
          ctx.lineWidth = s.amp > .4 ? 1.6 : 1;
          ctx.stroke();

          /* 拖尾采样点 */
          if (s.amp > .4) {
            var tt = .5 + .18 * Math.sin(s.phase);
            trails.push({
              x: baseX + (c + s.bend) * Math.sin(Math.PI * tt) * (6 + s.amp * .55),
              y: tt * H, life: 1250, amp: s.amp
            });
          }
        }
        if (baked) redrawPrint();

        /* 拖尾：按寿命分档，逐点画（不跨弦连线，避免锯齿乱网） */
        var buckets = [[], [], [], [], [], [], [], []];
        for (var k = trails.length - 1; k >= 0; k--) {
          var p = trails[k];
          p.life -= dt * 1000;
          if (p.life <= 0) { trails.splice(k, 1); continue; }
          buckets[Math.min(7, Math.floor((1 - p.life / 1250) * 8))].push(p);
        }
        ctx.shadowBlur = 14;
        ctx.shadowColor = 'rgba(255,184,0,.35)';
        for (var b = 0; b < 8; b++) {
          if (!buckets[b].length) continue;
          ctx.fillStyle = 'rgba(255,184,0,' + (.30 - b * .03).toFixed(3) + ')';
          buckets[b].forEach(function (p2) {
            ctx.beginPath();
            ctx.arc(p2.x, p2.y, 1.3, 0, 6.2832);
            ctx.fill();
          });
        }
        ctx.shadowBlur = 0;

        if (voice) level(dt);
        var busy = inside || trails.length || strings.some(function (s) { return s.amp > .05; });
        if (!busy) return false;
        return true;
      }

      function bake(i) {
        var s = strings[i];
        var path = new Path2D(), baseX = (W / (N - 1)) * i;
        for (var j = 0; j <= SEG; j++) {
          var t = j / SEG;
          var c = s.amp * Math.sin(s.phase);
          var x = baseX + (c + s.bend) * Math.sin(Math.PI * t) * (6 + s.amp * .55);
          var y = t * H;
          if (j === 0) path.moveTo(x, y); else path.lineTo(x, y);
        }
        prints.push({ path: path, t: performance.now() });
        if (prints.length > 60) prints.shift();
      }

      var stop = null;
      function kick() { if (!stop) stop = DK.ticker.add(frame); else DK.ticker.add(frame); }

      host.addEventListener('pointerenter', function () { inside = true; lastMove = performance.now(); buildVoice(); kick(); });
      host.addEventListener('pointerleave', function () { inside = false; px = py = -9999; });
      host.addEventListener('pointermove', function (e) {
        var r = host.getBoundingClientRect();
        var nx = e.clientX - r.left, ny = e.clientY - r.top;
        if (px > -9000) {
          var dd = Math.hypot(nx - px, ny - py);
          speed = DK.damp(speed, dd / 16, .25, 1 / 60);
        }
        px = nx; py = ny; mx = e.clientX; my = e.clientY;
        lastMove = performance.now();
        inside = true;
        /* 跨越某根弦 → pluck */
        var idx = Math.round((nx / Math.max(1, W)) * (N - 1));
        if (idx !== lastIdx) { lastIdx = idx; if (speed > .12) pluck(idx, speed); }
        kick();
      }, { passive: true });

      /* 幽灵演示 */
      function demo() {
        if (demoed) return;
        demoed = true;
        try { sessionStorage.setItem('dk:demo', '1'); } catch (e) { }
        var t0 = performance.now(), dur = 1250, marks = [.22, .5, .78], hit = [];
        var r = host.getBoundingClientRect();
        var demoStop = DK.ticker.add(function (dt, now) {
          var p = DK.clamp((now - t0) / dur);
          var fx = W * (.06 + .88 * DK.easeInOutQuad(p));
          var fy = H * (.56 + .13 * Math.sin(p * Math.PI * 1.6));
          mx = r.left + fx; my = r.top + fy;
          speed = DK.damp(speed, .55, .2, dt);
          inside = true; lastMove = now;
          marks.forEach(function (m, i) {
            if (p >= m && !hit[i]) {
              hit[i] = true;
              pluck(Math.round(m * (N - 1)), .8);
            }
          });
          if (p >= 1) { inside = false; return false; }
          return true;
        });
        /* 用户真动鼠标立刻 abort */
        host.addEventListener('pointermove', function abort() {
          try { demoStop && demoStop(); } catch (e) { }
          host.removeEventListener('pointermove', abort);
        }, { once: true });
        kick();
      }
      DK.inView(host, function () { DK.afterIntro(function () { setTimeout(demo, 420); }); }, { rootMargin: '15%' });
      kick();
    }
  };

  /* ============================================================
     巨标自适应：target = 可用宽度 / 实测宽度，迭代两轮
     ============================================================ */
  DK.fitWidth = {
    init: function () {
      DK.$$('[data-fit]').forEach(function (el) {
        var lastW = 0;
        function fit() {
          var parent = el.parentElement;
          var avail = parent.clientWidth;
          if (!avail) return;
          if (Math.abs(avail - lastW) < .5) return;
          lastW = avail;
          el.style.transform = 'scale(1)';
          var natural = el.scrollWidth;
          if (!natural) return;
          var s = avail / natural;
          s = avail / (natural * s) * s;      /* 迭代第二轮 */
          el.style.transform = 'scale(' + s.toFixed(4) + ')';
        }
        if ('ResizeObserver' in window) new ResizeObserver(fit).observe(el.parentElement);
        window.addEventListener('resize', fit);
        DK.afterIntro(fit);
        fit();
      });
    }
  };
})();
