/* ============================================================
   modules-1.js — IntroGate / Hero 频谱 / 逐字聚光灯 / WaveReveal
   ============================================================ */
(function () {
  'use strict';
  var DK = window.DK;

  /* ============================================================
     0 · IntroGate + Loader 推子
     三段式曲线（手写，不用缓动库）：
       t<0        → v = .1 + jitter(t,i)
       t<attack   → v = .1 + (1+ov-.1) * (1 - 2^(-10p))      p = t/attack
       t>=attack  → v = (1+ov) + (1-(1+ov)) * (1-(1-p)^3)    p = (t-attack)/settle
     ============================================================ */
  DK.gate = {
    init: function () {
      var gate = DK.$('.gate');
      if (!gate) return;
      var loader = gate.querySelector('.gate_loader');
      var inner = gate.querySelector('.gate_inner');
      var main = DK.$('main') || document.body;   /* inert 打在 main 上，gate 自己不能被禁用 */
      var nav = DK.$('.nav');
      var heroLines = DK.$$('.hero_title .line');
      var glow = DK.$('.hero_glow');
      var bars = DK.$$('.hero_bar_fill');
      var N = 13, LEAD = 200, ATTACK = 260, SETTLE = 520, STAGGER = 70, MAXWAIT = 4000;

      /* 构造 loader 推子 */
      var sticks = [];
      for (var i = 0; i < N; i++) {
        var el = document.createElement('i');
        loader.appendChild(el);
        sticks.push({
          el: el,
          delay: LEAD + Math.round(Math.abs(i - (N - 1) / 2)) * STAGGER,
          ov: .45 * (.7 + .6 * Math.random()),
          v: .1
        });
      }
      function jitter(t, i) { return .6 * Math.sin(t / 70 + 2.3 * i) + .4 * Math.sin(t / 137 + 5.1 * i); }
      function curve(t, s) {
        if (t < 0) return .1 + jitter(t, s.i || 0) * .12;
        if (t < ATTACK) {
          var p = t / ATTACK;
          return .1 + (1 + s.ov - .1) * (1 - Math.pow(2, -10 * p));
        }
        var q = DK.clamp((t - ATTACK) / SETTLE, 0, 1);
        return (1 + s.ov) + (1 - (1 + s.ov)) * (1 - Math.pow(1 - q, 3));
      }

      var finished = false;
      function skip() {
        if (finished) return;
        finished = true;
        reveal(false);
      }

      function reveal(withSound) {
        if (gate.dataset.busy) return;
        gate.dataset.busy = '1';
        try { sessionStorage.setItem('dk:skipGate', '1'); } catch (e) { }

        if (withSound) {
          DK.audio.resume();
          /* 入场 riser：40Hz 上扫 + 噪声 whoosh */
          var c = DK.audio.ctx;
          if (c) {
            DK.audio.tone({ type: 'sawtooth', freq: 40, freq2: 320, dur: 1.6, gain: .10, attack: .35 });
            DK.audio.tone({ type: 'sine', freq: 110, freq2: 440, dur: 1.8, gain: .07, attack: .5 });
            DK.audio.noise({ dur: 1.4, gain: .05, filters: [{ type: 'bandpass', freq: 900, q: .7 }] });
          }
        }

        loader.classList.add('is--on');
        document.body.classList.add('is--locked');

        var t0 = performance.now(), handed = false;
        DK.ticker.add(function (dt, now) {
          var t = now - t0, maxv = 0, allDone = true;
          for (var i = 0; i < sticks.length; i++) {
            var s = sticks[i]; s.i = i;
            var v = curve(t - s.delay, s);
            s.v = v; if (v > maxv) maxv = v;
            if (t - s.delay < ATTACK + SETTLE) allDone = false;
            s.el.style.transform = 'translateY(50%) scaleY(' + v.toFixed(3) + ')';
            var rx = 5, ry = rx / Math.max(.08, v);
            s.el.style.clipPath = 'inset(0px round ' + rx + 'px / ' + ry.toFixed(2) + 'px)';
          }
          /* 推子升到 .25 后触发交接序列 */
          if (!handed && maxv >= 1.25 * .25 + .1) { handed = true; handover(); }
          if (allDone && t > ATTACK + SETTLE + LEAD) {
            loader.classList.remove('is--on');
            return false;
          }
          if (t > MAXWAIT) return false;
          return true;
        });
      }

      function anim(el, frames, opts, delay, dur, ease) {
        if (!el) return;
        try {
          el.animate(frames, {
            delay: delay || 0, duration: dur || 400,
            easing: ease || 'cubic-bezier(.16,1,.3,1)', fill: 'both'
          });
        } catch (e) { }
      }

      function handover() {
        /* copy：文字块上浮模糊消失 */
        DK.$$('.gate_inner > *').forEach(function (el, i) {
          anim(el,
            [{ transform: 'translateY(0)', filter: 'blur(0px)', opacity: 1 },
             { transform: 'translateY(-14px)', filter: 'blur(6px)', opacity: 0 }],
            null, i * 55, 380, 'cubic-bezier(.4,0,1,1)');
        });
        /* pulses：hero 频谱条 .28 → 1 */
        bars.forEach(function (el, i) {
          anim(el, [{ opacity: .28 }, { opacity: 1 }], null, i * 30, 260, 'linear');
        });
        /* handover：容器抽离 */
        anim(gate,
          [{ transform: 'translateY(0)', opacity: 1 },
           { transform: 'translateY(-101%)', opacity: 1 }],
          null, 260, 1100, 'cubic-bezier(.16,1,.3,1)');
        /* glowIn */
        anim(glow, [{ opacity: 0 }, { opacity: .25 }], null, 260, 500, 'linear');
        /* navIn */
        anim(nav, [{ transform: 'translateY(-18px)' }, { transform: 'translateY(0)' }], null, 700, 520, 'cubic-bezier(.16,1,.3,1)');
        /* headline：上推 + clip-path 揭示 */
        heroLines.forEach(function (el, i) {
          anim(el,
            [{ transform: 'translateY(26%)', clipPath: 'inset(0 0 105% 0)' },
             { transform: 'translateY(0)', clipPath: 'inset(-25% -10% -25% -10%)' }],
            null, 820 + i * 45, 900, 'cubic-bezier(.16,1,.3,1)');
        });
        /* unlock */
        setTimeout(unlock, 1800);
      }

      function unlock() {
        gate.classList.add('is--out');
        setTimeout(function () { gate.hidden = true; }, 520);
        main.removeAttribute('inert');
        nav && nav.removeAttribute('inert');
        document.body.classList.remove('is--locked');
        document.documentElement.setAttribute('data-intro-done', '');
        DK.smooth.init();
        window.dispatchEvent(new CustomEvent('dk:intro-revealed'));
      }

      /* 初始状态：主内容 inert */
      main.setAttribute('inert', '');
      nav && nav.setAttribute('inert', '');

      /* 跳过路径 */
      var skipNow = false;
      try {
        if (sessionStorage.getItem('dk:skipGate') === '1') skipNow = true;
        if (performance.getEntriesByType && performance.getEntriesByType('navigation')[0] &&
          performance.getEntriesByType('navigation')[0].type === 'back_forward') skipNow = true;
      } catch (e) { }
      if (skipNow) { gate.hidden = true; main.removeAttribute('inert'); nav && nav.removeAttribute('inert');
        document.documentElement.setAttribute('data-intro-done', ''); DK.smooth.init();
        window.dispatchEvent(new CustomEvent('dk:intro-revealed')); return; }

      /* 按钮：等音频就绪最多 2500ms，超时直接视觉进入 */
      DK.$$('[data-gate]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var wantSound = btn.getAttribute('data-gate') === 'sound';
          if (!wantSound) { reveal(false); return; }
          var t0 = performance.now();
          var iv = setInterval(function () {
            if (DK.audio.resume() || performance.now() - t0 > 2500) { clearInterval(iv); reveal(true); }
          }, 60);
        });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { try { sessionStorage.setItem('dk:skipGate', '1'); } catch (x) { } skip(); }
      });
      /* 硬超时：用户动过但没点按钮，4s 后静默进入 */
      DK.intent.then(function () { setTimeout(function () { if (!gate.dataset.busy) skip(); }, 4000); });
    }
  };

  /* ============================================================
     1 · Hero 频谱椭圆（横向椭圆排列）
        点击其中一个 → 触发对应自然场景音（大自然環境 / 鳥鳴 / 銀鈴），
        音量丝滑变大；形态沿「横向椭圆 → 放大 → 圆 → 竖着拉长的椭圆 → 回落」
        走一遍；其余按距离拖尾式逐个跟随，再点一次音量丝滑变小。
     ============================================================ */
  DK.pulse = {
    init: function () {
      var wrap = DK.$('.hero_bars');
      if (!wrap) return;
      var glow = DK.$('.hero_glow');
      var notes = DK.$('.hero_notes');
      var bars = DK.$$('.hero_bar', wrap);
      var fills = bars.map(function (b) { return b.querySelector('.hero_bar_fill'); });
      if (!bars.length) return;

      /* 七颗球体 → 七种环境音，一颗一音色 */
      var KINDS = ['nature', 'bird', 'bell', 'rain', 'wind', 'wave', 'cricket'];
      var LABEL = {
        nature: '大自然環境音', bird: '鳥鳴', bell: '銀鈴', rain: '雨聲',
        wind: '風聲', wave: '海浪', cricket: '蟲鳴'
      };
      var COLORS = [
        ['#cc8c00', '#ffb800', '#fff3d6'],
        ['#b35c00', '#ff9500', '#ffe6bd'],
        ['#8a3d00', '#ff6e00', '#ffd9a0'],
        ['#cc8c00', '#ffc740', '#fff8e6'],
        ['#7a3fa8', '#a67eff', '#e3d6ff'],
        ['#b35c00', '#ff9500', '#ffe6bd'],
        ['#8a3d00', '#ff6e00', '#ffd9a0']
      ];
      bars.forEach(function (b, i) {
        var c = COLORS[i % COLORS.length];
        b.style.setProperty('--b-start', c[0]);
        b.style.setProperty('--b-end', c[1]);
        b.style.setProperty('--b-glow', c[2]);
        b.setAttribute('role', 'button');
        b.setAttribute('tabindex', '0');
        b.setAttribute('aria-label', '播放' + LABEL[KINDS[i]]);
        /* 注意：这里故意不设 data-hover / data-cursor —— 播放音效时不允许出现文字提示 */
      });

      /* 声音电平：0..1，音频与视觉共用同一个平滑值 */
      var lvl = {};
      KINDS.forEach(function (k) { lvl[k] = { v: 0, t: 0, was: false }; });
      var focus = {};                    /* kind -> 当前接管该音色的那一条 */
      var burst = null;                 /* { i, t0 } —— 拖尾波的起点 */
      var DUR = 2.2, STEP = .12;        /* 单条过渡时长 / 相邻条的拖尾间隔（秒） */
      var hoverIdx = -1;                /* 当前指针停留的球体 */

      function wake(gesture) {
        if (!DK.audio) return false;
        if (!DK.audio.enabled && gesture) { try { DK.audio.resume(); } catch (e) { } }
        return !!DK.audio.enabled;
      }

      /* 起音：目标电平推到 1，frame 每帧平滑趋近 → 丝滑变大 */
      function start(i, gesture) {
        var kind = KINDS[i];
        /* 一次只响一个：其它音色先丝滑淡出 */
        Object.keys(lvl).forEach(function (k) {
          if (k !== kind && lvl[k].t > 0) { lvl[k].t = 0; delete focus[k]; }
        });
        var L = lvl[kind];
        L.t = 1; focus[kind] = i;
        if (wake(gesture)) {
          if (gesture) { try { DK.audio.click(); } catch (e) { } }
          try { DK.audio.scene(kind, true); } catch (e) { }
        }
        burst = { i: i, t0: performance.now() / 1000 };
        kick();
      }

      /* 离手：电平回到 0，声音丝滑淡出（降到 0 后由 frame 收掉节点） */
      function stop(i) {
        var kind = KINDS[i];
        if (focus[kind] !== i) return;
        lvl[kind].t = 0; delete focus[kind];
        kick();
      }

      bars.forEach(function (b, i) {
        /* 点击：明确的声音意图，静默进站也在这里唤起音频 */
        b.addEventListener('pointerdown', function (e) {
          if (DK.env.coarse && lvl[KINDS[i]].t > .5 && focus[KINDS[i]] === i) {
            stop(i); e.preventDefault(); return;      /* 触屏：再点一次关闭 */
          }
          hoverIdx = i;
          start(i, true);
        });
        /* 悬停（鼠标移动到球体上）即起音：同一颗已响则不打断；
           静默模式进来时 wake(false) 不强行唤起音频，只做视觉 */
        b.addEventListener('pointerenter', function () {
          if (DK.env.coarse) return;
          hoverIdx = i;
          if (focus[KINDS[i]] !== i) start(i, false);
          else kick();
        });
        /* 鼠标离开球体 → 音效自动关闭 */
        b.addEventListener('pointerleave', function () {
          if (hoverIdx === i) hoverIdx = -1;
          stop(i);
        });
        b.addEventListener('pointercancel', function () {
          if (hoverIdx === i) hoverIdx = -1;
          stop(i);
        });
        /* 键盘：聚焦即响，失焦即停 */
        b.addEventListener('focus', function () { hoverIdx = i; start(i); });
        b.addEventListener('blur', function () { if (hoverIdx === i) hoverIdx = -1; stop(i); });
        b.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(i, true); }
          else if (e.key === 'Escape') stop(i);
        });
      });

      /* 形态关键帧：横向圆角矩形 → 快速放大 → 收窄变圆 → 竖着的圆角矩形 → 竖持稳态
         横向全程 ≤ 1.0（不越出自身格子），配合 CSS 零间隙 → 永不与相邻条叠加 / 重合 */
      var KF = [
        { t: .00, sx: 1.00, sy: .22 },   /* 静止：横向圆角矩形 */
        { t: .22, sx: 1.00, sy: .62 },   /* 快速放大（纵向起势） */
        { t: .46, sx: .66,  sy: 1.00 },  /* 收窄变圆 */
        { t: .74, sx: .34,  sy: 1.18 },  /* 竖着的圆角矩形 */
        { t: 1.00, sx: .34, sy: 1.00 }   /* 落到竖持稳态，与播放中的保持态无缝衔接 */
      ];
      function shape(t) {
        var p = t / DUR;
        if (p < 0 || p > 1) return null;
        for (var k = 1; k < KF.length; k++) {
          if (p <= KF[k].t) {
            var a = KF[k - 1], b = KF[k];
            var q = DK.easeInOutSine((p - a.t) / (b.t - a.t));
            return { sx: a.sx + (b.sx - a.sx) * q, sy: a.sy + (b.sy - a.sy) * q };
          }
        }
        return null;
      }

      /* reduced-motion：不跑每帧动画，只做静态电平切换（声音照常） */
      if (DK.env.reduce) {
        fills.forEach(function (f) { f.style.transition = 'transform .6s var(--ease-settle)'; });
        var iv = setInterval(function () {
          var any = false;
          for (var i = 0; i < bars.length; i++) {
            var L = lvl[KINDS[i]];
            L.v += (L.t - L.v) * .5;
            if (Math.abs(L.t - L.v) > .01) any = true; else L.v = L.t;
            if (DK.audio.enabled) DK.audio.setScene(KINDS[i], L.v);
            var sx = 1 - L.v * .66;
            var sy = .22 + L.v * .80 + (focus[KINDS[i]] === i ? .10 : 0);
            fills[i].style.transform = 'scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')';
          }
          if (!any) return;
        }, 60);
        return;
      }

      /* idle 呼吸参数：七条永不同步 */
      var st = bars.map(function (_, i) {
        return {
          v: .12,
          idleTo: .1 + Math.random() * .2,
          idleDur: 3.5 + Math.random() * 3,
          phase: -i * 2.5 * (1 + Math.random() * .2)
        };
      });
      var spec = new Array(7).fill(0);
      var glowV = 0, prevE = 0;

      /* 粒子池 */
      var pool = [];
      if (notes) {
        for (var pi = 0; pi < 16; pi++) {
          var n = document.createElement('div');
          n.className = 'hero_note';
          n.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 3v11.5a4.5 4.5 0 1 1-2.5-4.03V7.2L10 8.9v9.1a4.5 4.5 0 1 1-2.5-4.03V6.4L20 3z"/></svg>';
          notes.appendChild(n);
          pool.push({ el: n, life: 0, x: 0, y: 0, vy: 0, rot: 0 });
        }
      }
      function emit(i, v) {
        if (!notes) return;
        for (var k = 0; k < pool.length; k++) {
          var p = pool[k];
          if (p.life > 0) continue;
          var rect = bars[i].getBoundingClientRect();
          var host = notes.getBoundingClientRect();
          p.x = rect.left - host.left + rect.width / 2 + (Math.random() * 20 - 10);
          p.y = host.height - (host.height * .62) * v;
          p.vy = 40 + Math.random() * 60;
          p.rot = Math.random() * 360;
          p.life = 1;
          return;
        }
      }

      var visible = true;
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) kick();
      }, { rootMargin: '120px' }).observe(wrap);

      var lastSpec = new Array(7).fill(0);

      function frame(dt, now) {
        if (!visible) return false;
        var busy = false;
        var live = DK.audio.enabled;

        /* 1 · 音量：平滑趋近目标（丝滑变大 / 变小），音频与视觉共用 */
        Object.keys(lvl).forEach(function (k) {
          var L = lvl[k];
          L.v = DK.damp(L.v, L.t, .085, dt);
          if (Math.abs(L.v - L.t) > .0015) busy = true; else L.v = L.t;
          if (live) { try { DK.audio.setScene(k, L.v); } catch (e) { } }
          if (L.t > 0) L.was = true;
          else if (L.was && L.v < .004) { try { DK.audio.stopScene(k); } catch (e) { } L.was = false; }
        });

        /* 2 · 频谱（静音时走 idle 呼吸） */
        if (live) DK.audio.spectrum(spec);
        var nowS = (now || performance.now()) / 1000;
        var e = 0;

        for (var i = 0; i < bars.length; i++) {
          var s = st[i], target;
          if (live) {
            target = .15 + spec[i] * .85;
            s.v = DK.damp(s.v, target, target > s.v ? .45 : .11, dt);
          } else {
            s.phase += dt / s.idleDur;
            var tri = s.phase - Math.floor(s.phase);
            var ping = tri < .5 ? tri * 2 : (1 - tri) * 2;
            target = .1 + (s.idleTo - .1) * DK.easeInOutSine(ping);
            s.v = DK.damp(s.v, target, .12, dt);
          }
          if (Math.abs(s.v - target) > .0015) busy = true;
          e += s.v;

          /* 3 · 形态：静止 = 横向圆角矩形；播放中 = 竖持（横向收窄、纵向随音量丝滑呼吸）；
             起音瞬间走拖尾形变波，其余条按距离逐个跟随放大缩小 */
          var L2 = lvl[KINDS[i]], v = L2.v;
          var sx, sy, b = null;
          if (burst) b = shape(nowS - burst.t0 - Math.abs(i - burst.i) * STEP);
          if (b) {
            sx = b.sx;
            sy = b.sy + s.v * .08 + v * .12;
            busy = true;
          } else if (v > .02) {
            /* 竖持稳态：横向收窄到 .34，纵向由音量驱动 */
            sx = 1 - v * .66;
            sy = .22 + v * (.60 + .45 * s.v) + (hoverIdx === i ? .03 : 0);
          } else {
            sx = 1;
            sy = .22 + s.v * .10;
          }
          /* 上限锁死：横向绝不超出自身格子 → 相邻条不叠加 / 不重合 */
          sx = DK.clamp(sx, .28, 1.0);
          sy = DK.clamp(sy, .18, 1.26);
          fills[i].style.transform = 'scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')';

          /* 能量上升梯度超阈值 → 发射音符 */
          if (live && s.v - lastSpec[i] > .10) emit(i, s.v);
          lastSpec[i] = s.v;
        }

        if (burst && nowS - burst.t0 > DUR + STEP * (bars.length + 2)) { burst = null; busy = true; }

        /* 4 · 光晕 */
        prevE = e / bars.length;
        glowV = DK.damp(glowV, .18 + prevE * .55, .25, dt);
        if (glow) {
          glow.style.opacity = glowV.toFixed(3);
          glow.style.transform = 'scale(' + (1 + prevE * .18).toFixed(3) + ')';
        }
        if (Math.abs(glowV - (.18 + prevE * .55)) > .001) busy = true;

        /* 5 · 粒子 */
        for (var k2 = 0; k2 < pool.length; k2++) {
          var p = pool[k2];
          if (p.life <= 0) continue;
          p.life -= dt * .55;
          if (p.life <= 0) { p.el.style.opacity = 0; continue; }
          p.y -= p.vy * dt; p.rot += dt * 90;
          p.el.style.opacity = (p.life * .8).toFixed(3);
          p.el.style.transform = 'translate3d(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px,0) rotate(' + p.rot.toFixed(0) + 'deg)';
          busy = true;
        }

        if (!busy && !live) return false;   /* 收敛即停机 */
        return true;
      }

      function kick() { DK.ticker.add(frame); }
      kick();

      /* hover 某一条 → 光晕换成它的颜色 */
      if (DK.env.fine) {
        bars.forEach(function (b, i) {
          b.addEventListener('pointerenter', function () {
            if (glow) glow.style.background =
              'radial-gradient(60% 40% at 50% 78%, ' + COLORS[i % COLORS.length][1] + '55, transparent 70%)';
          });
        });
      }
    }
  };

  /* ============================================================
     2 · Hero 逐字聚光灯
     ============================================================ */
  DK.spotlight = {
    init: function () {
      var host = DK.$('.hero_title');
      if (!host || !DK.env.fine || DK.env.reduce) return;
      var lines = DK.$$('.line', host);
      var items = [];
      lines.forEach(function (line) {
        var text = line.textContent;
        line.textContent = '';
        for (var i = 0; i < text.length; i++) {
          var ch = text[i];
          if (ch === ' ') { line.appendChild(document.createTextNode(' ')); continue; }
          var s = document.createElement('span');
          s.className = 'char'; s.textContent = ch;
          line.appendChild(s);
          items.push({ el: s, x: 0, y: 0, env: 0, idx: items.length });
        }
      });
      var PENT = [0, 2, 4, 7, 9], ROOT = 174.6;
      var mx = -999, my = -999, inside = false;
      var cool = 0;

      function measure() {
        items.forEach(function (it) {
          var r = it.el.getBoundingClientRect();
          it.x = r.left + r.width / 2; it.y = r.top + r.height / 2;
        });
      }
      window.addEventListener('resize', measure);
      document.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; inside = true; }, { passive: true });
      document.addEventListener('pointerleave', function () { inside = false; });

      var stop = DK.ticker.add(function (dt) {
        var busy = false;
        if (cool > 0) cool -= dt;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          var dx = mx - it.x, dy = (my - it.y) * .55;      /* 加权欧氏距离 */
          var d = Math.sqrt(dx * dx + dy * dy);
          var want = inside ? DK.clamp(1 - d / 150, 0, 1) : 0;
          it.env = DK.damp(it.env, want, .22, dt);
          if (Math.abs(it.env - want) > .003) busy = true;
          var on = it.env > .42;
          var hot = it.env > .78;
          if (on !== it.el.classList.contains('is--lit')) {
            it.el.classList.toggle('is--lit', on);
            if (cool <= 0 && DK.audio.enabled) {
              cool = .05;
              var semi = PENT[i % 5] + 12 * Math.floor(i / 5);
              var f = ROOT * Math.pow(2, semi / 12);
              var pan = DK.clamp((it.x / window.innerWidth) * 2 - 1, -.75, .75) * .9;
              DK.audio.tone({ type: 'triangle', freq: f, dur: .28, gain: .05, pan: pan,
                filter: 'lowpass', filterTo: 900, filterFrom: 3000 });
              DK.audio.tone({ type: 'triangle', freq: f * 1.005, dur: .28, gain: .035, pan: pan });
            }
          }
          if (hot !== it.el.classList.contains('is--hot')) it.el.classList.toggle('is--hot', hot);
        }
        if (!busy && !inside) return false;
        return true;
      });
      setTimeout(measure, 60);
      DK.afterIntro(measure);
      return stop;
    }
  };

  /* ============================================================
     3 · WaveReveal：随滚动逐词点亮 + 句中视频窗口
     ============================================================ */
  DK.wave = {
    init: function () {
      DK.$$('[data-wave]').forEach(function (root) { build(root); });
    }
  };

  function build(root) {
    var units = [];      /* {el, start, len, kind} */
    var acc = 0;
    var LEAD = 6;

    /* 预处理：拆词 + 构建视频窗口
       分词规则：CJK 逐字、拉丁按词、空白做分隔 —— 中文站不能按空格切 */
    var CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
    function tokenize(str) {
      var out = [], buf = '', i, c;
      for (i = 0; i < str.length; i++) {
        c = str[i];
        if (/\s/.test(c)) {
          if (buf) { out.push(buf); buf = ''; }
          out.push(' ');
        } else if (CJK.test(c)) {
          if (buf) { out.push(buf); buf = ''; }
          out.push(c);
        } else buf += c;
      }
      if (buf) out.push(buf);
      return out;
    }
    function walk(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (n) {
        if (n.nodeType === 3) {
          var parts = tokenize(n.textContent);
          var frag = document.createDocumentFragment();
          parts.forEach(function (part) {
            if (!part) return;
            if (part === ' ') { frag.appendChild(document.createTextNode(' ')); return; }
            var s = document.createElement('span');
            s.className = 'dkw-word';
            s.textContent = part;
            frag.appendChild(s);
            units.push({ el: s, len: part.length, kind: 'word' });
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) {
          if (n.hasAttribute('data-window')) { makeWindow(n); return; }
          if (n.hasAttribute('data-accent')) {
            var txt = n.textContent;
            n.textContent = '';
            var sp = document.createElement('span');
            sp.className = 'dkw-word is--accent';
            sp.textContent = txt;
            n.appendChild(sp);
            units.push({ el: sp, len: txt.length, kind: 'word', accent: true });
            return;
          }
          walk(n);
        }
      });
    }
    function makeWindow(marker) {
      var kind = marker.getAttribute('data-window') || '0';
      var slot = document.createElement('span');
      slot.className = 'dkw-slot';
      slot.innerHTML = '<span class="dkw-frame"><span class="footage is--paused" data-lit="0" data-footage="w' + kind +
        '" style="--fc:' + (kind === '1' ? '#a67eff' : kind === '2' ? '#ff4337' : '#ffb800') +
        ';--fc2:' + (kind === '1' ? '#ffb800' : '#a67eff') + '"></span></span><span class="dkw-hair"></span>';
      marker.replaceWith(slot);
      units.push({ el: slot, len: 3.2, kind: 'window' });
    }

    walk(root);

    /* 字符流坐标 */
    var total = 0;
    units.forEach(function (u, i) {
      u.start = total + DK.hash(i + 1) * .35;
      total += u.len;
    });
    units.forEach(function (u) { u.len = u.len; });

    var PENT = [0, 2, 4, 7, 9], ROOT = 174.6;
    var rate = { t: 0, down: 0, up: 0 };

    function update() {
      var vh = window.innerHeight;
      var r = root.getBoundingClientRect();
      var h = r.height;
      var num = .86 * vh - r.top;
      var den = Math.max(1, (.86 - .5) * vh - .5 * h);
      var p = DK.easeInOutQuad(DK.clamp(num / den, 0, 1));
      var k = -LEAD + p * (total + 2 * LEAD);

      var nowMs = performance.now();
      if (nowMs - rate.t > 220) { rate.t = nowMs; rate.down = 0; rate.up = 0; }

      units.forEach(function (u, i) {
        var lit = u.start < k;
        if (lit === u.el.classList.contains('is--lit')) return;
        u.el.classList.toggle('is--lit', lit);
        if (u.kind === 'window') DK.media.setLit(u.el.querySelector('.footage'), lit);
        if (!DK.audio.enabled) return;
        var dir = lit ? 'up' : 'down';
        if (dir === 'down' && rate.down >= 7) return;
        if (dir === 'up' && rate.up >= 5) return;
        rate[dir]++;
        var semi = PENT[i % 5] + 12 * Math.floor(i / 5);
        var f = ROOT * Math.pow(2, semi / 12) * (u.accent ? 2 : 1);
        var rect = u.el.getBoundingClientRect();
        var pan = DK.clamp((rect.left / window.innerWidth) * 2 - 1, -.75, .75);
        if (lit) {
          DK.audio.tone({ type: 'triangle', freq: f, dur: .3, gain: .045, pan: pan,
            filter: 'lowpass', filterFrom: 3000, filterTo: 900 });
          DK.audio.tone({ type: 'triangle', freq: f * 1.005, dur: .3, gain: .03, pan: pan });
        } else {
          DK.audio.tone({ type: 'sine', freq: f * .5, freq2: f * .94, dur: .22, gain: .03, pan: pan });
        }
      });
    }

    /* reduced-motion：拆词后直接全部点亮，避免正文停在 20% 灰 */
    if (DK.env.reduce) {
      units.forEach(function (u) { u.el.classList.add('is--lit'); });
      return;
    }

    DK.smooth.on(update);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    DK.afterIntro(update);
  }
})();
