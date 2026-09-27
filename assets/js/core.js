/* ============================================================
   core.js — 运行时基座
   util / ticker / intent gate / audio / smooth scroll / media scheduler
   全部零依赖，挂到 window.DK 命名空间
   ============================================================ */
(function () {
  'use strict';
  var DK = (window.DK = window.DK || {});

  /* ---------------- 数学 ---------------- */
  DK.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  DK.lerp = function (a, b, t) { return a + (b - a) * t; };
  DK.smoothstep = function (x) { x = DK.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  DK.easeInOutQuad = function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  DK.easeInOutSine = function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; };
  DK.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  DK.easeOutExpo = function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); };
  DK.easeOutBack = function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  /* 帧率无关的指数趋近（固定 lerp 不可用） */
  DK.damp = function (cur, tgt, rate, dt) {
    return cur + (tgt - cur) * (1 - Math.pow(1 - rate, DK.clamp(dt * 60, 0, 4)));
  };
  /* 时间常数版（毫秒） */
  DK.approach = function (cur, tgt, tauMs, dt) {
    return cur + (tgt - cur) * (1 - Math.exp((-dt * 1000) / tauMs));
  };
  /* 伪随机 -1..1 */
  DK.hash = function (i) { var s = Math.sin(12.9898 * i) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };

  /* ---------------- 环境判定（逐模块判断，禁止全局一刀切） ---------------- */
  var mq = function (q) { return window.matchMedia && window.matchMedia(q).matches; };
  DK.env = {
    get reduce() { return mq('(prefers-reduced-motion: reduce)'); },
    get coarse() { return mq('(pointer: coarse)'); },
    get fine() { return mq('(hover: hover) and (pointer: fine)'); }
  };

  /* ---------------- ticker：收敛即停机 ----------------
     注册的任务返回 false 即自动注销；任务表空则 cancelAnimationFrame。 */
  (function () {
    var tasks = new Set(), raf = 0, last = 0, running = false;
    function frame(now) {
      var dt = (now - last) / 1000;
      last = now;
      if (dt > .05) dt = .05;           // 掉帧保护
      if (dt < 0) dt = 0;
      tasks.forEach(function (fn) {
        var keep;
        try { keep = fn(dt, now); } catch (e) { console.error(e); keep = false; }
        if (keep === false) tasks.delete(fn);
      });
      if (tasks.size) { raf = requestAnimationFrame(frame); }
      else { running = false; raf = 0; }
    }
    function start() {
      if (running) return;
      running = true; last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    DK.ticker = {
      add: function (fn) { tasks.add(fn); start(); return function () { tasks.delete(fn); }; },
      remove: function (fn) { tasks.delete(fn); },
      get size() { return tasks.size; }
    };
  })();

  /* ---------------- Intent Gate ----------------
     所有重型资源必须挂在这个 Promise 之后。
     首次 pointermove / keydown / wheel / touchstart / pointerdown
     或 load + requestIdleCallback(4000ms) 后 resolve。 */
  (function () {
    var resolveFn, done = false;
    var p = new Promise(function (r) { resolveFn = r; });
    var EV = ['pointermove', 'keydown', 'wheel', 'touchstart', 'pointerdown'];
    function fire() {
      if (done) return;
      done = true;
      EV.forEach(function (e) { window.removeEventListener(e, fire, true); });
      resolveFn();
      window.dispatchEvent(new CustomEvent('dk:intent'));
    }
    EV.forEach(function (e) {
      window.addEventListener(e, fire, { passive: true, capture: true, once: false });
    });
    function idle() {
      var cb = function () { setTimeout(fire, 4000); };
      if ('requestIdleCallback' in window) requestIdleCallback(cb, { timeout: 4000 });
      else setTimeout(cb, 50);
    }
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle);

    p.then(function () { });
    DK.intent = p;
    DK.markIntent = fire;
    DK.intentDone = function () { return done; };
  })();

  /* ---------------- Audio ----------------
     AnalyserNode 挂在 masterGain 之后：全站任何声音都会驱动频谱。 */
  DK.audio = (function () {
    var ctx = null, master = null, analyser = null, bins = null, comp = null;
    var bandEdges = [60, 250, 500, 1000, 3000, 6000];
    var bandBins = null;
    var enabled = false;

    function ensure() {
      if (ctx) return ctx;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = .9;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 18; comp.ratio.value = 3;
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = .8;
      bins = new Uint8Array(analyser.frequencyBinCount);
      master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);
      buildBands();
      return ctx;
    }
    function buildBands() {
      var nyq = ctx.sampleRate / 2, n = analyser.frequencyBinCount;
      var idx = [0].concat(bandEdges.map(function (f) {
        return Math.max(1, Math.round((f / nyq) * n));
      }));
      idx.push(n);
      bandBins = [];
      for (var i = 0; i < 7; i++) {
        bandBins.push({ a: Math.min(idx[i], n - 1), b: Math.min(idx[i + 1], n) });
      }
    }
    function resume() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      enabled = true;
      return ctx;
    }
    /* 7 段频带均值 → 0..1 */
    function spectrum(out) {
      out = out || [];
      if (!analyser) { for (var k = 0; k < 7; k++) out[k] = 0; return out; }
      analyser.getByteFrequencyData(bins);
      for (var i = 0; i < 7; i++) {
        var s = bandBins[i], sum = 0, c = 0;
        for (var j = s.a; j < s.b; j++) { sum += bins[j]; c++; }
        out[i] = c ? sum / c / 255 : 0;
      }
      return out;
    }
    function energy() {
      if (!analyser) return 0;
      var o = spectrum(); var s = 0;
      for (var i = 0; i < 7; i++) s += o[i];
      return s / 7;
    }

    /* ---- 合成工具：全部实时合成，不依赖采样 ---- */
    function noiseBuffer(dur, ctxIn) {
      var c = ctxIn || ctx, len = Math.floor(c.sampleRate * dur);
      var b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return b;
    }
    /* 1.9s 指数衰减白噪声 IR（混响） */
    function makeIR(rt, decay, ctxIn) {
      var c = ctxIn || ctx, len = Math.floor(c.sampleRate * (rt || 1.9));
      var b = c.createBuffer(2, len, c.sampleRate);
      for (var ch = 0; ch < 2; ch++) {
        var d = b.getChannelData(ch);
        for (var i = 0; i < len; i++) {
          var t = i / len;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay || 2.6);
        }
      }
      return b;
    }
    /* 单个音：type / freq / dur / gain / pan / filter 扫频 */
    function tone(o) {
      if (!ctx) return;
      var t = ctx.currentTime, dur = o.dur || .2;
      var osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.freq, t);
      if (o.freq2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freq2), t + dur);
      var g = ctx.createGain();
      var peak = (o.gain == null ? .12 : o.gain);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + (o.attack == null ? .008 : o.attack));
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      var node = osc;
      if (o.filter) {
        var f = ctx.createBiquadFilter();
        f.type = o.filter; f.Q.value = o.q || 1;
        f.frequency.setValueAtTime(o.filterTo || o.filterFrom || 3000, t);
        if (o.filterFrom && o.filterTo) {
          f.frequency.exponentialRampToValueAtTime(o.filterTo, t + dur);
        }
        node.connect(f); node = f;
      }
      node.connect(g);
      if (o.pan && ctx.createStereoPanner) {
        var pn = ctx.createStereoPanner(); pn.pan.value = DK.clamp(o.pan, -1, 1);
        g.connect(pn); pn.connect(o.dest || master);
      } else g.connect(o.dest || master);
      osc.start(t); osc.stop(t + dur + .05);
      return osc;
    }
    /* 噪声脉冲（detent / cue / tick） */
    function noise(o) {
      if (!ctx) return;
      var t = ctx.currentTime, dur = o.dur || .022;
      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer(Math.max(.006, dur));
      var g = ctx.createGain();
      g.gain.setValueAtTime(o.gain == null ? .18 : o.gain, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      var chain = src;
      (o.filters || []).forEach(function (f) {
        var bf = ctx.createBiquadFilter();
        bf.type = f.type; bf.frequency.value = f.freq; bf.Q.value = f.q || 1;
        if (f.gain != null) bf.gain.value = f.gain;
        chain.connect(bf); chain = bf;
      });
      chain.connect(g); g.connect(o.dest || master);
      src.start(t); src.stop(t + dur + .02);
    }
    /* 环境音床 buffer（无缝 loop：尾部 35% 交叉淡化到头部） */
    function bedBuffer(dur, kind) {
      var len = Math.floor(ctx.sampleRate * dur), n = Math.floor(len * .35), take = len - n;
      var raw = new Float32Array(len);
      var i, ph = 0;
      for (i = 0; i < len; i++) {
        var t = i / ctx.sampleRate, v;
        if (kind === 0) {           /* Originalton：室内空气感 */
          v = (Math.random() * 2 - 1) * .5 + Math.sin(2 * Math.PI * 52 * t) * .10;
        } else if (kind === 1) {    /* Sounddesign：低频簇 + 偶发金属刮擦 */
          v = Math.sin(2 * Math.PI * 78 * t) * .30 + Math.sin(2 * Math.PI * 81.3 * t) * .26;
          v += (Math.random() * 2 - 1) * .10;
          if (Math.random() < .00008) v += (Math.random() * 2 - 1) * .5;
        } else {                    /* Mischung：模拟台底噪 + 110Hz 床 */
          v = Math.sin(2 * Math.PI * 110 * t) * .22 + (Math.random() * 2 - 1) * .18;
        }
        raw[i] = v;
      }
      var out = ctx.createBuffer(1, take, ctx.sampleRate);
      var d = out.getChannelData(0);
      for (i = 0; i < take; i++) {
        d[i] = raw[i];
        if (i < n) {
          var a = i / n;
          d[i] = raw[i] * Math.sqrt(a) + raw[take + i] * Math.sqrt(1 - a);
        }
      }
      return out;
    }

    /* ---- 常驻环境音床：intro 结束后启动，驱动频谱保持"活着" ---- */
    var amb = null;
    function ambient(on) {
      if (!ctx || !enabled) return;
      if (on && !amb) {
        var src = ctx.createBufferSource();
        src.buffer = bedBuffer(6, 1); src.loop = true;
        var lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = .4;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(.045, ctx.currentTime + 2.2);  /* 2.2s 淡入 */
        src.connect(lp); lp.connect(g); g.connect(master);
        src.start();
        amb = { src: src, g: g };
      } else if (!on && amb) {
        try { amb.g.gain.setTargetAtTime(0, ctx.currentTime, .4); } catch (e) {}
        var a = amb; amb = null;
        setTimeout(function () { try { a.src.stop(); } catch (e) {} }, 1600);
      }
    }

    /* ---- 三类自然场景音：大自然環境 / 鳥鳴 / 銀鈴 ----
       常驻节点 + level（0..1）音量；level 由调用方每帧平滑写入，
       这样"音量变大变小"既听得见也看得见（频谱接在 master 之后）。 */
    var scenes = {};

    function chirp(dest) {                       /* 鸟鸣：一两声短促上滑的啾 */
      if (!ctx) return;
      var t = ctx.currentTime, f0 = 2100 + Math.random() * 1300;
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.55, t + .055);
      o.frequency.exponentialRampToValueAtTime(f0 * .82, t + .17);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.42, t + .018);
      g.gain.exponentialRampToValueAtTime(.0001, t + .22);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + .26);
    }
    function bell(dest) {                        /* 银铃：三个非整数倍泛音 + 长衰减 */
      if (!ctx) return;
      var t = ctx.currentTime, base = 1046.5 * (Math.random() < .5 ? 1 : 1.5);
      [1, 2.02, 3.01].forEach(function (m, k) {
        var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * m;
        var g = ctx.createGain(), peak = .34 / (k + 1);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + .006);
        g.gain.exponentialRampToValueAtTime(.0001, t + 2.1 - k * .45);
        o.connect(g); g.connect(dest);
        o.start(t); o.stop(t + 2.3);
      });
    }
    /* 虫鸣：4.2kHz 附近的短促颤音串 */
    function cricket(dest) {
      if (!ctx) return;
      var t = ctx.currentTime, f0 = 3900 + Math.random() * 700;
      var o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f0;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0; bp.Q.value = 12;
      var trill = ctx.createOscillator(); trill.type = 'square'; trill.frequency.value = 46;
      var tg = ctx.createGain(); tg.gain.value = .5;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.30, t + .01);
      g.gain.exponentialRampToValueAtTime(.0001, t + .34);
      trill.connect(tg); tg.connect(g.gain);
      o.connect(bp); bp.connect(g); g.connect(dest);
      o.start(t); o.stop(t + .4); trill.start(t); trill.stop(t + .4);
    }
    function schedule(sc) {
      clearTimeout(sc.timer);
      /* 雨 / 风 / 海浪是连续层，不需要事件调度 */
      if (sc.kind !== 'bird' && sc.kind !== 'bell' && sc.kind !== 'cricket') return;
      var wait = sc.kind === 'bird' ? (520 + Math.random() * 1300)
        : sc.kind === 'cricket' ? (420 + Math.random() * 900)
          : (1300 + Math.random() * 1900);
      sc.timer = setTimeout(function () {
        if (sc.level > .04 && ctx && ctx.state === 'running') {
          if (sc.kind === 'bird') {
            var n = 1 + Math.floor(Math.random() * 3);
            for (var i = 0; i < n; i++) (function (d) { setTimeout(function () { chirp(sc.g); }, d); })(i * (110 + Math.random() * 90));
          } else if (sc.kind === 'bell') bell(sc.g);
          else if (sc.kind === 'cricket') {
            var m = 2 + Math.floor(Math.random() * 3);
            for (var j = 0; j < m; j++) (function (d) { setTimeout(function () { cricket(sc.g); }, d); })(j * 150);
          }
        }
        if (sc.on || sc.level > .01) schedule(sc);
      }, wait);
    }
    function buildScene(kind) {
      if (!ctx) return null;
      var g = ctx.createGain(); g.gain.value = 0; g.connect(master);
      var sc = { kind: kind, g: g, level: 0, on: false, timer: 0, parts: [] };
      if (kind === 'nature') {
        /* 风 + 空气：噪声经低通（LFO 缓慢扫）+ 58Hz 底噪 */
        var src = ctx.createBufferSource();
        src.buffer = noiseBuffer(4); src.loop = true;
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = .5;
        var lfo = ctx.createOscillator(); lfo.frequency.value = .085;
        var lfoG = ctx.createGain(); lfoG.gain.value = 240;
        lfo.connect(lfoG); lfoG.connect(lp.frequency);
        var ng = ctx.createGain(); ng.gain.value = .55;
        src.connect(lp); lp.connect(ng); ng.connect(g);
        var hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 58;
        var hg = ctx.createGain(); hg.gain.value = .22;
        hum.connect(hg); hg.connect(g);
        src.start(); lfo.start(); hum.start();
        sc.parts.push(src, lfo, hum);
        sc.peak = .30;
      } else if (kind === 'bird') {
        /* 极轻的树叶沙沙打底，啾声由 timer 触发 */
        var ls = ctx.createBufferSource();
        ls.buffer = noiseBuffer(3); ls.loop = true;
        var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
        var lg = ctx.createGain(); lg.gain.value = .05;
        ls.connect(hp); hp.connect(lg); lg.connect(g);
        ls.start();
        sc.parts.push(ls);
        sc.peak = .55;
      } else if (kind === 'rain') {
        /* 雨：宽带噪声高通 + 一点点低频雨幕 */
        var rs = ctx.createBufferSource();
        rs.buffer = noiseBuffer(4); rs.loop = true;
        var rhp = ctx.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 1100;
        var rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 7200;
        var rg = ctx.createGain(); rg.gain.value = .34;
        var rm = ctx.createOscillator(); rm.type = 'sine'; rm.frequency.value = 96;
        var rmg = ctx.createGain(); rmg.gain.value = .10;
        rs.connect(rhp); rhp.connect(rlp); rlp.connect(rg); rg.connect(g);
        rm.connect(rmg); rmg.connect(g);
        rs.start(); rm.start();
        sc.parts.push(rs, rm);
        sc.peak = .34;
      } else if (kind === 'wind') {
        /* 风：噪声经带通，截止频率被慢速 LFO 来回扫 */
        var ws = ctx.createBufferSource();
        ws.buffer = noiseBuffer(4); ws.loop = true;
        var wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 520; wbp.Q.value = 1.6;
        var wl = ctx.createOscillator(); wl.frequency.value = .062;
        var wlg = ctx.createGain(); wlg.gain.value = 380;
        var wg = ctx.createGain(); wg.gain.value = .62;
        wl.connect(wlg); wlg.connect(wbp.frequency);
        ws.connect(wbp); wbp.connect(wg); wg.connect(g);
        ws.start(); wl.start();
        sc.parts.push(ws, wl);
        sc.peak = .40;
      } else if (kind === 'wave') {
        /* 海浪：低通噪声 + 极慢的音量涌落 */
        var os = ctx.createBufferSource();
        os.buffer = noiseBuffer(5); os.loop = true;
        var olp = ctx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 780; olp.Q.value = .6;
        var oa = ctx.createGain(); oa.gain.value = .5;
        var ol = ctx.createOscillator(); ol.frequency.value = .115;
        var olg = ctx.createGain(); olg.gain.value = .34;
        os.connect(olp); olp.connect(oa); oa.connect(g);
        ol.connect(olg); olg.connect(oa.gain);
        os.start(); ol.start();
        sc.parts.push(os, ol);
        sc.peak = .42;
      } else if (kind === 'cricket') {
        /* 虫鸣：夜色底噪 + timer 触发的颤音串 */
        var cs = ctx.createBufferSource();
        cs.buffer = noiseBuffer(3); cs.loop = true;
        var chp = ctx.createBiquadFilter(); chp.type = 'bandpass'; chp.frequency.value = 5200; chp.Q.value = .8;
        var cg = ctx.createGain(); cg.gain.value = .06;
        cs.connect(chp); chp.connect(cg); cg.connect(g);
        cs.start();
        sc.parts.push(cs);
        sc.peak = .50;
      } else {
        sc.peak = .60;
      }
      scenes[kind] = sc;
      schedule(sc);
      return sc;
    }

    return {
      get ctx() { return ctx; },
      get master() { return master; },
      get analyser() { return analyser; },
      get enabled() { return enabled && !!ctx; },
      ensure: ensure, resume: resume, spectrum: spectrum, energy: energy,
      tone: tone, noise: noise, noiseBuffer: noiseBuffer, makeIR: makeIR, bedBuffer: bedBuffer,
      ambient: ambient,
      /* 场景音：on/off 只改开关，音量由 setScene 每帧写入 */
      scene: function (kind, on) {
        ensure();
        if (!ctx) return null;
        var sc = scenes[kind] || buildScene(kind);
        if (!sc) return null;
        sc.on = !!on;
        if (on) { if (ctx.state === 'suspended') ctx.resume(); if (!sc.timer) schedule(sc); }
        return sc;
      },
      setScene: function (kind, v) {
        var sc = scenes[kind];
        if (!sc) return;
        sc.level = DK.clamp(v, 0, 1);
        try { sc.g.gain.setTargetAtTime(sc.level * sc.peak, ctx.currentTime, .12); } catch (e) { }
      },
      sceneLevel: function (kind) { var sc = scenes[kind]; return sc ? sc.level : 0; },
      stopScene: function (kind) {
        var sc = scenes[kind];
        if (!sc) return;
        sc.on = false; clearTimeout(sc.timer); sc.timer = 0;
        try { sc.g.gain.setTargetAtTime(0, ctx.currentTime, .18); } catch (e) { }
        var parts = sc.parts; delete scenes[kind];
        setTimeout(function () {
          parts.forEach(function (n) { try { n.stop(); } catch (e) { } });
          try { sc.g.disconnect(); } catch (e) { }
        }, 1200);
      },
      /* 统一点击音：detent 咔哒 + 短促高频泛音 */
      click: function () {
        if (!enabled) return;
        noise({ dur: .04, gain: .09, filters: [{ type: 'bandpass', freq: 1100, q: 8 }] });
        tone({ type: 'triangle', freq: 1240, dur: .07, gain: .022, attack: .004 });
      },
      /* 悬停音：更轻更闷，带冷却由调用方控制 */
      hover: function () {
        if (!enabled) return;
        noise({ dur: .028, gain: .05, filters: [{ type: 'bandpass', freq: 720, q: 10 }] });
      },
      now: function () { return ctx ? ctx.currentTime : 0; }
    };
  })();

  /* ---------------- Smooth scroll（Lenis 等效） ----------------
     自己不做 transform，而是每帧 window.scrollTo —— 这样 position:sticky 才不失效。 */
  DK.smooth = (function () {
    var target = 0, current = 0, active = false, stop = null, prog = false, on = false;
    var listeners = [];

    function maxScroll() {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }
    function loop(dt) {
      var m = maxScroll();
      target = DK.clamp(target, 0, m);
      current = DK.approach(current, target, 90, dt);
      if (Math.abs(target - current) < .12) { current = target; }
      prog = true;
      window.scrollTo(0, current);
      prog = false;
      listeners.forEach(function (f) { f(current, target); });
      var busy = Math.abs(target - current) > .05;
      if (!busy) { active = false; return false; }   // 收敛即停机
      return true;
    }
    function kick() { if (!active) { active = true; DK.ticker.add(loop); } }
    function onWheel(e) {
      if (e.ctrlKey) return;                    // 缩放手势放行
      e.preventDefault();
      var d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
      target = DK.clamp(target + d, 0, maxScroll());
      kick();
    }
    function onScroll() {
      if (prog) return;                          // 自己写的滚动不算外部输入
      var y = window.scrollY;
      if (Math.abs(y - current) > 2) { current = y; target = y; }
    }
    function onKey(e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      var step = window.innerHeight * .85, tag = e.key;
      if (tag === 'PageDown' || (tag === ' ' && !e.shiftKey)) { target = DK.clamp(target + step, 0, maxScroll()); kick(); }
      else if (tag === 'PageUp' || (tag === ' ' && e.shiftKey)) { target = DK.clamp(target - step, 0, maxScroll()); kick(); }
      else if (tag === 'Home') { target = 0; kick(); }
      else if (tag === 'End') { target = maxScroll(); kick(); }
      else return;
      e.preventDefault();
    }
    return {
      init: function () {
        if (on) return;
        on = true;
        if (DK.env.reduce || DK.env.coarse) {     // 降级：原生滚动
          current = target = window.scrollY;
          window.addEventListener('scroll', onScroll, { passive: true });
          return;
        }
        current = target = window.scrollY;
        window.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('keydown', onKey);
        window.addEventListener('resize', function () { target = DK.clamp(target, 0, maxScroll()); });
      },
      to: function (y, dur) {
        y = DK.clamp(y, 0, maxScroll());
        if (DK.env.reduce || DK.env.coarse) { window.scrollTo(0, y); return; }
        var from = target, t0 = performance.now();
        dur = dur || 900;
        if (stop) stop();
        stop = DK.ticker.add(function (dt, now) {
          var p = DK.clamp(((now || performance.now()) - t0) / dur);
          target = DK.lerp(from, y, DK.easeInOutQuad(p));
          if (p >= 1) { stop = null; return false; }
          return true;
        });
        kick();
      },
      on: function (fn) { listeners.push(fn); },
      get y() { return current; }
    };
  })();

  /* ---------------- Media scheduler ----------------
     无外部视频源时，把「footage」当作媒体槽管理：
     load 边距 150% / play 边距 10% / 最大并发 2 / 页面隐藏全暂停 / 按 src 去重 */
  DK.media = (function () {
    var MAX = 2, TIMEOUT = 4000;
    var slots = [], playing = 0, byKey = new Map();
    var io = null, ioLoad = null;

    function keyOf(el) { return el.dataset.footage || 'default'; }
    function register(el) {
      var s = { el: el, key: keyOf(el), visible: false,
                lit: el.getAttribute('data-lit') !== '0', want: false,
                started: 0, playing: false, timeout: 0 };
      slots.push(s);
      var k = s.key;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(s);
      ioLoad && ioLoad.observe(el);
      io && io.observe(el);
      return s;
    }
    function tryStart(s) {
      if (s.playing || playing >= MAX) return;
      playing++; s.playing = true; s.started = performance.now();
      s.el.classList.remove('is--paused');
      s.el.classList.add('is--playing');
      clearTimeout(s.timeout);
      s.timeout = setTimeout(function () { stop(s); }, TIMEOUT);
    }
    function stop(s) {
      if (!s.playing) return;
      s.playing = false; playing = Math.max(0, playing - 1);
      clearTimeout(s.timeout);
      s.el.classList.add('is--paused');
      s.el.classList.remove('is--playing');
    }
    function evaluate() {
      slots.forEach(function (s) {
        var want = s.visible && s.lit !== false;
        if (want) tryStart(s); else stop(s);
      });
    }
    return {
      init: function () {
        ioLoad = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            var s = slots.find(function (x) { return x.el === e.target; });
            if (s) s.loaded = s.loaded || e.isIntersecting;
          });
        }, { rootMargin: '150%' });

        io = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            var s = slots.find(function (x) { return x.el === e.target; });
            if (s) { s.visible = e.isIntersecting; }
          });
          evaluate();
        }, { rootMargin: '10%' });

        document.addEventListener('visibilitychange', function () {
          if (document.hidden) slots.forEach(stop); else evaluate();
        });
      },
      scan: function (root) {
        (root || document).querySelectorAll('[data-footage]').forEach(function (el) {
          if (el.classList.contains('is--paused') === false && el.dataset.reg) return;
          el.dataset.reg = '1';
          register(el);
        });
      },
      setLit: function (el, lit) {
        var s = slots.find(function (x) { return x.el === el; });
        if (s) { s.lit = lit; evaluate(); }
      },
      get activeCount() { return playing; }
    };
  })();

  /* ---------------- 小工具 ---------------- */
  DK.$ = function (s, r) { return (r || document).querySelector(s); };
  DK.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  DK.inView = function (el, cb, opts) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { cb(el); if (opts && opts.once) io.disconnect(); } });
    }, { rootMargin: (opts && opts.rootMargin) || '0px', threshold: (opts && opts.threshold) || 0 });
    io.observe(el);
    return io;
  };
  /* 等 intro-revealed 事件 + requestIdleCallback，不抢入场动画的主线程 */
  DK.afterIntro = function (fn, timeout) {
    function run() {
      var go = function () { fn(); };
      if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: timeout || 2500 });
      else setTimeout(go, 260);
    }
    if (document.documentElement.hasAttribute('data-intro-done')) run();
    else window.addEventListener('dk:intro-revealed', run, { once: true });
  };
})();
