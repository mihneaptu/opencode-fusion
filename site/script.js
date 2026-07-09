/* =========================================================================
   Sidekick Fusion - interactions
   Classic script (no modules). Runs from file:// with zero network access.
   ========================================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Scroll reveal --------------------------------------------------- */
  function initReveal() {
    var revealEls = document.querySelectorAll('.reveal');
    if (!revealEls.length) return;

    // If reduced motion is requested, or IntersectionObserver is unavailable,
    // show everything immediately and skip observing.
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealEls.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    revealEls.forEach(function (el) { observer.observe(el); });
  }

  /* ---- Copy-to-clipboard ---------------------------------------------- */
  function initCopy() {
    var buttons = document.querySelectorAll('.copy-btn[data-copy-target]');
    if (!buttons.length) return;

    buttons.forEach(function (btn) {
      var label = btn.querySelector('.copy-btn-text') || btn;
      var status = document.getElementById('copy-status');
      var revertTimer = null;

      btn.addEventListener('click', function () {
        var target = document.getElementById(btn.getAttribute('data-copy-target'));
        if (!target) return;
        var text = target.textContent.trim();

        copyText(text).then(function () {
          showCopied(true);
        }).catch(function () {
          // Fallback path (file:// clipboard access can be restricted)
          var ok = legacyCopy(text);
          showCopied(ok);
        });
      });

      function showCopied(ok) {
        var original = 'Copy';
        if (ok) {
          label.textContent = 'Copied';
          btn.classList.add('is-copied');
          if (status) status.textContent = 'Command copied to clipboard.';
        } else {
          label.textContent = 'Copy failed';
          if (status) status.textContent = 'Copy failed. Select the command and copy it manually.';
        }
        if (revertTimer) clearTimeout(revertTimer);
        revertTimer = setTimeout(function () {
          label.textContent = original;
          btn.classList.remove('is-copied');
          if (status) status.textContent = '';
        }, 2000);
      }
    });

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      return Promise.reject(new Error('Clipboard API unavailable'));
    }

    function legacyCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    }
  }

  /* ---- Mobile nav toggle ---------------------------------------------- */
  function initNav() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('nav-menu');
    if (!toggle || !nav) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      nav.classList.toggle('is-open', open);
    }

    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      setOpen(!open);
    });

    // Close the menu after following an in-page link.
    nav.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (link) setOpen(false);
    });

    // Close on Escape for keyboard users.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* ---- Smooth-scroll for in-page anchors (respect reduced motion) ----- */
  function initSmoothScroll() {
    if (reduceMotion) return; // fall back to default jump behavior

    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="#"]');
      if (!link) return;
      var href = link.getAttribute('href');
      if (href === '#' || href.length < 2) return;

      var target = document.getElementById(href.slice(1));
      if (!target) return;

      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Move focus for keyboard users without an extra visible jump.
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  }

  /* ---- Sticky-header elevation on scroll ------------------------------ */
  function initHeaderScroll() {
    var header = document.querySelector('.site-header');
    if (!header) return;

    var ticking = false;
    function update() {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      ticking = false;
    }
    // rAF-throttled scroll handler; CSS owns the (reduced-motion-aware) transition.
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  }

  /* ---- Theme (light / GitHub dark) ------------------------------------ */
  var THEME_KEY = 'theme';

  function currentTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    return t === 'dark' ? 'dark' : 'light';
  }

  function updateThemeToggleLabel(theme) {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var next = theme === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', 'Switch to ' + next + ' mode');
    btn.setAttribute('title', 'Switch to ' + next + ' mode');
  }

  // Apply theme to the DOM only. Does NOT write localStorage - persistence
  // is reserved for explicit user toggles. Behavior: initial = system until
  // first click, then sticky light/dark (no UI path back to "follow OS").
  function applyTheme(theme, options) {
    var opts = options || {};
    var next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    updateThemeToggleLabel(next);
    if (opts.syncVideo !== false) syncHeroVideo(next);
  }

  function initTheme() {
    // Head script already set data-theme; re-assert from storage/system and
    // enable smooth color transitions only after the first paint.
    // Stored value wins only if the user explicitly chose light/dark; otherwise
    // follow the OS preference without writing it to storage.
    var stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) { stored = null; }
    var theme = (stored === 'light' || stored === 'dark')
      ? stored
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light');
    applyTheme(theme, { syncVideo: true });

    // Defer theme-ready so the initial theme does not animate in.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.documentElement.classList.add('theme-ready');
      });
    });

    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = currentTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        // Persist only on explicit user action so OS preference can still win
        // until the user has chosen.
        try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode / file:// quirks */ }
      });
    }

    // Follow OS changes only when the user has not picked a theme.
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function (e) {
        var userPick = null;
        try { userPick = localStorage.getItem(THEME_KEY); } catch (err) { userPick = null; }
        if (userPick === 'light' || userPick === 'dark') return;
        applyTheme(e.matches ? 'dark' : 'light');
      };
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
      else if (typeof mq.addListener === 'function') mq.addListener(onChange);
    }
  }

  /* ---- Hero ambient video --------------------------------------------- */
  function tryPlayVideo(video) {
    var p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () { /* leave poster visible */ });
    }
  }

  function markVideoReady(video) {
    video.classList.remove('is-swapping');
    video.classList.add('is-ready');
    tryPlayVideo(video);
  }

  // Generation token: each syncHeroVideo call bumps this so stale loadeddata /
  // timeout callbacks from a previous swap bail out instead of fighting opacity.
  var heroVideoGen = 0;

  function syncHeroVideo(theme) {
    var video = document.getElementById('hero-video') || document.querySelector('.hero-video');
    if (!video) return;

    var gen = ++heroVideoGen;

    if (reduceMotion) {
      video.pause();
      video.classList.remove('is-ready', 'is-swapping');
      video.removeAttribute('autoplay');
      video.removeAttribute('src');
      while (video.firstChild) video.removeChild(video.firstChild);
      video.load();
      return;
    }

    var isDark = theme === 'dark';
    var src = video.getAttribute(isDark ? 'data-src-dark' : 'data-src-light');
    var poster = video.getAttribute(isDark ? 'data-poster-dark' : 'data-poster-light');
    if (!src) return;

    if (poster) video.setAttribute('poster', poster);

    // Already on the right file - just ensure playback.
    var current = '';
    var sourceEl = video.querySelector('source');
    if (sourceEl && sourceEl.getAttribute('src')) current = sourceEl.getAttribute('src');
    else if (video.getAttribute('src')) current = video.getAttribute('src');

    if (current === src) {
      if (gen === heroVideoGen) markVideoReady(video);
      return;
    }

    // Soft crossfade: fade out, swap source, fade back in when ready.
    var themed = document.documentElement.classList.contains('theme-ready');
    if (themed) {
      video.classList.add('is-swapping');
      video.classList.remove('is-ready');
    }

    var doSwap = function () {
      if (gen !== heroVideoGen) return;
      while (video.firstChild) video.removeChild(video.firstChild);
      var next = document.createElement('source');
      next.setAttribute('src', src);
      next.setAttribute('type', 'video/mp4');
      video.appendChild(next);

      // Attach listeners before load() so a cached/warm load cannot fire
      // loadeddata before we subscribe (would leave opacity at 0 forever).
      function onReady() {
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('error', onError);
        if (gen !== heroVideoGen) return;
        markVideoReady(video);
      }
      function onError() {
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('error', onError);
        if (gen !== heroVideoGen) return;
        // Failed fetch: clear swap fade so the CSS poster remains visible.
        video.classList.remove('is-swapping', 'is-ready');
      }
      video.addEventListener('loadeddata', onReady);
      video.addEventListener('error', onError);
      video.load();

      // Already-ready from cache: loadeddata may not fire again.
      if (video.readyState >= 2) onReady();
    };

    if (themed) setTimeout(doSwap, 180);
    else doSwap();
  }

  /* Measure harness label width + slot height; inject px keyframes so
     "Fusion" tracks width and the "p" descender never bleeds between rows. */
  function initHeroTitleRotator() {
    var title = document.getElementById('hero-title');
    var rotator = document.querySelector('.hero-title-rotator');
    if (!title || !rotator) return;

    var words = rotator.querySelectorAll('.hero-title-rotator-word');
    if (words.length < 3) return;

    var styleEl = document.getElementById('hero-rotator-kf');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'hero-rotator-kf';
      document.head.appendChild(styleEl);
    }

    function wordWidth(el) {
      var w = el.scrollWidth;
      if (!w) w = el.getBoundingClientRect().width;
      return Math.ceil(w);
    }

    var track = rotator.querySelector('.hero-title-rotator-track');
    var lastKey = '';

    function restartAnims() {
      /* Restart width + vertical together so they stay phase-locked. */
      rotator.style.animation = 'none';
      if (track) track.style.animation = 'none';
      void rotator.offsetWidth;
      rotator.style.animation = '';
      if (track) track.style.animation = '';
    }

    function measure() {
      /* Slot height: full glyph box of the tallest label (covers "p" descender). */
      var slotH = 0;
      for (var i = 0; i < words.length; i++) {
        var gh = Math.ceil(words[i].getBoundingClientRect().height);
        if (gh > slotH) slotH = gh;
      }
      /* Range measure catches ink that extends past the line box. */
      try {
        for (var r = 0; r < 3; r++) {
          var range = document.createRange();
          range.selectNodeContents(words[r]);
          var rr = range.getBoundingClientRect();
          var ink = Math.ceil(rr.height);
          if (ink > slotH) slotH = ink;
          range.detach && range.detach();
        }
      } catch (e) { /* ignore */ }

      /* A little padding so "p" sits fully inside the clip at rest. */
      if (slotH > 0) {
        slotH = Math.ceil(slotH + 2);
        title.style.setProperty('--hero-word-h', slotH + 'px');
      }

      /* First three unique labels (4th is a seamless-loop duplicate). */
      var widths = [];
      for (var j = 0; j < 3; j++) {
        var w = wordWidth(words[j]);
        if (w < 1) return;
        widths.push(w);
        rotator.style.setProperty('--hero-w-' + j, w + 'px');
      }
      var w0 = widths[0];
      var w1 = widths[1];
      var w2 = widths[2];
      /* Guard: if all three match, words are still stretched — skip inject. */
      if (w0 === w1 && w1 === w2) return;

      var h = slotH || Math.ceil(words[0].getBoundingClientRect().height);
      if (h < 1) return;

      var key = w0 + ',' + w1 + ',' + w2 + ',' + h;
      if (key === lastKey) return;
      lastKey = key;

      /* Integer px steps — no subpixel em drift that leaves a "p" sliver. */
      styleEl.textContent =
        '@keyframes hero-word-width{' +
        '0%,22%{width:' + w0 + 'px}' +
        '30%,52%{width:' + w1 + 'px}' +
        '60%,82%{width:' + w2 + 'px}' +
        '90%,100%{width:' + w0 + 'px}' +
        '}' +
        '@keyframes hero-word-cycle{' +
        '0%,22%{transform:translate3d(0,0,0)}' +
        '30%,52%{transform:translate3d(0,' + (-h) + 'px,0)}' +
        '60%,82%{transform:translate3d(0,' + (-h * 2) + 'px,0)}' +
        '90%,100%{transform:translate3d(0,' + (-h * 3) + 'px,0)}' +
        '}';
      restartAnims();
    }

    measure();
    /* Fonts may settle after first paint; remeasure once they are ready. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(function () {});
    }
    window.addEventListener('resize', measure);
  }

  function init() {
    initTheme(); // also loads the matching hero video
    initReveal();
    initCopy();
    initNav();
    initSmoothScroll();
    initHeaderScroll();
    initHeroTitleRotator();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
