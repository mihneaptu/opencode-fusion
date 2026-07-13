/* =========================================================================
   opencode Fusion - interactions
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

    /* Late reveals (e.g. flow diagram) use a stricter root margin so they
       enter a touch later than default reveals, without a scroll gate that
       could strand them invisible when already on screen at load. */
    var lateObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          lateObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -18% 0px', threshold: 0.2 });

    revealEls.forEach(function (el) {
      if (el.classList.contains('reveal-late')) lateObserver.observe(el);
      else observer.observe(el);
    });
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

      var originalAriaLabel = btn.getAttribute('aria-label');
      function showCopied(ok) {
        var original = 'Copy';
        if (ok) {
          label.textContent = 'Copied';
          btn.classList.add('is-copied');
          btn.setAttribute('aria-label', 'Copied to clipboard');
          if (status) status.textContent = 'Command copied to clipboard.';
        } else {
          label.textContent = 'Copy failed';
          btn.setAttribute('aria-label', 'Copy failed');
          if (status) status.textContent = 'Copy failed. Select the command and copy it manually.';
        }
        if (revertTimer) clearTimeout(revertTimer);
        revertTimer = setTimeout(function () {
          label.textContent = original;
          btn.classList.remove('is-copied');
          if (originalAriaLabel) btn.setAttribute('aria-label', originalAriaLabel);
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

  /* ---- GitHub stars (header pill) -------------------------------------- */
  function initStars() {
    var els = document.querySelectorAll('[data-gh-stars]');
    if (!els.length || !window.fetch) return;

    function show(count) {
      els.forEach(function (el) { el.textContent = count; });
    }

    /* Paint the last-known count immediately so a refresh never flashes the
       "GitHub" fallback while the API round-trip is in flight. */
    var cached = null;
    try { cached = localStorage.getItem('gh-stars'); } catch (e) {}
    if (cached) show(cached);

    fetch('https://api.github.com/repos/mihneaptu/opencode-fusion')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && typeof d.stargazers_count === 'number') {
          var count = d.stargazers_count.toLocaleString('en-US');
          show(count);
          try { localStorage.setItem('gh-stars', count); } catch (e) {}
        }
      })
      .catch(function () { /* keep whatever label is showing */ });
  }

  /* ---- Mobile nav toggle ---------------------------------------------- */
  function initNav() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('nav-menu');
    if (!toggle || !nav) return;

    function isOpen() {
      return toggle.getAttribute('aria-expanded') === 'true';
    }

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      nav.classList.toggle('is-open', open);
    }

    toggle.addEventListener('click', function () {
      setOpen(!isOpen());
    });

    // Close the menu after following an in-page link.
    nav.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (link) setOpen(false);
    });

    // Close when a pointer press lands outside the open menu and toggle,
    // so focus/pointer users aren't left with an overlay over the page.
    document.addEventListener('pointerdown', function (e) {
      if (!isOpen()) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      setOpen(false);
    });

    // Close on Escape for keyboard users.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
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
      // Only add a temporary tabindex when the target isn't already focusable,
      // and strip it on blur so it doesn't linger in the tab order.
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
        target.addEventListener('blur', function onBlur() {
          target.removeAttribute('tabindex');
          target.removeEventListener('blur', onBlur);
        });
      }
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
    // Keep browser chrome (mobile address bar) in step with the chosen theme,
    // which may differ from the OS preference the static metas follow.
    var chrome = next === 'dark' ? '#0d1117' : '#fbfbfd';
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', chrome);
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

  /* ---- Docs TOC: highlight section nearest the top of the viewport ---- */
  function initDocsToc() {
    var toc = document.querySelector('.docs-toc-nav');
    if (!toc) return;

    var links = toc.querySelectorAll('a[href^="#"]');
    if (!links.length) return;

    var sections = [];
    links.forEach(function (link) {
      var id = link.getAttribute('href').slice(1);
      var el = document.getElementById(id);
      if (el) sections.push({ id: id, el: el, link: link });
    });
    if (!sections.length) return;

    function setActive(id) {
      links.forEach(function (link) {
        var on = link.getAttribute('href') === '#' + id;
        link.classList.toggle('is-active', on);
        if (on) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }

    // Last section whose top is at or above a line under the sticky header.
    // Offset must clear header + scroll-margin (~176px after anchor jump).
    function update() {
      var offset = Math.max(200, Math.round(window.innerHeight * 0.22));
      var active = sections[0].id;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].el.getBoundingClientRect().top <= offset) {
          active = sections[i].id;
        }
      }
      setActive(active);
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        update();
        ticking = false;
      });
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  function init() {
    initTheme(); // also loads the matching hero video
    initReveal();
    initCopy();
    initStars();
    initNav();
    initSmoothScroll();
    initHeaderScroll();
    initDocsToc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
