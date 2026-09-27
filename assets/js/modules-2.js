/* ============================================================
   modules-2.js — 调音台推子 / Pegel 电平柱 / 项目幕布揭示 / 跟随预览
   ============================================================ */
(function () {
  'use strict';
  var DK = window.DK;

  /* ============================================================
     3 · 调音台推子（三轨）
     3 个错相位 loop 的 BufferSource 做无缝音床 + 22 格卡扣 detent
     ============================================================ */
  DK.faders = {
    rows: [],
    init: function () {
      var rows = DK.$$('[data-fader]');
      if (!rows.length) return;
      var TRIM = [1, .92, 1.05], MASTER_TRIM = .55;

      rows.forEach(function (el, idx) {
        var kind = parseInt(el.getAttribute('data-kind') || idx, 10);
        var track = el.querySelector('.fader_track');
        var band = el.querySelector('.fader_band');
        var title = el.querySelector('.fader_title');
        var cap = el.querySelector('.fader_cap');
        var readout = cap.querySelector('u');
        var scale = el.querySelector('.fader_scale');

        /* 标题 + JS 克隆的 knockout（保证填充区覆盖时仍可读） */
        var text = title.getAttribute('data-title') || title.textContent.trim();
        var marquee = '<span class="fader_marquee">' +
          new Array(4).join('<span>' + text + '　·　</span>') + '</span>';
        title.innerHTML = marquee;
        var ko = document.createElement('div');
        ko.className = 'fader_title_knockout';
        ko.setAttribute('data-fader-knockout', '');
        ko.innerHTML = marquee;
        track.insertBefore(ko, cap);

        /* dB 刻度：位置 = .5 * 10^(step/20) * 100 */
        [-24, -18, -12, -6, 0, 6].forEach(function (db) {
          var tick = document.createElement('i');
          var pos = .5 * Math.pow(10, db / 20) * 100;
          tick.style.left = DK.clamp(pos, 0, 99.6) + '%';
          scale.appendChild(tick);
        });

        var row = {
          el: el, kind: kind, track: track, band: band, cap: cap, readout: readout,
          ko: ko, title: title, idx: idx,
          v: .02, target: .02, detent: -1, marqueeX: 0,
          started: false, gain: null, srcs: [], trim: TRIM[idx] || 1,
          enter: null, drag: false
        };
        DK.faders.rows.push(row);

        /* ---- 交互 ---- */
        function setFromX(clientX) {
          var r = track.getBoundingClientRect();
          row.target = DK.clamp((clientX - r.left) / r.width, 0, 1);
          kick();
        }
        track.addEventListener('pointerdown', function (e) {
          row.drag = true;
          track.setPointerCapture && track.setPointerCapture(e.pointerId);
          row.enter = null;                       /* 用户接管，停止入场动画 */
          DK.audio.noise({ dur: .075, gain: .12, filters: [{ type: 'bandpass', freq: 780, q: 9 }] });
          setFromX(e.clientX);
        });
        track.addEventListener('pointermove', function (e) { if (row.drag) setFromX(e.clientX); });
        function release() {
          if (!row.drag) return;
          row.drag = false;
          DK.audio.noise({ dur: .045, gain: .10, filters: [{ type: 'bandpass', freq: 1300, q: 12 }] });
        }
        track.addEventListener('pointerup', release);
        track.addEventListener('pointercancel', release);
        /* 键盘可达性 */
        track.setAttribute('tabindex', '0');
        track.setAttribute('role', 'slider');
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.addEventListener('keydown', function (e) {
          var step = e.shiftKey ? .005 : .05;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { row.target = DK.clamp(row.target + step, 0, 1); e.preventDefault(); }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { row.target = DK.clamp(row.target - step, 0, 1); e.preventDefault(); }
          kick();
        });

        /* ---- 音床 ---- */
        function bed() {
          if (row.started || !DK.audio.enabled) return;
          var ctx = DK.audio.ctx; if (!ctx) return;
          row.started = true;
          var buf = DK.audio.bedBuffer(4.2, row.kind);
          var g = ctx.createGain(); g.gain.value = 0;
          var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.1;
          lp.frequency.value = 1600 + row.kind * 1100;
          var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
          if (pan) pan.pan.value = [-.45, 0, .45][row.kind] || 0;
          g.connect(lp);
          var tail = lp;
          if (pan) { lp.connect(pan); tail = pan; }
          tail.connect(DK.audio.master);
          /* 混响支路 */
          var conv = ctx.createConvolver(); conv.buffer = DK.audio.makeIR(1.9, 2.6);
          var send = ctx.createGain(); send.gain.value = .55;
          var wet = ctx.createGain(); wet.gain.value = .3;
          tail.connect(send); send.connect(conv); conv.connect(wet); wet.connect(DK.audio.master);
          for (var i = 0; i < 3; i++) {
            var s = ctx.createBufferSource();
            s.buffer = buf; s.loop = true; s.connect(g);
            s.start(ctx.currentTime + .01 * i, (buf.duration / 3) * i);
            row.srcs.push(s);
          }
          row.gain = g;
        }

        /* ---- 入场：阻尼振荡，不是缓动曲线 ---- */
        function autoPush() {
          if (row.enter || row.drag) return;
          var W = 1.02 * Math.PI * 2, Z = .62, Wd = W * Math.sqrt(1 - Z * Z);
          var dur = 1.7, t0 = performance.now() + row.idx * 260;
          var start = row.v, end = .34 + row.idx * .12;
          var startPitch = 1.34;
          row.enter = DK.ticker.add(function (dt, now) {
            var p = DK.clamp((now - t0) / (dur * 1000));
            if (p <= 0) return true;
            var slide = Math.exp(-Z * W * p) * (Math.cos(Wd * p) + (Z * W / Wd) * Math.sin(Wd * p)) * (1 - Math.pow(p, 4));
            row.target = end - (end - start) * slide;
            var pitch = 1 + (startPitch - 1) * Math.pow(1 - p, 2.4);
            row.srcs.forEach(function (s) { try { s.playbackRate.value = pitch; } catch (e) { } });
            if (p >= 1) { row.enter = null; return false; }
            return true;
          });
          bed();
        }
        row.autoPush = autoPush;
        DK.inView(el, function () { DK.afterIntro(autoPush); }, { rootMargin: '-12% 0px' });

        render(row);
      });

      /* ---- 主循环：阻尼跟随 + UI 渲染 ---- */
      var stop = null, lastDetent = 0;
      function frame(dt) {
        var busy = false;
        DK.faders.rows.forEach(function (r) {
          r.v = DK.damp(r.v, r.target, .09, dt);            /* 0.09 阻尼：要有「油感」 */
          if (Math.abs(r.v - r.target) > .0012) busy = true;

          /* 22 个卡位点 */
          var d = Math.round(r.v * 22);
          if (d !== r.detent) {
            r.detent = d;
            var now = performance.now();
            if (now - lastDetent > 14 && DK.audio.enabled) {
              lastDetent = now;
              DK.audio.noise({
                dur: .022, gain: .16, filters: [
                  { type: 'highpass', freq: 900 },
                  { type: 'bandpass', freq: 2200, q: 20 },
                  { type: 'bandpass', freq: 3696, q: 9, gain: .45 }
                ]
              });
            }
          }
          /* 音量：setTargetAtTime，不是线性赋值 */
          if (r.gain && DK.audio.ctx) {
            r.gain.gain.setTargetAtTime(Math.pow(r.v, 1) * (r.trim || 1) * MASTER_TRIM, DK.audio.ctx.currentTime, .08);
          }
          render(r);
        });
        if (!busy) return false;
        return true;
      }
      function kick() { DK.ticker.add(frame); }

      function render(r) {
        var pct = DK.clamp(r.v, 0, 1) * 100;
        var clip = 'inset(0 ' + (100 - pct).toFixed(2) + '% 0 0)';
        r.band.style.clipPath = clip;
        r.ko.style.clipPath = clip;
        r.cap.style.transform = 'translateX(' + (r.v * (r.track.clientWidth || 1)).toFixed(1) + 'px)';
        var db = r.v < .006 ? '-∞' : (20 * Math.log10(r.v / .5)).toFixed(1);
        r.readout.textContent = (db === '-∞' ? '-∞' : (db > 0 ? '+' : '') + db) + ' dB';
        r.el.setAttribute('aria-valuenow', Math.round(r.v * 100));
      }

      /* 跑马灯：速度绑定推子值 tween.timeScale = .25 + .9*v
         只在区块可见时占用 rAF，离开视口即注销 */
      var mqStop = null;
      function mqFrame() {
        if (DK.env.reduce) return false;
        DK.faders.rows.forEach(function (r) {
          var ts = .25 + (.9 - .25) * r.v;
          var mq = r.title.firstElementChild;
          if (!mq) return;
          r.marqueeX -= 60 * ts * (1 / 60);
          var w = mq.firstElementChild ? mq.firstElementChild.offsetWidth : 120;
          if (w && -r.marqueeX > w) r.marqueeX += w;
          mq.style.transform = 'translateX(' + r.marqueeX.toFixed(1) + 'px)';
          var koMq = r.ko.firstElementChild;
          if (koMq) koMq.style.transform = 'translateX(' + r.marqueeX.toFixed(1) + 'px)';
        });
        return true;
      }
      var fsec = rows[0] && rows[0].closest('.faders');
      if (fsec) {
        new IntersectionObserver(function (es) {
          if (es[0].isIntersecting) { if (!mqStop) mqStop = DK.ticker.add(mqFrame); }
          else if (mqStop) { mqStop(); mqStop = null; }
        }, { rootMargin: '10%' }).observe(fsec);
      }
    }
  };

  /* ============================================================
     4 · Pegel 电平柱（340vh 长滚动 + sticky 舞台，SVG clipPath 切视频）
     ============================================================ */
  DK.pegel = {
    init: function () {
      var wrap = DK.$('[data-pegel]');
      if (!wrap) return;
      var stage = wrap.querySelector('.pegel_stage');
      var svg = wrap.querySelector('.pegel_svg');
      var video = wrap.querySelector('.pegel_video');

      var S = [.18, .26, .12, .30, .16, .22, .14];
      var F = { 3: 0, 2: .045, 4: .09, 1: .135, 5: .18, 0: .225, 6: .27 };
      var M = { 2: 0, 3: .035, 1: .07, 4: .105, 0: .14, 5: .175 };
      var E = 70, Q = 420;

      var NS = 'http://www.w3.org/2000/svg';
      svg.innerHTML =
        '<defs><clipPath id="pegelClip" clipPathUnits="userSpaceOnUse"></clipPath></defs>' +
        '<foreignObject x="0" y="0" width="100%" height="100%" clip-path="url(#pegelClip)">' +
        '<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%"></div></foreignObject>';
      var clip = svg.querySelector('#pegelClip');
      var foHost = svg.querySelector('foreignObject > div');
      if (video && foHost) foHost.appendChild(video);

      var rects = [], tints = [];
      for (var i = 0; i < 7; i++) {
        var r = document.createElementNS(NS, 'rect');
        r.setAttribute('rx', '6'); r.setAttribute('ry', '6');
        clip.appendChild(r); rects.push(r);
        var t = document.createElement('div');
        t.className = 'pegel_tint';
        stage.appendChild(t); tints.push(t);
      }

      var C = S.slice(), W = 0, H = 0, gap = 0, bw = 0;
      function measure() {
        W = stage.clientWidth; H = stage.clientHeight;
        gap = Math.max(4, W * .012);
        bw = (W - gap * 6) / 7;
      }
      measure();
      window.addEventListener('resize', measure);

      var p = 0;
      function readScroll() {
        var r = wrap.getBoundingClientRect();
        var sh = stage.offsetHeight || window.innerHeight;
        p = DK.clamp(-r.top / Math.max(1, r.height - sh), 0, 1);
        kick();
      }
      DK.smooth.on(readScroll);
      window.addEventListener('scroll', readScroll, { passive: true });
      window.addEventListener('resize', readScroll);

      var stop = null;
      function frame(dt, now) {
        var busy = false, x = 0;
        var steady = C.map(function (c, i) { return DK.clamp((c - S[i]) / Math.max(.001, 1 - S[i]), 0, 1); });
        for (var i = 0; i < 7; i++) {
          var grow = DK.smoothstep((p - F[i]) / .73);
          var target = S[i] + (1 - S[i]) * grow + .05 * Math.sin(.0006 * (now || 0) + 1.9 * i) * grow;
          var tau = target > C[i] ? E : Q * (1 + (M[i] || 0) * 3);
          C[i] = DK.approach(C[i], target, tau, dt);
          if (Math.abs(C[i] - target) > .0015) busy = true;

          var h = Math.max(2, C[i] * H * .78);
          var y = H * .92 - h;
          var nb = Math.max(steady[i - 1] || 0, steady[i + 1] || 0);
          var rx = (bw / 2) * (1 - Math.min(1, nb));
          var rr = rects[i];
          rr.setAttribute('x', x.toFixed(1)); rr.setAttribute('y', y.toFixed(1));
          rr.setAttribute('width', bw.toFixed(1)); rr.setAttribute('height', h.toFixed(1));
          rr.setAttribute('rx', Math.min(rx, bw / 2).toFixed(1));
          var tt = tints[i];
          tt.style.width = bw + 'px'; tt.style.height = h + 'px';
          tt.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
          tt.style.opacity = (.25 + .55 * steady[i]).toFixed(3);
          x += bw + (i < 6 ? gap * (1 - nb * .8) : 0);
        }
        if (!busy) return false;
        return true;
      }
      function kick() { DK.ticker.add(frame); }
      kick();

      /* 点击舞台 → Showreel lightbox */
      var lb = DK.$('.lightbox');
      if (lb && video) {
        video.setAttribute('role', 'button');
        video.setAttribute('tabindex', '0');
        var open = function () {
          lb.hidden = false; document.body.classList.add('is--locked');
          var lv = lb.querySelector('video');
          if (lv) { lv.currentTime = 0; lv.play().catch(function () {}); }
          var btn = lb.querySelector('.lightbox_close');
          btn && btn.focus();
          document.addEventListener('keydown', esc);
        };
        var close = function () {
          lb.hidden = true; document.body.classList.remove('is--locked');
          var lv = lb.querySelector('video');
          lv && lv.pause();
          video.focus();
          document.removeEventListener('keydown', esc);
        };
        function esc(e) { if (e.key === 'Escape') close(); }
        video.addEventListener('click', open);
        video.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
        var cb = lb.querySelector('[data-lightbox-close]');
        cb && cb.addEventListener('click', close);
        lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
      }
    }
  };

  /* ============================================================
     5 · 项目卡幕布揭示 + 列表跟随预览
     ============================================================ */
  DK.projects = {
    init: function () {
      /* 幕布揭示：标题逐字 + 信息行 stagger */
      DK.$$('.proj_card').forEach(function (card) {
        var title = card.querySelector('[data-split]');
        if (title) {
          var txt = title.textContent;
          title.textContent = '';
          var chars = txt.split('');
          chars.forEach(function (c, i) {
            var s = document.createElement('span');
            s.className = 'dkr-word';
            s.textContent = c === ' ' ? ' ' : c;
            s.style.transitionDelay = (i * .045) + 's';
            title.appendChild(s);
          });
        }
        DK.$$('.proj_row', card).forEach(function (row, i) {
          row.style.transitionDelay = (.18 + i * .075) + 's';
          var peak = row.querySelector('.dkr-peak');
          if (peak) peak.style.animationDelay = (.34 + i * .075) + 's';
        });
        DK.inView(card, function () {
          card.classList.add('is--in');
          DK.afterIntro(function () {
            if (DK.audio.enabled) {
              DK.audio.noise({ dur: .04, gain: .10, filters: [{ type: 'bandpass', freq: 1500, q: 3 }] });
              DK.audio.tone({ type: 'triangle', freq: 110, freq2: 165, dur: 1.1, gain: .07, attack: .25 });
              DK.audio.tone({ type: 'sine', freq: 220, dur: .9, gain: .04, attack: .2 });
            }
          });
          /* 逐字 skew 归正 + 主题色 */
          DK.$$('.dkr-word', card).forEach(function (w, i) {
            setTimeout(function () { w.style.color = 'var(--brand-500)'; }, 500 + i * 45);
          });
        }, { rootMargin: '0px 0px -30% 0px', once: true });
      });

      /* 列表跟随预览卡 */
      var prev = DK.$('.plist_prev');
      var list = DK.$('.plist');
      if (!prev || !list || !DK.env.fine) return;
      var cur = null, x = 0, y = 0, tx = 0, ty = 0, down = true;
      document.addEventListener('pointermove', function (e) {
        tx = e.clientX + 24; ty = e.clientY - 60;
        if (tx + prev.offsetWidth > window.innerWidth - 10) tx = e.clientX - prev.offsetWidth - 24;
      }, { passive: true });

      DK.$$('.plist_item', list).forEach(function (item) {
        item.addEventListener('pointerenter', function () {
          if (cur === item) return;
          var dir = cur && item.compareDocumentPosition(cur) & 4 ? -1 : 1;
          cur = item;
          prev.classList.add('is--on');
          var fc = item.getAttribute('data-fc') || '#ffb800';
          var ft = prev.querySelector('.footage');
          if (ft) ft.style.setProperty('--fc', fc);
          DK.media.setLit && DK.media.setLit(ft, true);
          try {
            prev.animate(
              [{ transform: 'translateY(' + (100 * dir) + '%)' }, { transform: 'translateY(0)' }],
              { duration: 500, easing: 'cubic-bezier(.45,0,.15,1)' });
          } catch (e) { }
          if (DK.audio.enabled) {
            DK.audio.tone({
              type: 'square', freq: Math.random() < .5 ? 1320 : 1760, dur: .09, gain: .03,
              attack: .014
            });
          }
        });
        item.addEventListener('pointerleave', function () {
          if (cur !== item) return;
        });
      });
      list.addEventListener('pointerleave', function () {
        cur = null; prev.classList.remove('is--on');
      });

      DK.ticker.add(function (dt) {
        x = DK.damp(x, tx, .17, dt); y = DK.damp(y, ty, .17, dt);
        prev.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
        return Math.abs(x - tx) > .3 || Math.abs(y - ty) > .3 || cur;
      });
    }
  };

  /* ============================================================
     通用小电平表（nav / FAQ）
     ============================================================ */
  DK.meters = {
    init: function () {
      var all = [];
      DK.$$('[data-meter]').forEach(function (host) {
        var bars = [];
        var n = parseInt(host.getAttribute('data-meter') || '5', 10);
        host.innerHTML = '';
        for (var i = 0; i < n; i++) {
          var b = document.createElement('i');
          host.appendChild(b); bars.push({ el: b, v: .1 });
        }
        all.push({ host: host, bars: bars, active: false, hover: false });
      });
      if (!all.length) return;

      all.forEach(function (m) {
        m.host.addEventListener('pointerenter', function () { m.hover = true; kick(); });
        m.host.addEventListener('pointerleave', function () { m.hover = false; });
        var io = new IntersectionObserver(function (es) { m.active = es[0].isIntersecting; kick(); },
          { rootMargin: '20%' });
        io.observe(m.host);
      });

      var spec = new Array(7).fill(0);
      var stop = null;
      function frame(dt, now) {
        var busy = false;
        var live = DK.audio.enabled && DK.audio.energy() > .005;
        if (live) DK.audio.spectrum(spec);
        all.forEach(function (m) {
          if (!m.active) return;
          m.bars.forEach(function (b, i) {
            var target;
            if (live) target = .08 + spec[i % 7] * .9;
            else if (m.hover) target = .25 + .6 * Math.abs(Math.sin((now / 1000) * (1.2 + i * .3)));
            else target = .1;
            b.v = DK.damp(b.v, target, live ? .35 : .16, dt);
            if (Math.abs(b.v - target) > .002) busy = true;
            b.el.style.transform = 'scaleY(' + b.v.toFixed(3) + ')';
          });
        });
        if (!busy) return false;
        return true;
      }
      function kick() { DK.ticker.add(frame); }
      kick();
    }
  };
})();
