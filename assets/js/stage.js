/* ============================================================
   stage.js — 影片舞台
   ------------------------------------------------------------
   任何 [data-stage] 载体点一下 → 从卡片原位「翻转」飞到屏幕中央全屏播放；
   关闭时旋转 + 缩小飞回原位（旋转退出）。

   触发源统一从这里进入：
     · .proj_media       近作三张大卡
     . .vcard             影像库 V·01–V·12（由 works.js 注入展开按钮）
     · .plist_item        近作下方 01–10 案例列表（src 由 POOL 分配）

   全部走 transform / opacity，不用 backdrop-filter；尊重 reduced-motion。
   ============================================================ */
(function () {
  'use strict';
  var DK = window.DK;
  var openState = null;

  /* plist 案例列表的视频分配池 */
  var POOL = [
    'dior-glitter', 'lillians-magic-time', 'tmall-618', 'porsche-wild-force',
    'wessen-acid-project', 'banda-daijia', 'guilin-xiguashuang-tvc',
    'kuaike-elevator', 'guilin-pen-pen', 'tylenol-jp'
  ];

  function q(el, sel) { var n = el.querySelector(sel); return n ? n.textContent.trim() : ''; }

  function srcOf(el) {
    var s = el.getAttribute('data-stage-src');
    if (s) return s;
    var v = el.querySelector('video');
    return v ? v.getAttribute('src') : '';
  }

  function titleOf(el) {
    var own = el.getAttribute('data-stage-title');
    if (own) return own;
    /* 触发点在媒体区时，标题要往上层卡片找 */
    var host = el.closest ? el.closest('.proj_card, .vcard') : null;
    return q(el, '.proj_title') || q(el, '.vcard_title') ||
      (host ? q(host, '.proj_title') || q(host, '.vcard_title') : '');
  }
  function metaOf(el) {
    var own = el.getAttribute('data-stage-meta');
    if (own) return own;
    var host = el.closest ? el.closest('.proj_card, .vcard') : null;
    return q(el, '.vcard_tag') || q(el, '.y') ||
      (host ? q(host, '.vcard_tag') || q(host, '.y') : '');
  }

  /* 起始 / 目标 transform：transform-origin 0 0，按 rect 差值为基准叠加旋转 */
  function fly(rect, tx, ty, tw, th, k) {
    var dx = rect.left + rect.width / 2 - (tx + tw / 2);
    var dy = rect.top + rect.height / 2 - (ty + th / 2);
    var sx = Math.max(.02, rect.width / tw), sy = Math.max(.02, rect.height / th);
    var ry = -26 * k, rz = -5 * k;
    return 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) ' +
           'rotateY(' + ry.toFixed(2) + 'deg) rotateZ(' + rz.toFixed(2) + 'deg) ' +
           'scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')';
  }

  function close() {
    if (!openState) return;
    var s = openState;
    openState = null;
    if (s.off) s.off();                               /* 摘掉拖拽监听，避免关闭过程被改写 */
    document.removeEventListener('keydown', s.esc);
    document.removeEventListener('scroll', s.closeNow, true);

    var v = s.video;
    if (v) { try { v.pause(); } catch (e) {} }

    if (DK.env.reduce) {
      s.root.remove();
      document.body.classList.remove('is--locked');
      s.trigger.focus && s.trigger.focus();
      return;
    }

    s.root.classList.add('is--closing');
    /* 解除滚动锁：旋转动画开始就放开，避免退出后页面卡死无法滚动 */
    document.body.classList.remove('is--locked');
    var r = s.trigger.getBoundingClientRect();
    if (!r.width) { s.root.remove(); try { s.trigger.focus(); } catch (e) {} return; }
    s.frame.style.transition = 'transform .58s cubic-bezier(.55,0,.24,1), opacity .5s ease-in';
    s.frame.style.transform = fly(r, s.tx, s.ty, s.tw, s.th, -.52);
    s.frame.style.opacity = '0';
    setTimeout(function () { s.root.remove(); }, 620);
    try { s.trigger.focus(); } catch (e) {}
  }

  function open(trigger) {
    if (openState) { if (openState.trigger !== trigger) close(); else return; }
    var src = srcOf(trigger);
    if (!src) return;

    var rect = trigger.getBoundingClientRect();
    var vw = Math.min(window.innerWidth * .92, 1280);
    var vh = vw * 9 / 16;
    if (vh > window.innerHeight * .84) { vh = window.innerHeight * .84; vw = vh * 16 / 9; }
    var tx = Math.round((window.innerWidth - vw) / 2);
    var ty = Math.round((window.innerHeight - vh) / 2);

    var root = document.createElement('div');
    root.className = 'stage';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', (titleOf(trigger) || '影片') + ' — 播放');

    var frame = document.createElement('div');
    frame.className = 'stage_frame';
    frame.style.left = tx + 'px';
    frame.style.top = ty + 'px';
    frame.style.width = vw + 'px';
    frame.style.height = vh + 'px';

    frame.innerHTML =
      '<video class="stage_video" src="' + src + '" controls playsinline preload="auto"></video>' +
      '<div class="stage_bar">' +
        '<span class="stage_title"></span>' +
        '<span class="stage_meta"></span>' +
        '<button class="btn stage_close" data-cursor="hover">' +
          '<i class="tick tl"></i><i class="tick tr"></i><i class="tick bl"></i><i class="tick br"></i>' +
          '關閉 ESC</button>' +
      '</div>' +
      '<button class="stage_x" data-cursor="hover" aria-label="關閉">✕</button>';

    frame.querySelector('.stage_title').textContent = titleOf(trigger);
    frame.querySelector('.stage_meta').textContent = metaOf(trigger);

    /* 起始位：从卡片原位翻出 */
    frame.style.transform = fly(rect, tx, ty, vw, vh, 1);
    frame.style.opacity = '0';
    root.appendChild(frame);
    document.body.appendChild(root);
    document.body.classList.add('is--locked');

    if (!DK.env.reduce) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          frame.style.transition = 'transform .74s cubic-bezier(.16,1,.3,1), opacity .42s ease-out';
          frame.style.transform = 'translate3d(0,0,0) rotateY(0deg) rotateZ(0deg) scale(1,1)';
          frame.style.opacity = '1';
        });
      });
      requestAnimationFrame(function () { root.classList.add('is--open'); });
    } else {
      frame.style.transform = 'none'; frame.style.opacity = '1';
      root.classList.add('is--open');
    }

    var video = frame.querySelector('.stage_video');
    var playP = video.play();
    if (playP && playP.catch) playP.catch(function () {});
    try { video.focus(); } catch (e) {}

    var s = {
      root: root, frame: frame, video: video, trigger: trigger,
      tx: tx, ty: ty, tw: vw, th: vh, off: null,
      esc: function (e) { if (e.key === 'Escape') { e.preventDefault(); close(); } },
      closeNow: function () { close(); }
    };
    openState = s;

    /* ---- 拖拽甩出：跟手旋转/位移，过阈值或快甩即旋转飞回卡片 ---- */
    if (!DK.env.reduce) {
      var drag = null;
      function onDown(e) {
        if (openState !== s || drag) return;
        var t = e.target;
        if (t && t.closest && t.closest('.stage_bar, .stage_x, .stage_close, button')) return;
        var r = frame.getBoundingClientRect();
        if (e.clientY > r.bottom - 56) return;        /* 让出原生控制条 */
        drag = { x: e.clientX, y: e.clientY, lx: e.clientX, lt: performance.now(), v: 0 };
        frame.style.transition = 'none';
      }
      function onMove(e) {
        if (!drag) return;
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        var now = performance.now(), dt = Math.max(8, now - drag.lt);
        drag.v = (e.clientX - drag.lx) / dt * 16;      /* px / 帧 */
        drag.lx = e.clientX; drag.lt = now;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var rz = DK.clamp ? DK.clamp(dx * .06, -16, 16) : Math.max(-16, Math.min(16, dx * .06));
        frame.style.transform =
          'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0) ' +
          'rotateY(' + (-rz * 1.4).toFixed(2) + 'deg) rotateZ(' + rz.toFixed(2) + 'deg) ' +
          'scale(' + Math.max(.9, 1 - dist / 3000).toFixed(4) + ')';
        frame.style.opacity = Math.max(.45, 1 - dist / 900).toFixed(3);
      }
      function onUp(e) {
        if (!drag) return;
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        var dist = Math.sqrt(dx * dx + dy * dy), fast = Math.abs(drag.v) > 14;
        drag = null;
        if (fast || Math.abs(dx) > 150 || dy > 200) { close(); return; }
        frame.style.transition = 'transform .5s cubic-bezier(.16,1,.3,1), opacity .4s';
        frame.style.transform = 'translate3d(0,0,0) rotateY(0deg) rotateZ(0deg) scale(1,1)';
        frame.style.opacity = '1';
      }
      frame.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      s.off = function () {
        drag = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
    }

    document.addEventListener('keydown', s.esc);
    frame.querySelector('.stage_close').addEventListener('click', close);
    frame.querySelector('.stage_x').addEventListener('click', close);
    root.addEventListener('click', function (e) { if (e.target === root) close(); });

    if (DK.audio && DK.audio.enabled) DK.audio.click();
  }

  DK.stage = {
    init: function () {
      /* 1. 近作下方案例列表：动态绑定（避免手改 10 行 HTML） */
      DK.$$('.plist_item').forEach(function (el, i) {
        el.setAttribute('data-stage', '');
        el.setAttribute('data-stage-src', 'assets/works/video/' + POOL[i % POOL.length] + '.mp4');
        el.setAttribute('data-stage-title', q(el, '.t'));
        el.setAttribute('data-stage-meta', q(el, '.y'));
        el.setAttribute('data-cursor', 'hover');
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', '播放 ' + q(el, '.t'));
      });

      /* 1b. 近作大卡 + 影像库视频卡：统一挂 stage 入口 */
      DK.$$('.proj_media, .vcard').forEach(function (el) {
        if (el.hasAttribute('data-stage')) return;
        el.setAttribute('data-stage', '');
        el.setAttribute('data-cursor', 'hover');
        el.setAttribute('data-hover', '点击进入播放');
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
        /* 影像库：右上角「展开」按钮（视觉提示，点击冒泡到卡片本身） */
        if (el.classList.contains('vcard') && !el.querySelector('.vcard_expand')) {
          var b = document.createElement('span');
          b.className = 'vcard_expand';
          b.setAttribute('aria-hidden', 'true');
          b.textContent = '展开 ⟶';
          var media = el.querySelector('.vcard_media') || el;
          media.appendChild(b);
        }
      });

      /* 2. 统一代理：点击 / 键盘 */
      document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var hit = t.closest('[data-stage]');
        if (!hit) return;
        if (hit.tagName === 'VIDEO') return;           /* 卡片内原生控制条照常可用 */
        e.preventDefault();
        open(hit);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var t = document.activeElement;
        if (t && t.hasAttribute && t.hasAttribute('data-stage')) { e.preventDefault(); open(t); }
      });
    },
    open: open, close: close,
    get isOpen() { return !!openState; }
  };
})();
