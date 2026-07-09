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

  function init() {
    initReveal();
    initCopy();
    initNav();
    initSmoothScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
