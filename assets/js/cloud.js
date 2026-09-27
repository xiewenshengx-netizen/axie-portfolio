/* ============================================================
   cloud.js — 雲端服務接入（Database 模組）
   ------------------------------------------------------------
   · 以 CDN 全域 WorkBuddyCloud 初始化單例客戶端（endpoint + publishableKey）
   · 作品熱度：影片卡上的播放數 / 喜歡數，點開播放器即累加
   · 訪客留言：表單投稿進 guest_messages（無需登入）
   · 任何雲端請求失敗都要有可見回饋，不靜默吞掉
   ES5 IIFE，與全站風格一致，零構建步驟。
   ============================================================ */
(function () {
  'use strict';
  var DK = window.DK || (window.DK = {});

  /* publicConfig —— 只有這三個值允許出現在前端原始碼，全部取自開通結果 */
  var CONFIG = {
    endpoint: 'https://axie-portfolio.app.workbuddy.host',
    publishableKey: 'wbpk_eaxcwpltFN4g12nkhjvPR7_vAs5fDsQVNkOKh41wJ1BRuJgon7q9SHv'
  };

  var cloud = null;         /* 單例客戶端 */
  var counts = {};          /* slug -> { views, likes } */
  var views = {};           /* slug -> [顯示播放數的節點] */
  var likes = {};           /* slug -> [顯示喜歡數的節點] */
  var pending = false;      /* 表單送出中 */
  var toast = null, toastTimer = 0;

  /* ---------- 可見回饋：失敗時一定有提示 ---------- */
  function notify(msg, bad) {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'cloud_toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.toggle('is--bad', bad !== false);
    toast.classList.add('is--on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is--on'); }, bad === false ? 2600 : 4200);
  }

  /* ---------- 客戶端：初始化一次，全模組共用 ---------- */
  function client() {
    if (cloud) return cloud;
    var g = window.WorkBuddyCloud;
    if (!g || typeof g.createWorkBuddyCloud !== 'function') return null;
    try {
      cloud = g.createWorkBuddyCloud({
        endpoint: CONFIG.endpoint,
        publishableKey: CONFIG.publishableKey
      });
    } catch (e) { cloud = null; }
    return cloud;
  }

  function fail(err, what) {
    /* 平台層 / 網路層 / RLS 層都給得出中文結論 */
    var code = err && (err.code || err.status);
    var msg = (err && err.message) ? String(err.message) : '';
    if (code === '42P01') notify('雲端表尚未就緒，請稍後再試');
    else if (code === '42501') notify('沒有這項操作的權限');
    else if (code === 'P0001') notify(msg.replace(/^[^:]*:\s*/, '') || '送出失敗');
    else if (err && msg.indexOf('Failed to fetch') > -1) notify('連線失敗，請檢查網路後再試');
    else notify((what || '操作') + '失敗，請稍後再試');
    if (window.console && console.warn) console.warn('[cloud] ' + (what || '') , err);
  }

  /* ---------- slug：影片檔名即作品 ID ---------- */
  function slugOf(el) {
    if (!el) return '';
    var raw = el.getAttribute('data-stage-src');
    if (!raw) {
      var v = el.querySelector && el.querySelector('video');
      raw = v ? v.getAttribute('src') : '';
    }
    var m = /([^\/\\]+)\.(mp4|webm|mov)$/i.exec(raw || '');
    return m ? m[1] : '';
  }

  function num(n) {
    n = Number(n) || 0;
    return n >= 1000 ? (Math.round(n / 100) / 10) + 'k' : String(n);
  }

  /* ---------- 熱度徽標：影像庫影片卡 + 近作大卡 ---------- */
  function paint(slug) {
    var c = counts[slug] || { views: 0, likes: 0 };
    (views[slug] || []).forEach(function (n) { n.textContent = num(c.views); });
    (likes[slug] || []).forEach(function (n) { n.textContent = num(c.likes); });
  }

  function badge(slug) {
    var wrap = document.createElement('span');
    wrap.className = 'hot';
    wrap.innerHTML =
      '<span class="hot_views" title="播放次數"><i>▶</i><b>0</b></span>' +
      '<button class="hot_like" type="button" title="喜歡這支片子" aria-label="喜歡這支片子">' +
        '<i>♥</i><b>0</b></button>';
    /* 同一支片子可能出现在近作与影像库两处：节点要追加，不能覆盖 */
    views[slug] = (views[slug] || []).concat([wrap.querySelector('.hot_views b')]);
    likes[slug] = (likes[slug] || []).concat([wrap.querySelector('.hot_like b')]);
    wrap.querySelector('.hot_like').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      bumpViews(slug, 'likes', this);
    });
    paint(slug);
    return wrap;
  }

  function mount() {
    DK.$$('.vcard').forEach(function (card) {
      var slug = slugOf(card);
      if (!slug || card.querySelector('.hot')) return;
      var meta = card.querySelector('.vcard_meta');
      (meta || card).appendChild(badge(slug));
    });
    DK.$$('.proj_card').forEach(function (card) {
      var slug = slugOf(card);
      if (!slug || card.querySelector('.hot')) return;
      var body = card.querySelector('.proj_body');
      (body || card).appendChild(badge(slug));
    });
  }

  /* ---------- 讀：一次性取回全部熱度 ---------- */
  function load() {
    var c = client();
    if (!c) return;
    c.database.from('work_stats').select('slug, views, likes')
      .then(function (res) {
        if (res.error) return fail(res.error, '讀取熱度');
        (res.data || []).forEach(function (r) {
          counts[r.slug] = { views: r.views, likes: r.likes };
          paint(r.slug);
        });
      })
      .catch(function (e) { fail(e, '讀取熱度'); });
  }

  /* ---------- 寫：播放 / 喜歡，走受控 RPC 自增 ---------- */
  function bumpViews(slug, field, btn) {
    var c = client();
    if (!c || !slug) return;
    if (btn) btn.disabled = true;
    c.database.rpc('bump_work_stat', { p_slug: slug, p_field: field })
      .then(function (res) {
        if (res.error) { fail(res.error, '更新熱度'); if (btn) btn.disabled = false; return; }
        var row = (res.data && res.data[0]) || null;
        if (row) counts[slug] = { views: row.o_views, likes: row.o_likes };
        else {
          var cur = counts[slug] || { views: 0, likes: 0 };
          cur[field] = (Number(cur[field]) || 0) + 1;
          counts[slug] = cur;
        }
        paint(slug);
        if (field === 'likes') notify('收到你的喜歡 · ♥', false);
        else if (btn) btn.disabled = false;
      })
      .catch(function (e) { fail(e, '更新熱度'); if (btn) btn.disabled = false; });
  }

  /* ---------- 播放入口統一計數（stage.js 的翻轉飛入） ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var hit = t.closest('[data-stage]');
    if (!hit) return;
    if (t.closest && t.closest('.hot_like')) return;      /* 喜歡鍵不觸發播放 */
    var slug = slugOf(hit);
    if (slug) bumpViews(slug, 'views');
  });

  /* ---------- 訪客留言 ---------- */
  function initForm() {
    var form = DK.$('.msgform');
    if (!form) return;
    var statusEl = form.querySelector('[data-msg-status]');
    var submitBtn = form.querySelector('button[type="submit"]');

    function say(text, bad) {
      if (statusEl) {
        statusEl.textContent = text;
        statusEl.classList.toggle('is--bad', bad !== false);
      }
      notify(text, bad);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (pending) return;
      var content = (form.querySelector('[name="content"]').value || '').trim();
      var contact = (form.querySelector('[name="contact"]').value || '').trim();
      var name = (form.querySelector('[name="name"]').value || '').trim();

      if (content.length < 2) { say('至少寫兩個字再送出', true); return; }
      var c = client();
      if (!c) {
        say('雲端尚未連上，可直接來信 hallo@dkton.at', true);
        return;
      }

      var body = (name ? '【' + name + '】' : '') + content;
      pending = true;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('is--busy'); }
      say('送出中…', false);

      c.database.rpc('post_guest_message', { p_contact: contact, p_content: body })
        .then(function (res) {
          pending = false;
          if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove('is--busy'); }
          if (res.error) { say('送出失敗：' + (res.error.message || '未知錯誤'), true); return; }
          form.reset();
          say('已送到雲端，我會盡快回你 · 謝謝', false);
        })
        .catch(function (err) {
          pending = false;
          if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove('is--busy'); }
          if (statusEl) { statusEl.textContent = '送出失敗'; statusEl.classList.add('is--bad'); }
          fail(err, '留言送出');
        });
    });
  }

  /* ---------- 啟動 ---------- */
  function boot() {
    if (!client()) {
      /* CDN 未就緒：只降级，不假裝成功 */
      var box = DK.$('.msgform');
      if (box) {
        var hint = box.querySelector('[data-msg-status]');
        if (hint) hint.textContent = '雲端服務暫時連不上，也可以直接來信 hallo@dkton.at';
      }
      return;
    }
    mount();
    load();
    initForm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  DK.cloud = {
    get: client,
    count: function (slug) { return counts[slug] || null; },
    bump: bumpViews,
    slugOf: slugOf
  };
})();
