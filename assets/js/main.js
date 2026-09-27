/* ============================================================
   main.js — 装配
   ============================================================ */
(function () {
  'use strict';
  var DK = window.DK;

  function nav() {
    var links = DK.$$('.nav_link');
    var pairs = [];
    links.forEach(function (a) {
      var id = (a.getAttribute('href') || '').replace('#', '');
      var sec = id && document.getElementById(id);
      if (sec) pairs.push({ a: a, sec: sec });
    });
    if (!pairs.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var hit = pairs.find(function (p) { return p.sec === e.target; });
        if (!hit) return;
        if (e.isIntersecting) {
          pairs.forEach(function (p) { p.a.classList.remove('is--active'); });
          hit.a.classList.add('is--active');
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    pairs.forEach(function (p) { io.observe(p.sec); });

    /* 锚点走平滑滚动 */
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      var t = document.getElementById(id);
      if (!t) return;
      e.preventDefault();
      DK.smooth.to(t.getBoundingClientRect().top + window.scrollY - 40, 1100);
    });
  }

  function boot() {
    /* 所有 footage 默认暂停，交给调度器 */
    DK.$$('[data-footage]').forEach(function (el) { el.classList.add('is--paused'); });

    DK.media.init();

    DK.gate.init();          // 0 · 入场闸门（内部会启动平滑滚动）
    DK.pulse.init();         // 1 · Hero 频谱
    DK.spotlight.init();     // 2 · 逐字聚光灯
    DK.wave.init();          // 3 · 逐词点亮
    DK.faders.init();        // 4 · 调音台推子
    DK.pegel.init();         // 5 · 电平柱
    DK.projects.init();      // 6 · 幕布揭示 + 跟随预览
    DK.faq.init();           // 7 · 手风琴
    DK.collage.init();       // 8 · 磁吸拼贴
    DK.meters.init();        // 通用电平表
    DK.instrument.init();    // 页脚弦乐器
    DK.cursor.init();        // 自定义光标
    DK.pill.init();          // Hover 胶囊
    DK.fitWidth.init();      // 巨标自适应

    if (DK.stage && DK.stage.init) DK.stage.init();   // 影片舞台：卡片 → 翻转飞入 / 旋转退出
    DK.media.scan(document);
    nav();

    /* ---- 环境视频调度器：video[data-ambient] 可见才播，切页全停 ---- */
    (function () {
      var vids = DK.$$('video[data-ambient]');
      if (!vids.length) return;
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var v = e.target;
          if (e.isIntersecting) v.play().catch(function () {});
          else v.pause();
        });
      }, { rootMargin: '12%' });
      vids.forEach(function (v) { io.observe(v); });
      document.addEventListener('visibilitychange', function () {
        vids.forEach(function (v) {
          if (document.hidden) v.pause();
          else if (v.getBoundingClientRect().top < innerHeight && v.getBoundingClientRect().bottom > 0) v.play().catch(function () {});
        });
      });
    })();

    /* ---- 入场结束后：常驻环境音床（低频空气感，驱动频谱微动） ---- */
    DK.afterIntro(function () {
      if (!DK.env.reduce) DK.audio.ambient(true);
      document.addEventListener('visibilitychange', function () {
        if (DK.audio.enabled) DK.audio.ambient(!document.hidden);
      });
    });

    /* 首屏滚动进度 / 兜底：直接把当前滚动位置同步给平滑滚动 */
    window.addEventListener('resize', function () { DK.smooth.to(window.scrollY, 0); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
