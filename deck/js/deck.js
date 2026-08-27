/* ==========================================================================
   STRID deck runtime
   - scales the fixed 1920x1080 stage to the viewport
   - slide navigation (arrows / space / home / end)
   - replays entrance animations each time a slide becomes active
   - generates the dot-field motif
   - counter effect on numerals
   ========================================================================== */

(function () {
  'use strict';

  var stage  = document.getElementById('stage');

  /* The NOTAT slides are internal working notes and have no business being on
     a public URL. `hide-internal` only ever governed the PDF, so on the web
     they were two arrow presses past the ask.

     Local means localhost, a file:// open, or a private-network address --
     which keeps them visible when the deck is served to a phone over wifi,
     because that is still us looking at it. Anything else is the internet.
     They are removed from the DOM rather than hidden: a hidden slide is still
     in `slides`, still navigable, and still one press past the end.
     `?all` puts them back on any host, for checking the live build. */
  var LOCAL = location.protocol === 'file:' ||
              /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname) ||
              /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  if (!LOCAL && !/(^|[?&])all(=|&|$)/.test(location.search)) {
    document.querySelectorAll('.slide.internal').forEach(function (s) { s.remove(); });
  }

  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var chrome = document.getElementById('chrome');
  var idx    = 0;

  /* --- stage scaling ----------------------------------------------------
     Two canvases, one deck.

     Landscape and desktop: the 1920x1080 stage is fitted whole into the
     viewport, letterboxed on whichever axis has slack. Unchanged.

     Portrait phone: a 16:9 box fitted into a 9:19.5 screen is a 390x219 strip
     with the deck's 22px floor rendering at 4px, which is not a preview of
     anything. So the canvas changes shape instead: 660 units wide, as tall as
     the screen needs, scaled to the full width. On a 390px phone that is 0.59,
     which puts the type floor at 13 real pixels. css/mobile.css turns the
     multi-column layouts inside that canvas into single columns; it does not
     touch type, because this scale already has.

     MOBILE_W is the one number that trades size against fit. Lower it and
     everything gets bigger and less of a slide is on screen at once. It is
     duplicated in the media query in mobile.css only as a comment -- the query
     itself keys off the viewport, not off this. */
  var MOBILE_W = 660;
  var portrait = window.matchMedia('(max-width: 820px) and (orientation: portrait)');

  function fit() {
    if (portrait.matches) {
      var k = window.innerWidth / MOBILE_W;
      stage.style.width  = MOBILE_W + 'px';
      stage.style.height = (window.innerHeight / k) + 'px';
      stage.style.transform = 'scale(' + k + ')';
      return;
    }
    stage.style.width  = '';
    stage.style.height = '';
    var d = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = 'translate(-50%,-50%) scale(' + d + ')';
  }
  window.addEventListener('resize', fit);
  // Rotating a phone fires resize on every browser worth supporting, but iOS
  // reports the old innerHeight for a frame or two around the change; the
  // orientation listener catches the corrected value.
  window.addEventListener('orientationchange', function () { setTimeout(fit, 120); });

  /* --- navigation ------------------------------------------------------- */
  function show(n, force) {
    idx = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach(function (s, i) {
      s.classList.toggle('is-active', i === idx);
    });
    // Force an animation restart on the newly active slide. Touch only
    // animation-name: writing the `animation` shorthand here would replace the
    // whole inline declaration and take every per-element animation-delay and
    // animation-duration with it, flattening every stagger in the deck.
    var live = slides[idx];
    live.querySelectorAll('[data-anim]').forEach(function (el) {
      el.style.animationName = 'none';
      void el.offsetWidth;
      el.style.animationName = '';
    });
    live._step = 0;
    unsettle(live);
    applyStep(live);
    // R means "run this slide again", so a clip the presenter was part way
    // through goes back to the top with everything else. Arriving at the slide
    // normally does not reset it: walking off 08 to answer a question and
    // walking back should pick the quote up where it stopped, which is the same
    // rule the reveal film on 06 follows.
    if (force) live.querySelectorAll('audio[data-xport-media]').forEach(function (a) {
      a.pause();
      try { a.currentTime = 0; } catch (e) {}
    });
    runCounters(live);
    runSequence(live, force);
    paintChrome();
    location.hash = 's' + (idx + 1);
  }

  /* --- step reveals -------------------------------------------------------
     A slide can hold [data-step="N"] elements that stay hidden until the
     presenter advances past N with the same keys used to change slides.
     ArrowRight/Space consumes these before it moves to the next slide;
     ArrowLeft undoes them before it moves back. Everything else in the
     deck (the plain [data-anim] entrance animations) is untouched. */
  function stepMax(slide) {
    var m = 0;
    slide.querySelectorAll('[data-step]').forEach(function (el) {
      m = Math.max(m, +el.dataset.step);
    });
    return m;
  }
  function applyStep(slide) {
    var cur = slide._step || 0;
    slide.querySelectorAll('[data-step]').forEach(function (el) {
      var on = +el.dataset.step <= cur;
      var was = el.classList.contains('step-in');
      el.classList.toggle('step-in', on);
      if (on && !was) {
        el.style.animationName = 'none';
        void el.offsetWidth;
        el.style.animationName = '';
      }
    });
  }

  /* The last step on slide 04 is a 7-second chain: the carrier flies out, five
     strike lines fan, the return path draws home, and only then does the copy
     arrive. Standing in front of that with nothing to press is the wrong kind
     of quiet, and answering a question mid-chain means either waiting it out
     or skipping the slide.

     So the press after the last step settles the slide instead of leaving it:
     every step animation jumps to its final frame, which is the state the
     print stylesheet already produces for the PDF. The press after THAT moves
     on, so nothing is lost, only made optional. Going back a step un-settles,
     and R replays from nothing as it always did.

     A slide with no [data-step] never sees this: stepMax is 0, so the first
     press is already the one that advances. */
  function settle(slide) { slide.classList.add('steps-settled'); slide._settled = true; }
  function unsettle(slide) { slide.classList.remove('steps-settled'); slide._settled = false; }

  /* Separate from show() because the sound state changes without the slide
     changing. Going through show() to repaint one word would replay every
     entrance animation on the slide underneath it. */
  function paintChrome() {
    if (!chrome) return;
    var snd = slideAudio(slides[idx]);
    chrome.innerHTML = '<b>' + String(idx + 1).padStart(2, '0') + '</b> / ' +
                       String(slides.length).padStart(2, '0') +
                       ' &nbsp;·&nbsp; arrows &nbsp;·&nbsp; R replay film' +
                       (snd ? ' &nbsp;·&nbsp; M sound ' + (audioOn ? 'on' : 'off') : '') +
                       ' &nbsp;·&nbsp; N hide notat &nbsp;·&nbsp; P pdf';
  }

  /* One path forward and one back, whatever pressed them. The click handler
     used to call show() directly, which meant a tap skipped the whole slide
     instead of advancing its steps: on a phone, where a tap is the only input
     there is, the battlefield on 03 could not be played at all. Everything
     goes through these two now -- keys, clicks and taps -- so a step reveal
     behaves the same however it is driven. */
  function advance() {
    var live = slides[idx], max = stepMax(live), cur = live._step || 0;
    if (cur < max) { live._step = cur + 1; applyStep(live); }
    else if (max > 0 && !live._settled) { settle(live); }
    else { show(idx + 1); }
  }
  function back() {
    var live = slides[idx], cur = live._step || 0;
    if (live._settled) { unsettle(live); }
    else if (cur > 0) { live._step = cur - 1; applyStep(live); }
    else { show(idx - 1); }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      advance();
    }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      back();
    }
    else if (e.key === 'Home') { show(0); }
    else if (e.key === 'End')  { show(slides.length - 1); }
    else if (e.key === 'r' || e.key === 'R') { show(idx, true); }
    else if (e.key === 'n' || e.key === 'N') {
      document.body.classList.toggle('hide-internal');
      flash(document.body.classList.contains('hide-internal')
        ? 'NOTAT slide hidden from PDF'
        : 'NOTAT slide included in PDF');
    }
    else if (e.key === 'm' || e.key === 'M') {
      var snd = slideAudio(slides[idx]);
      if (!snd) { flash('no soundtrack on this slide'); return; }
      if (snd.error) { flash('soundtrack file missing'); return; }
      audioOn = !audioOn;
      updateAudio();
      paintChrome();
      flash(audioOn ? 'sound on' : 'sound off');
    }
    else if (e.key === 'p' || e.key === 'P') { window.print(); }
  });

  /* --- transient on-screen message -------------------------------------- */
  var flashTimer;
  function flash(msg) {
    var el = document.getElementById('flash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'flash';
      el.style.cssText = 'position:fixed;left:50%;bottom:52px;transform:translateX(-50%);' +
        'z-index:60;font-family:var(--mono);font-size:12px;letter-spacing:.16em;' +
        'text-transform:uppercase;color:#cfd6dd;background:#1b2026;border:1px solid #2f363d;' +
        'padding:9px 16px;transition:opacity .25s;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { el.style.opacity = '0'; }, 1800);
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('a,button,input,#rotate')) return;
    if (e.clientX > window.innerWidth * 0.35) advance(); else back();
  });

  /* --- counter effect --------------------------------------------------- */
  function runCounters(scope) {
    scope.querySelectorAll('[data-count]').forEach(function (el) {
      var target   = parseFloat(el.getAttribute('data-count'));
      var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
      var prefix   = el.getAttribute('data-prefix') || '';
      var suffix   = el.getAttribute('data-suffix') || '';
      var dur      = parseInt(el.getAttribute('data-dur') || '1200', 10);
      var delay    = parseFloat(el.getAttribute('data-delay') || '0') * 1000;

      if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) {
        el.textContent = prefix + target.toFixed(decimals) + suffix;
        return;
      }

      el.textContent = prefix + (0).toFixed(decimals) + suffix;
      setTimeout(function () {
        var t0 = performance.now();
        (function step(now) {
          // Clamped at both ends. The top clamp is obvious; the bottom one
          // matters because easeOutCubic amplifies a negative p rather than
          // ignoring it -- at p = -1.2 it returns -10.2, so a 20 renders as
          // -204. A browser will not normally hand rAF a timestamp behind the
          // performance.now() taken a moment earlier, but a headless render
          // does, and there is no reason for the maths to depend on it.
          var p = Math.min(1, Math.max(0, (now - t0) / dur));
          var e = 1 - Math.pow(1 - p, 3);            // easeOutCubic
          el.textContent = prefix + (target * e).toFixed(decimals) + suffix;
          if (p < 1) requestAnimationFrame(step);
        })(t0);
      }, delay);
    });
  }

  /* ======================================================================
     Choreographed sequences

     Some moments need a real timeline rather than staggered CSS delays.
     The market chart is one: the cadence has to decelerate, and a number
     has to finish at the same instant as the last bar.
     ====================================================================== */

  var seqRAF = null;          // handle for the running sequence

  function easeInOutQuad(p) { return p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

  /* Market chart, 9 seconds:
       0.0 - 2.0   the 2026 bar rises on its own
       2.0 - 3.0   hold
       3.0 - 9.0   every other bar in one continuous run. The gaps between
                   them widen and each rise takes longer than the last, so the
                   motion decelerates all the way into the 2034 bar, which is
                   the last bar of the same run rather than a separate finale.
                   "New market created" climbs with the bars throughout and
                   stops on the frame the last one lands.                       */
  function marketSequence(slide) {
    var bars = [].slice.call(slide.querySelectorAll('[data-seq-bar]'));
    if (!bars.length) return;
    bars.sort(function (a, b) { return +a.dataset.seqBar - +b.dataset.seqBar; });

    var values  = bars.map(function (b) { return +b.dataset.seqValue; });
    var n       = bars.length;
    var counter = slide.querySelector('[data-seq-counter]');
    var cagrEl  = slide.querySelector('[data-seq-cagr]');
    var lblA    = slide.querySelector('[data-seq-label="first"]');
    var lblB    = slide.querySelector('[data-seq-label="last"]');

    // The whole chart is done in 2.0s. It ran 9.0s and that was too long to
    // stand in front of: the shape of the argument is legible within the
    // first second and the rest was dead air. Every proportion below is the
    // old sequence compressed, not redrawn -- first bar alone with the CAGR,
    // a beat, then one decelerating run -- so the cadence still reads the
    // same way, just at speed. Nothing rises in under 0.3s, which is the
    // floor for a bar being seen to grow rather than appearing to pop.
    var FIRST_DUR = 0.45;
    var HOLD_END  = 0.55;
    var RUN_SPAN  = 0.85;     // every remaining bar starts inside this window
    var RUN_DUR_A = 0.3;      // rise time of the first of them
    var RUN_DUR_B = 0.6;      // ...and of the last
    var TOTAL     = HOLD_END + RUN_SPAN + RUN_DUR_B;   // 2.0s

    // Bars 1..n-1 are one continuous run, not a run plus a finale. Both the
    // gaps and the rise times widen across it, so the motion decelerates into
    // the last bar rather than handing over to it. The last bar is simply the
    // last bar, set apart by colour (.bar.hot) and by being the tallest, not
    // by arriving as a separate act. It still lands alone: every other bar
    // has finished by 1.73s, leaving it the closing 0.27s to itself.
    function runF(i) { return (i - 1) / (n - 2); }     // 0..1 across the run

    function startOf(i) {
      if (i === 0) return 0;
      var f = runF(i);
      return HOLD_END + RUN_SPAN * f * f;              // squared, so gaps widen
    }
    function durOf(i) {
      if (i === 0) return FIRST_DUR;
      return RUN_DUR_A + (RUN_DUR_B - RUN_DUR_A) * runF(i);
    }
    // One easing for everything, so no bar moves in a different language.
    function easeOf() { return easeInOutQuad; }

    function paint(t) {
      // The counter is the sum of each bar's own increment scaled by that
      // bar's progress. Reading only the leading bar would run the number
      // ahead of the chart while several bars are mid-rise.
      var grown = 0;
      bars.forEach(function (b, i) {
        var p = (t - startOf(i)) / durOf(i);
        p = p < 0 ? 0 : (p > 1 ? 1 : p);
        var e = easeOf(i)(p);
        b.style.transform = 'scaleY(' + e.toFixed(4) + ')';
        if (i > 0) grown += (values[i] - values[i - 1]) * e;
      });

      if (counter) counter.textContent = grown.toFixed(1);
      if (cagrEl)  cagrEl.textContent  = (11.1 * easeInOutQuad(Math.min(1, t / FIRST_DUR))).toFixed(1);
      if (lblA) lblA.style.opacity = Math.max(0, Math.min(1, (t - FIRST_DUR) / 0.4));
      if (lblB) lblB.style.opacity = Math.max(0, Math.min(1, (t - (TOTAL - 0.6)) / 0.6));
    }

    // exposed so the QA console can step the timeline without waiting on rAF
    slide._seqPaint = paint;

    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches ||
        document.hidden) { paint(TOTAL); return; }

    paint(0);
    var t0 = performance.now();
    seqRAF = requestAnimationFrame(function step(now) {
      var t = (now - t0) / 1000;
      paint(t > TOTAL ? TOTAL : t);
      seqRAF = t < TOTAL ? requestAnimationFrame(step) : null;
    });
  }

  /* Product reveal. The film runs alone, then two groups of copy drop in from
     above. Both cues are read off the video's currentTime rather than a timer,
     so a stalled or slow-starting video takes the copy with it instead of
     leaving the name hanging over the wrong frame. */
  var CUE_SPECS = 12;     // seconds into the film: capability lines, from the left
  var CUE_NAME  = 14;     // then the lockup rises

  function revealSequence(slide, force) {
    var a = slide.querySelector('[data-reveal-a]');
    var b = slide.querySelector('[data-reveal-b]');
    if (!a) return;

    function apply(t) {
      slide.classList.toggle('reveal-specs', t >= CUE_SPECS);
      slide.classList.toggle('reveal-name',  t >= CUE_NAME);
    }

    // Hand over on the last frame. If the loop never loaded, the reveal simply
    // holds where it stopped, which is what it did before there was a loop.
    function handOver() {
      slide.dataset.played = '1';
      if (!b || b.readyState < 2) return;
      b.style.display = '';
      a.style.display = 'none';
      try { b.currentTime = 0; } catch (e) {}
      b.play().catch(function () {});
    }

    // The film ran to the end before you left, so the hold loop owns the slide
    // now. Come back onto the loop with the copy already up, never onto
    // nineteen seconds of film the room has already watched.
    function resumeAtLoop() {
      slide.classList.add('reveal-instant', 'reveal-specs', 'reveal-name');
      if (b && b.readyState >= 2) {
        b.style.display = '';
        a.style.display = 'none';
        b.play().catch(function () {});
      } else {
        try { a.currentTime = a.duration || 0; } catch (e) {}
      }
      // let the jump land before transitions are allowed again
      setTimeout(function () { slide.classList.remove('reveal-instant'); }, 80);
    }

    function reset() {
      if (b) { b.pause(); b.style.display = 'none'; }
      a.style.display = '';
    }

    // Autoplay can still be refused even when muted. Rather than leave a black
    // rectangle, fall through to the fully revealed state.
    function play() {
      var p = a.play();
      if (p && p.catch) p.catch(function () {
        slide.classList.add('reveal-specs', 'reveal-name');
      });
    }

    // Leaving the slide only pauses the film, so it still holds the frame you
    // walked away from. Pick it up there. On a first visit currentTime is 0 and
    // this is an ordinary cold start, which is why there is no separate case
    // for it. The copy is driven by the film's clock, so put it where the
    // current frame says it belongs before the first timeupdate fires, and do
    // that without transitions: copy that was already on screen when you left
    // should be on screen when you return, not slide in a second time.
    function resumeInPlace() {
      reset();
      slide.classList.add('reveal-instant');
      apply(a.currentTime || 0);
      setTimeout(function () { slide.classList.remove('reveal-instant'); }, 80);
      play();
    }

    // R, and only R, starts the film over.
    function restart() {
      slide.dataset.played = '';
      slide.classList.remove('reveal-instant', 'reveal-specs', 'reveal-name');
      reset();
      try { a.currentTime = 0; } catch (e) {}
      play();
    }

    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) {
      slide.classList.add('reveal-specs', 'reveal-name');
      reset();
      try { a.currentTime = a.duration || 0; } catch (e) {}
      return;
    }

    a.ontimeupdate = function () { apply(a.currentTime); };
    a.onended = handOver;

    if (force) { restart(); return; }
    if (slide.dataset.played === '1') { resumeAtLoop(); return; }
    resumeInPlace();
  }

  var sequences = { market: marketSequence, reveal: revealSequence };

  function runSequence(slide, force) {
    if (seqRAF) { cancelAnimationFrame(seqRAF); seqRAF = null; }
    // stop any video on a slide we have just left
    document.querySelectorAll('.slide video').forEach(function (v) {
      if (!v.closest('.slide').classList.contains('is-active')) { v.pause(); }
    });
    // and the same for a hand-driven clip. updateAudio() cannot do this one:
    // it only governs audio[data-slide-audio], the soundtracks that ride a
    // film's clock, and this element is deliberately not one of those.
    document.querySelectorAll('audio[data-xport-media]').forEach(function (a) {
      if (!a.closest('.slide').classList.contains('is-active')) { a.pause(); }
    });
    // Ambient loops just resume. Deliberately no seek back to zero: on a large
    // progressive file that forces a refetch and stalls the first play.
    slide.querySelectorAll('video[data-optional]').forEach(function (v) {
      v.play().catch(function () {});
    });
    // sound follows the slide immediately; the watchdog would only catch up
    // within a second, which is long enough to hear as a late start
    updateAudio();
    var name = slide.dataset.seq;
    if (name && sequences[name]) sequences[name](slide, force);
  }

  // Printing mid-animation must not freeze a chart half-grown, and every
  // sequence slide has to be final even though only one was ever on screen.
  window.addEventListener('beforeprint', function () {
    if (seqRAF) { cancelAnimationFrame(seqRAF); seqRAF = null; }
    document.querySelectorAll('[data-seq]').forEach(paintFinal);
  });

  // Browsers pause requestAnimationFrame on a hidden tab. Alt-tab away
  // mid-sequence and the chart would sit half-grown until you nudged it.
  // Finish it instead: coming back to a complete chart beats coming back
  // to a broken one.
  document.addEventListener('visibilitychange', function () {
    var live = slides[idx];
    if (!live) return;

    if (document.hidden) {
      if (seqRAF) { cancelAnimationFrame(seqRAF); seqRAF = null; }
      if (live.dataset.seq === 'market') paintFinal(live);
      // a paused film would otherwise strand the copy that its clock drives
      if (live.dataset.seq === 'reveal') live.classList.add('reveal-specs', 'reveal-name');
      // Video pauses itself on a hidden document; audio does not, that being
      // the whole point of background audio. Left alone it would keep playing
      // over a frozen frame and come back out of sync, so pause it by hand.
      updateAudio();
      // A quote playing on into a hidden tab is worse than a soundtrack doing
      // it: nobody is looking at the slide it belongs to. It is not resumed on
      // return either, deliberately -- this one is the presenter's to start.
      document.querySelectorAll('audio[data-xport-media]').forEach(function (a) { a.pause(); });
      return;
    }

    // Coming back. A browser pauses video whenever the document is hidden and
    // does not resume on its own, so alt-tabbing away mid-presentation would
    // otherwise leave a frozen frame on the screen you return to.
    live.querySelectorAll('video').forEach(function (v) {
      if (v.paused) v.play().catch(function () {});
    });
    updateAudio();
  });

  // set a sequence slide to its finished state without animating
  function paintFinal(slide) {
    var bars = [].slice.call(slide.querySelectorAll('[data-seq-bar]'));
    bars.forEach(function (b) { b.style.transform = 'scaleY(1)'; });
    var counter = slide.querySelector('[data-seq-counter]');
    var cagrEl  = slide.querySelector('[data-seq-cagr]');
    var values  = bars.map(function (b) { return +b.dataset.seqValue; });
    if (counter && values.length) {
      counter.textContent = (values[values.length - 1] - values[0]).toFixed(1);
    }
    if (cagrEl) cagrEl.textContent = '11.1';
    var lblA = slide.querySelector('[data-seq-label="first"]');
    var lblB = slide.querySelector('[data-seq-label="last"]');
    if (lblA) lblA.style.opacity = 1;
    if (lblB) lblB.style.opacity = 1;
  }

  /* --- optional video ----------------------------------------------------
     A slide can ship with a dashed placeholder and a <video data-optional>
     pointing at a file that does not exist yet. Drop the file in and the
     placeholder removes itself; until then the video element stays out of
     the way. No edit needed either way.
     ---------------------------------------------------------------------- */
  // Video weight is a URL flag, so the same deck serves the room and the inbox.
  //   (default)  104 MB, looks like the master behind the scrim
  //   ?full      the camera master, 383 MB, only if the machine can hold it
  //   ?light     39 MB, the one small enough for git, so the only one a fresh
  //              clone is guaranteed to have
  var VIDEO_TIER = /(^|[?&])light(=|&|$)/.test(location.search) ? 'light'
                 : /(^|[?&])full(=|&|$)/.test(location.search)  ? 'full'
                 : '';

  function wireOptionalVideo(v) {
    var slide = v.closest('.slide');
    var fallback = slide && slide.querySelector('.video-fallback');

    /* Walk the weights instead of giving up on the first miss.
       Only the light encode is small enough for git, so on a fresh clone the
       104 MB default and the 383 MB master are simply absent. Asking for one
       weight and finding nothing used to drop straight to the dashed
       placeholder, which meant a machine holding a perfectly good copy of the
       film still showed an empty slide because it had the wrong weight of it.
       Order: whatever the URL asked for, then the default, then down. So the
       big encodes win when a machine has them and nothing breaks when it does
       not. */
    var want = [];
    if (VIDEO_TIER && v.dataset[VIDEO_TIER]) want.push(v.dataset[VIDEO_TIER]);
    want.push(v.getAttribute('src'));
    if (v.dataset.light) want.push(v.dataset.light);
    if (v.dataset.full)  want.push(v.dataset.full);
    want = want.filter(function (u, i) { return u && want.indexOf(u) === i; });
    var at = 0;

    // drop to the next weight down, or give up and show the placeholder
    function step() {
      if (at + 1 < want.length) {
        v.src = want[++at];
        v.load();
        return;
      }
      v.style.display = 'none';
      if (fallback) fallback.style.display = '';
      slide.classList.remove('has-video');
    }

    // it has frames: show it and retire the placeholder
    function ready() {
      v.style.display = '';
      if (fallback) fallback.style.display = 'none';
      slide.classList.add('has-video');
    }

    v.style.display = 'none';
    v.addEventListener('loadeddata', ready);
    // A big progressive file can stall on its first start. Whenever enough
    // has arrived to play, pick it up again if we are still on this slide.
    v.addEventListener('canplay', function () {
      if (slide.classList.contains('is-active') && v.paused) v.play().catch(function () {});
    });
    v.addEventListener('error', step);

    /* Ordering matters here and it cost a debugging round. The element carries
       preload="auto" and sits near the top of the document, so the browser
       starts fetching the moment it is parsed, long before deck.js runs at the
       end of the body. On a machine without the default encode the 404 has
       already landed and the error event has already fired by the time the
       listener above is attached, so the fallback never ran and the slide sat
       on its placeholder with a perfectly good light encode on disk. Check the
       element's state directly rather than trusting that the event is still
       coming. networkState 3 is NETWORK_NO_SOURCE: tried everything, found
       nothing. */
    if (VIDEO_TIER && want[0] !== v.getAttribute('src')) {
      v.src = want[0];
      v.load();
    } else if (v.error || (v.readyState === 0 && v.networkState === 3)) {
      step();
    } else if (v.readyState >= 2) {
      ready();          // loadeddata fired before we were listening, same race
    }
  }

  /* --- optional soundtrack on a film slide -------------------------------
     The films stay muted. That is not a preference: a browser will only
     autoplay a muted video, and the deck cannot afford a film that refuses to
     start in the room. So sound rides *alongside* the video as a separate
     <audio data-slide-audio> rather than inside it. Two reasons. Adding sound
     never means re-encoding and re-shipping a 109 MB file between machines,
     and an audio file is small enough to live in git, which video is not.

     Two things make this awkward, and both are handled here rather than left
     to chance:

     1. No browser will start audio before the presenter has interacted with
        the page, so a deck opened straight on slide 02 would be silent with no
        explanation. Sound therefore arms itself on the first key or click.
        Arrowing in from slide 01 is already enough, which is the normal path.
     2. A separate element drifts against the film over a two minute loop. It
        is re-synced off the video's own clock, once a second, by the watchdog
        below. Nothing here trusts two clocks to stay together on their own. */
  var audioArmed = false;   // has the presenter done something we can count as consent
  var audioOn    = true;    // sound is wanted by default; M is the kill switch
  var SYNC_SLIP  = 0.35;    // seconds of drift tolerated before we pull it back

  function slideAudio(slide) {
    return slide ? slide.querySelector('audio[data-slide-audio]') : null;
  }

  function updateAudio() {
    document.querySelectorAll('audio[data-slide-audio]').forEach(function (el) {
      var own  = el.closest('.slide');
      var live = own.classList.contains('is-active');
      if (!live || !audioOn || !audioArmed || document.hidden) { el.pause(); return; }

      // ride the film's clock, not our own
      var vid = own.querySelector('video');
      var len = el.duration || (vid && vid.duration);
      if (vid && len && isFinite(len)) {
        var want = vid.currentTime % len;
        if (Math.abs(el.currentTime - want) > SYNC_SLIP) {
          try { el.currentTime = want; } catch (e) {}
        }
      }
      el.play().catch(function () {});
    });
    // Every on-screen sound button reads the same audioOn flag as M does, so
    // they cannot drift apart no matter which one was used.
    document.querySelectorAll('[data-xport-mute]').forEach(function (b) {
      b.classList.toggle('is-alt', !audioOn);
    });
  }

  // the first gesture is the one that makes sound legal; take it and go
  function armAudio() {
    if (audioArmed) return;
    audioArmed = true;
    updateAudio();
  }
  document.addEventListener('keydown', armAudio, true);
  document.addEventListener('click', armAudio, true);
  document.addEventListener('pointerdown', armAudio, true);

  /* --- media transport ---------------------------------------------------
     Slide 08's recording and slide 02's film are both driven by hand, so both
     get their controls from one implementation. A .xport carries a selector
     for its own media in data-xport, so nothing here needs to know which
     slide it is sitting on.

     The two buttons are different verbs, and that is not an inconsistency.
     On 08 the recording IS the content, so the button plays and pauses that
     element. On 02 the film is muted and has to stay muted -- a browser will
     not autoplay it otherwise -- and carries no audio track at all, so there
     is nothing on the video to turn up. That button drives the same audioOn
     flag M does, which is why pressing one updates the other. */
  function xfmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    t = Math.floor(t);
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }

  function wireTransport(box) {
    var slide = box.closest('.slide');
    var media = slide && slide.querySelector(box.dataset.xport);
    if (!media) return;

    var btnPlay = box.querySelector('[data-xport-play]');
    var btnMute = box.querySelector('[data-xport-mute]');
    var seek    = box.querySelector('[data-xport-seek]');
    var time    = box.querySelector('[data-xport-time]');
    var wave    = slide.querySelectorAll('[data-xport-wave] rect');
    var dragging = false;

    function paint() {
      var d = media.duration, f = 0;
      if (d && isFinite(d) && d > 0) f = media.currentTime / d;
      f = f < 0 ? 0 : (f > 1 ? 1 : f);

      if (seek) {
        if (!dragging) seek.value = Math.round(f * 1000);
        // The filled part of the track is a hard-stop gradient rather than a
        // second element, so there is nothing to keep in sync with the thumb.
        var pct = (f * 100).toFixed(2) + '%';
        seek.style.background =
          'linear-gradient(to right, var(--xfill) ' + pct + ', var(--hair) ' + pct + ')';
      }
      if (time) time.textContent = xfmt(media.currentTime) + ' / ' + xfmt(d);
      // The waveform is a drawing, not this file's real amplitude, but it can
      // at least be honest about position: bars light up as the clip passes
      // them. A static waveform over a moving scrubber reads as a fake.
      if (wave.length > 1) wave.forEach(function (r, i) {
        r.style.opacity = (i / (wave.length - 1)) <= f ? '1' : '.26';
      });
      if (btnPlay) btnPlay.classList.toggle('is-alt', !media.paused && !media.ended);
    }

    if (btnPlay) btnPlay.addEventListener('click', function () {
      if (media.paused || media.ended) media.play().catch(function () {});
      else media.pause();
    });

    if (btnMute) btnMute.addEventListener('click', function () {
      audioOn = !audioOn;
      updateAudio();     // which repaints this button, and every other one
      paintChrome();
    });

    if (seek) {
      seek.addEventListener('input', function () {
        dragging = true;
        var d = media.duration;
        if (d && isFinite(d)) {
          try { media.currentTime = (seek.value / 1000) * d; } catch (e) {}
        }
        paint();
      });
      // pointer released: let timeupdate drive the thumb again
      seek.addEventListener('change', function () { dragging = false; });
    }

    ['timeupdate', 'play', 'pause', 'ended', 'seeked', 'loadedmetadata', 'durationchange']
      .forEach(function (ev) { media.addEventListener(ev, paint); });

    paint();
  }

  document.querySelectorAll('[data-xport]').forEach(wireTransport);

  /* Watchdog. Between the browser pausing on a hidden document, autoplay
     policy, and a large file stalling on first buffer, there are several ways
     for a background film to end up stopped with nobody noticing. Rather than
     chase each one, check once a second: if a video is on the slide we are
     looking at, the page is visible, and it is not playing, start it. The same
     pass re-asserts the soundtrack, which is where drift gets corrected. */
  setInterval(function () {
    if (document.hidden) return;
    updateAudio();
    var live = document.querySelector('.slide.is-active');
    if (!live) return;
    live.querySelectorAll('video').forEach(function (v) {
      // a hidden video is deliberately parked, e.g. the loop that has not
      // taken over yet
      if (v.style.display === 'none') return;
      // leave the reveal film alone once it has run: it is meant to hold its
      // last frame, not loop
      if (v.ended && !v.loop) return;
      if (v.paused && v.readyState >= 2) v.play().catch(function () {});
    });
  }, 1000);

  /* --- the STRID mark ---------------------------------------------------
     The real logotype, traced from assets/logo/strid-mark.svg. Twenty-seven
     dots on three diagonal runs converging on an apex at the right, growing
     as they go. Built in code rather than dropped in as an <img> so it can
     take a CSS colour and animate dot by dot.
     ---------------------------------------------------------------------- */
  var STRID_MARK = [
    [249.081,  16.188, 14.970], [129.069,  16.887, 10.984], [ 11.032,  16.876,  8.903],
    [310.500,  75.154, 17.698], [189.124,  75.682, 12.927], [ 69.853,  75.891, 10.388],
    [368.751, 133.993, 19.249], [248.325, 134.588, 14.228], [129.180, 134.563, 11.199],
    [427.816, 192.525, 20.905], [307.170, 193.010, 15.223], [188.533, 193.086, 12.489],
    [486.221, 252.034, 24.313], [366.153, 252.272, 16.822], [248.099, 252.404, 14.014],
    [427.647, 311.024, 20.560], [306.925, 311.050, 15.139], [188.317, 311.046, 12.679],
    [368.590, 369.872, 19.216], [247.818, 369.924, 14.071], [128.841, 369.938, 11.507],
    [309.083, 428.759, 16.991], [188.212, 429.144, 12.964], [ 69.600, 429.257, 10.852],
    [248.760, 488.527, 15.223], [128.851, 488.454, 11.781], [ 10.809, 488.361,  9.756]
  ];

  function stridMark(svg) {
    var ns      = 'http://www.w3.org/2000/svg';
    var animate = svg.dataset.animate === 'on';
    var d0      = +(svg.dataset.delay || 0);
    var frag    = document.createDocumentFragment();

    svg.setAttribute('viewBox', '0 0 512 506');

    STRID_MARK.forEach(function (c) {
      var el = document.createElementNS(ns, 'circle');
      el.setAttribute('cx', c[0]);
      el.setAttribute('cy', c[1]);
      el.setAttribute('r',  c[2]);
      el.setAttribute('fill', 'currentColor');
      if (animate) {
        el.setAttribute('data-anim', 'dot');
        // build outward toward the apex, with a little vertical scatter
        var byX = c[0] / 512;
        var byY = Math.abs(c[1] - 252) / 252;
        el.style.animationDelay = (d0 + byX * 0.5 + byY * 0.12).toFixed(3) + 's';
      }
      frag.appendChild(el);
    });
    svg.appendChild(frag);
  }

  /* --- dot field -------------------------------------------------------- */
  /* The signature motif. Dot radius encodes reach, so the same generator
     draws the logo mark, the range comparison, and the scale ladder.        */
  function dotField(svg) {
    var cols  = +(svg.dataset.cols  || 9);
    var rows  = +(svg.dataset.rows  || 9);
    var cell  = +(svg.dataset.cell  || 56);
    var rMin  = +(svg.dataset.rmin  || 3);
    var rMax  = +(svg.dataset.rmax  || 18);
    var reach = svg.dataset.reach == null ? 1 : +svg.dataset.reach;  // 0..1 cut
    var curve = +(svg.dataset.curve || 1.6);
    var stag  = svg.dataset.stagger !== 'off';
    var animate = svg.dataset.animate === 'on';
    var d0    = +(svg.dataset.delay || 0);
    // uniform: every dot the same size. Use this whenever the field is read as
    // a scale rather than as the mark - a growing dot reads as "bigger", which
    // is not what distance means.
    var uniform  = svg.dataset.uniform === 'on';
    var hollowOff = svg.dataset.offStyle === 'hollow';

    var w = cols * cell, h = rows * cell;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);

    var ns = 'http://www.w3.org/2000/svg';
    var frag = document.createDocumentFragment();

    for (var c = 0; c < cols; c++) {
      for (var r = 0; r < rows; r++) {
        if (stag && (c + r) % 2 !== 0) continue;           // diagonal lattice
        var t   = cols === 1 ? 1 : c / (cols - 1);          // 0 left .. 1 right
        var rad = uniform ? rMax : rMin + (rMax - rMin) * Math.pow(t, curve);
        var on  = t <= reach + 0.0001;

        var cx = c * cell + cell / 2;
        var cy = r * cell + cell / 2;

        var el = document.createElementNS(ns, 'circle');
        el.setAttribute('cx', cx.toFixed(2));
        el.setAttribute('cy', cy.toFixed(2));
        el.setAttribute('r',  rad.toFixed(2));

        if (on) {
          el.setAttribute('fill', svg.dataset.on || 'var(--frost)');
        } else if (hollowOff) {
          el.setAttribute('fill', 'none');
          el.setAttribute('stroke', svg.dataset.off || 'var(--hair)');
          el.setAttribute('stroke-width', '2');
        } else {
          el.setAttribute('fill', svg.dataset.off || 'var(--hair)');
        }
        if (animate) {
          el.setAttribute('data-anim', 'dot');
          el.style.animationDelay = (d0 + t * 0.55 + (r % 3) * 0.04).toFixed(3) + 's';
        }
        frag.appendChild(el);
      }
    }
    svg.appendChild(frag);
  }

  /* --- prepare stroke-draw paths ---------------------------------------- */
  function prepDraw() {
    document.querySelectorAll('[data-anim="draw"], [data-step-anim="draw"]').forEach(function (p) {
      if (typeof p.getTotalLength !== 'function') return;
      var len = p.getTotalLength();
      p.style.setProperty('--len', len);
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
    });
  }

  /* --- turn your phone ---------------------------------------------------
     Whether the prompt is on screen is pure CSS: it lives inside the portrait
     media query in mobile.css, so rotating the handset makes the query stop
     matching and the prompt goes with it. No orientation listener, nothing to
     keep in sync, and it comes back if they rotate back.

     The only thing JS does is the escape hatch. A reader who wants to stay in
     portrait taps once and is not asked again this session -- otherwise the
     one input a phone has would be spent arguing with them. */
  var rotate = document.getElementById('rotate');
  if (rotate) rotate.addEventListener('click', function () {
    document.body.classList.add('rotate-dismissed');
  });

  /* --- boot ------------------------------------------------------------- */
  document.querySelectorAll('video[data-optional]').forEach(wireOptionalVideo);
  document.querySelectorAll('svg.strid-mark').forEach(stridMark);
  document.querySelectorAll('svg.dotfield').forEach(dotField);
  prepDraw();
  fit();

  var start = parseInt((location.hash || '').replace('#s', ''), 10);
  show(isFinite(start) && start > 0 ? start - 1 : 0);

  /* --- small public API, handy for scripted screenshots ----------------- */
  window.deck = {
    show: function (n) { show(n - 1); },   // 1-indexed, matches the rail
    count: slides.length,
    current: function () { return idx + 1; }
  };
})();
