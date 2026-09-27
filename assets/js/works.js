/* ============================================================
   works.js — 作品库交互（#werke）
   1) 图片瀑布网格：滚动渐显 + 点击开独立灯箱（←/→/ESC/点击热区）
   2) 视频卡：互斥播放（播放一个暂停其余）、播放态描边
   3) 点击音效走 DK.audio（若可用），与全站音频一致
   零依赖，IIFE 自包含。
   ============================================================ */
(function () {
  'use strict';
  var DK = window.DK || {};
  var $ = DK.$ || function (s, c) { return (c || document).querySelector(s); };
  var $$ = DK.$$ || function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1 · 图片网格：渐显 + 灯箱 ---------- */
  var items = $$('.gitem');
  var imgs = items.map(function (it) { return it.querySelector('img'); });
  var captions = items.map(function (it) {
    var cap = it.querySelector('.gitem_cap');
    return cap ? cap.textContent.trim() : '';
  });

  /* 渐显：IntersectionObserver，一次性 */
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    items.forEach(function (it) { io.observe(it); });
  } else {
    items.forEach(function (it) { it.classList.add('is-in'); });
  }

  /* 灯箱 */
  var lb = $('.glightbox');
  if (lb) {
    var lbImg = lb.querySelector('img');
    var lbCap = lb.querySelector('[data-glb-cap]');
    var lbIdx = lb.querySelector('[data-glb-idx]');
    var cur = 0;
    var lastFocus = null;

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function show(i) {
      cur = (i + imgs.length) % imgs.length;
      var src = imgs[cur].getAttribute('src');
      var full = imgs[cur].getAttribute('data-full') || src;
      lbImg.style.opacity = '0';
      /* 预加载完成后淡入，避免闪烁 */
      var tmp = new Image();
      tmp.onload = function () {
        lbImg.src = full;
        lbImg.style.opacity = '';
      };
      tmp.src = full;
      if (lbCap) lbCap.textContent = captions[cur];
      if (lbIdx) lbIdx.textContent = pad(cur + 1) + ' / ' + pad(imgs.length);
    }

    function open(i) {
      lastFocus = document.activeElement;
      lb.classList.add('is--open');
      document.documentElement.style.overflow = 'hidden';
      show(i);
      (lb.querySelector('.glightbox_close') || lb).focus && lb.focus();
      click();
    }
    function close() {
      lb.classList.remove('is--open');
      document.documentElement.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    items.forEach(function (it, i) {
      it.addEventListener('click', function () { open(i); });
      it.setAttribute('tabindex', '0');
      it.setAttribute('role', 'button');
      it.setAttribute('aria-label', '查看大图 ' + (captions[i] || ''));
      it.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
      });
    });

    var btnClose = lb.querySelector('.glightbox_close');
    var btnPrev = lb.querySelector('[data-glb-prev]');
    var btnNext = lb.querySelector('[data-glb-next]');
    btnClose && btnClose.addEventListener('click', close);
    btnPrev && btnPrev.addEventListener('click', function (e) { e.stopPropagation(); show(cur - 1); click(); });
    btnNext && btnNext.addEventListener('click', function (e) { e.stopPropagation(); show(cur + 1); click(); });
    /* 左右 18vw 点击热区翻页 */
    var navPrev = lb.querySelector('.glightbox_nav.is--prev');
    var navNext = lb.querySelector('.glightbox_nav.is--next');
    navPrev && navPrev.addEventListener('click', function () { show(cur - 1); click(); });
    navNext && navNext.addEventListener('click', function () { show(cur + 1); click(); });
    /* 点击背景空白处关闭 */
    lb.addEventListener('click', function (e) {
      if (e.target === lb || e.target.classList.contains('glightbox_stage')) close();
    });

    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('is--open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(cur - 1);
      else if (e.key === 'ArrowRight') show(cur + 1);
    });
    /* 简易焦点圈定 */
    lb.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusables = $$('.glightbox_btn', lb);
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ---------- 2 · 视频案例：悬停静音预览 + 点击进入播放器 ---------- */
  /* 播放清单：影像库 12 支 + 近作 3 支，统一编号，支持 ← → 切换 */
  var vb = $('.videobox');
  var playlist = [];

  $$('[data-playable]').forEach(function (card) {
    var v = card.querySelector('video');
    if (!v) return;
    var src = v.getAttribute('src');
    if (!src) return;
    var t = card.querySelector('.vcard_title, .proj_title');
    var idx = card.querySelector('.vcard_idx');
    var dur = card.querySelector('.vcard_dur');
    playlist.push({
      card: card, v: v, src: src,
      title: t ? t.textContent.trim() : '',
      label: idx ? idx.textContent.trim() : ''
    });
    var myIndex = playlist.length - 1;

    /* 悬停静音预览：只在小幅 Pin-point 上消耗带宽，离开即停 */
    card.addEventListener('mouseenter', function () {
      if (reduce) return;
      v.muted = true;
      v.play().then(function () { card.classList.add('is--playing'); }).catch(function () {});
    });
    card.addEventListener('mouseleave', function () {
      v.pause();
      card.classList.remove('is--playing');
    });

    /* 点击进入播放器（带声）——stage.js 在位时由它接管翻转/旋转退出，此分支只作兜底 */
    card.addEventListener('click', function (e) {
      if (DK.stage) return;
      if (e.target.closest && e.target.closest('a')) return;
      openVideo(myIndex);
    });
    card.setAttribute('aria-label', '播放：' + (t ? t.textContent.trim() : ''));
    card.addEventListener('keydown', function (e) {
      if (DK.stage) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openVideo(myIndex); }
    });

    /* 元数据到齐后写入时长徽标 */
    v.addEventListener('loadedmetadata', function () {
      if (dur && v.duration && isFinite(v.duration)) {
        var m = Math.floor(v.duration / 60), s = Math.floor(v.duration % 60);
        dur.textContent = m + ':' + (s < 10 ? '0' : '') + s;
      }
    });
  });

  var vbVid = vb && vb.querySelector('video');
  var vbTitle = vb && vb.querySelector('.videobox_title');
  var vbIdx = vb && vb.querySelector('.videobox_idx');
  var vbCur = 0, vbLastFocus = null, vbHadAmbient = false;
  var vbFrame = vb && vb.querySelector('.videobox_frame');
  var vbLeaveTimer = 0, vbOpened = false;

  /* ---------- 变换工具：全部写进 CSS 变量，由 .videobox_frame 消费 ---------- */
  function frameVars(o) {
    if (!vbFrame) return;
    if (o == null) {                                  /* 清空内联变量，回到静态态 */
      ['--dx', '--dy', '--rot', '--sc', '--op'].forEach(function (k) { vbFrame.style.removeProperty(k); });
      return;
    }
    vbFrame.style.setProperty('--dx', (o.dx || 0) + 'px');
    vbFrame.style.setProperty('--dy', (o.dy || 0) + 'px');
    vbFrame.style.setProperty('--rot', (o.rot || 0) + 'deg');
    vbFrame.style.setProperty('--sc', o.sc == null ? 1 : o.sc);
    vbFrame.style.setProperty('--op', o.op == null ? 1 : o.op);
  }

  /* 旋转退出：dir -1 左侧甩出 / 1 右侧 / 0 向上旋钮式退出 */
  function spinOut(dir) {
    if (!vb || !vbFrame || vb.classList.contains('is--leaving')) return;
    var sideways = dir !== 0;
    vb.classList.add('is--leaving');
    frameVars({
      dx: dir * (sideways ? 90 : 0),
      dy: sideways ? 40 : -70,
      rot: sideways ? dir * 26 : (dir === 0 ? -14 : 0),
      sc: .62,
      op: 0
    });
    clearTimeout(vbLeaveTimer);
    vbLeaveTimer = setTimeout(function () {
      vb.hidden = true;
      vb.classList.remove('is--leaving');
      vbOpened = false;
      frameVars(null);
      try { vbVid.removeAttribute('src'); vbVid.load(); } catch (e) {}
    }, 490);
  }

  function openVideo(i) {
    if (!vb || !vbVid || !playlist.length) return;
    clearTimeout(vbLeaveTimer);
    vbCur = (i + playlist.length) % playlist.length;
    var item = playlist[vbCur];

    /* 序列切换时不重复开场：只换源重播，保留已经打开的浮层 */
    if (!vbOpened) {
      vbLastFocus = document.activeElement;
      vbHadAmbient = !!(DK.audio && DK.audio.enabled);
      if (vbHadAmbient && DK.audio.ambient) DK.audio.ambient(false);
      vb.hidden = false;
      vb.classList.remove('is--leaving');
      requestAnimationFrame(function () { vb.classList.add('is--open'); });
      document.body.classList.add('is--locked');
      vbOpened = true;
    }

    /* 入场：微微带角度旋进来（reduce 下退化为直入） */
    if (reduce) frameVars({ dx: 0, dy: 0, rot: 0, sc: 1, op: 1 });
    else {
      frameVars({ dx: 0, dy: 34, rot: -7, sc: .88, op: 0 });
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { frameVars({ dx: 0, dy: 0, rot: 0, sc: 1, op: 1 }); });
      });
    }

    vbVid.src = item.src;
    vbVid.currentTime = 0;
    vbVid.muted = false;
    vbVid.volume = 1;
    vbVid.play().catch(function () { /* 浏览器拦截时留控制条给手动播放 */ });
    if (vbTitle) vbTitle.textContent = item.title;
    if (vbIdx) vbIdx.textContent = (vbCur < 9 ? '0' : '') + (vbCur + 1) + ' / ' + playlist.length +
      (item.label ? '  ·  ' + item.label : '');
    /* 卡内预览停掉，避免同一支视频两处发声 */
    playlist.forEach(function (p) { p.v.pause(); p.card.classList.remove('is--playing'); });
    var closeBtn = vb.querySelector('[data-vb-close]');
    closeBtn && closeBtn.focus();
    click();
  }

  function closeVideo(dir) {
    if (!vb || vb.hidden) return;
    vb.classList.remove('is--open');
    document.body.classList.remove('is--locked');
    vbVid.pause();
    spinOut(dir == null ? (Math.random() < .5 ? -1 : 1) : dir);
    if (vbHadAmbient && DK.audio && DK.audio.ambient) DK.audio.ambient(true);
    if (vbLastFocus && vbLastFocus.focus) vbLastFocus.focus();
  }

  function stepVideo(d) { openVideo(vbCur + d); click(); }

  if (vb) {
    var bPrev = vb.querySelector('[data-vb-prev]');
    var bNext = vb.querySelector('[data-vb-next]');
    var bClose = vb.querySelector('[data-vb-close]');
    bPrev && bPrev.addEventListener('click', function () { stepVideo(-1); });
    bNext && bNext.addEventListener('click', function () { stepVideo(1); });
    bClose && bClose.addEventListener('click', function () { closeVideo(0); });

    /* ---- 拖拽旋转甩出：跟手旋转/位移，过阈值或快甩即退出，否则回弹 ---- */
    (function () {
      if (!vbFrame || reduce) return;
      var dragging = false, sx = 0, sy = 0, lastX = 0, lastT = 0, vel = 0;

      function onDown(e) {
        if (vb.hidden || vb.classList.contains('is--leaving')) return;
        /* 播放器原生控制条区域不接管（stage 底部 64px），避免抢走拖拽 */
        var stage = vb.querySelector('.videobox_stage');
        if (e.target === vbVid && stage) {
          var r = stage.getBoundingClientRect();
          if (e.clientY > r.bottom - 64) return;
        }
        dragging = true;
        sx = e.clientX; sy = e.clientY; lastX = e.clientX; lastT = performance.now(); vel = 0;
        vbFrame.classList.add('is--dragging');
        vbFrame.setPointerCapture(e.pointerId);
      }
      function onMove(e) {
        if (!dragging) return;
        var dx = e.clientX - sx, dy = e.clientY - sy;
        var now = performance.now(), dt = Math.max(8, now - lastT);
        vel = (e.clientX - lastX) / dt * 16;       /* px / 帧 */
        lastX = e.clientX; lastT = now;
        var dist = Math.sqrt(dx * dx + dy * dy);
        frameVars({
          dx: dx, dy: dy,
          rot: DK.clamp ? DK.clamp(dx * .07, -18, 18) : Math.max(-18, Math.min(18, dx * .07)),
          sc: Math.max(.86, 1 - dist / 2600),
          op: Math.max(.55, 1 - dist / 1400)
        });
      }
      function onUp(e) {
        if (!dragging) return;
        dragging = false;
        vbFrame.classList.remove('is--dragging');
        try { vbFrame.releasePointerCapture(e.pointerId); } catch (err) {}
        var dx = e.clientX - sx, dy = e.clientY - sy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var fast = Math.abs(vel) > 14;
        /* 阈值：甩得快 / 水平位移 >150 / 垂直下拉 >190 → 旋转退出 */
        if (fast || Math.abs(dx) > 150 || dy > 190) closeVideo(dx >= 0 ? 1 : -1);
        else frameVars({ dx: 0, dy: 0, rot: 0, sc: 1, op: 1 });   /* 回弹 */
      }
      vbFrame.addEventListener('pointerdown', onDown);
      vbFrame.addEventListener('pointermove', onMove);
      vbFrame.addEventListener('pointerup', onUp);
      vbFrame.addEventListener('pointercancel', onUp);
    })();

    /* 点击遮罩空白处关闭 */
    vb.addEventListener('click', function (e) { if (e.target === vb) closeVideo(); });
    document.addEventListener('keydown', function (e) {
      if (vb.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeVideo(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepVideo(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepVideo(1); }
    });
    /* 简易焦点圈定 */
    vb.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = $$('.videobox_btn', vb);
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    vbVid.addEventListener('ended', function () { if (vb.hidden) return; stepVideo(1); });
  }

  /* ---------- 3 · 点击音效（若全站音频已就绪） ---------- */
  function click() {
    try {
      if (DK.audio && typeof DK.audio.click === 'function') DK.audio.click();
    } catch (_) { /* 静默：音效非关键路径 */ }
  }
})();
