/* ============================================================
   zoom.js — 圖片放大檢視（about 插圖等 [data-zoom] 載體）
   點擊 → 全屏放大層（縮放淡入）；退出：✕ / ESC / 點擊空白處。
   零依賴，transform/opacity 動畫，尊重 reduced-motion。
   ============================================================ */
(function () {
  'use strict';
  var DK = window.DK || (window.DK = {});

  function init() {
    var items = DK.$$ ? DK.$$('[data-zoom]') : Array.prototype.slice.call(document.querySelectorAll('[data-zoom]'));
    if (!items.length || DK.zoom && DK.zoom.ready) return;

    var ov = document.createElement('div');
    ov.className = 'zoomer';
    ov.hidden = true;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', '圖片放大檢視');
    ov.innerHTML =
      '<button class="zoomer_x" type="button" data-cursor="hover" aria-label="關閉（ESC）">✕</button>' +
      '<figure class="zoomer_stage"><img alt=""></figure>';
    document.body.appendChild(ov);

    var img = ov.querySelector('img');
    var xBtn = ov.querySelector('.zoomer_x');
    var lastFocus = null, opened = false, hideTimer = 0;

    function openAt(fig) {
      var im = fig.querySelector('img');
      if (!im) return;
      lastFocus = document.activeElement;
      img.src = im.currentSrc || im.src;
      img.alt = im.alt || '';
      clearTimeout(hideTimer);
      ov.hidden = false;
      opened = true;
      requestAnimationFrame(function () { ov.classList.add('is--open'); });
      document.body.classList.add('is--locked');
      try { xBtn.focus(); } catch (e) { }
      try { if (DK.audio && DK.audio.click) DK.audio.click(); } catch (e) { }
    }

    function close() {
      if (!opened) return;
      opened = false;
      ov.classList.remove('is--open');
      document.body.classList.remove('is--locked');
      hideTimer = setTimeout(function () { ov.hidden = true; img.removeAttribute('src'); },
        (DK.env && DK.env.reduce) ? 0 : 400);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    items.forEach(function (fig) {
      if (fig.dataset.zoomReady) return;
      fig.dataset.zoomReady = '1';
      fig.addEventListener('click', function () { openAt(fig); });
      fig.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAt(fig); }
      });
    });

    xBtn.addEventListener('click', close);
    /* 點空白處 / 點圖片本身均可退出 */
    ov.addEventListener('click', function (e) { close(); });
    document.addEventListener('keydown', function (e) {
      if (!opened) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    DK.zoom = { ready: true, open: openAt, close: close };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
