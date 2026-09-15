(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isCoarse = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  var canAnimate = !reduceMotion && typeof gsap !== "undefined";

  if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
  }

  /* ================= word-mask splitting =================
     Walks child nodes rather than reading textContent, so a <mark> authored
     inside a heading survives the split: the rebuilt word keeps its own
     <mark> and the highlight rides up with the mask reveal. Reading
     textContent here would silently flatten every highlighted heading. */
  function splitWords(el) {
    var nodes = Array.prototype.slice.call(el.childNodes);
    var parts = [];

    nodes.forEach(function (node) {
      var marked = node.nodeType === 1 && node.nodeName === "MARK";
      (node.textContent || "").split(/\s+/).forEach(function (word) {
        if (word) parts.push({ word: word, marked: marked });
      });
    });

    el.textContent = "";
    parts.forEach(function (part, i) {
      var wrap = document.createElement("span");
      wrap.className = "reveal-word";
      var inner = document.createElement("span");

      if (part.marked) {
        var mk = document.createElement("mark");
        mk.textContent = part.word;
        inner.appendChild(mk);
      } else {
        inner.textContent = part.word;
      }

      wrap.appendChild(inner);
      el.appendChild(wrap);

      // The separating space has to live BETWEEN the word boxes, never inside
      // one. .reveal-word is an inline-block, so a trailing space within it
      // lands at the end of its own line box and is dropped -- which rendered
      // every split heading as WEBUILDMORETHANCOMPUTERS. Out here the space is
      // in the heading's own inline context, so it renders and stays the wrap
      // point. It also keeps a <mark> from highlighting the space after it.
      if (i < parts.length - 1) el.appendChild(document.createTextNode(" "));
    });

    return el.querySelectorAll(".reveal-word > span");
  }

  document.querySelectorAll("[data-split]").forEach(function (el) {
    splitWords(el);
  });

  /* ================= preloader ================= */
  var preloader = document.getElementById("preloader");
  var preloaderDone = false;
  function hidePreloader() {
    if (!preloader || preloaderDone) return;
    preloaderDone = true;
    preloader.remove();
    runHeroIntro();
  }
  if (preloader) {
    if (canAnimate) {
      gsap.to(preloader, { autoAlpha: 0, duration: 0.6, ease: "power2.out", onComplete: hidePreloader });
    }
    // Hard safety net: fires on a timer, not rAF, so a stalled/backgrounded tab
    // can never leave the preloader blocking the whole page indefinitely.
    setTimeout(hidePreloader, 1200);
  }

  /* ================= Lenis smooth scroll ================= */
  var lenis = null;
  if (canAnimate && typeof Lenis !== "undefined") {
    lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      // Lenis hijacks wheel/touch globally and calls preventDefault on every
      // event, even while stopped via lenis.stop() -- it just does nothing
      // with them instead of letting the browser handle them. Without this,
      // a wheel event over an open <dialog> gets swallowed and the dialog's
      // own overflow-y:auto scroll never fires. Excluding dialogs here lets
      // native scrolling take over inside them regardless of Lenis's state.
      prevent: function (node) {
        return !!(node.closest && node.closest("dialog"));
      },
    });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (time) {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  /* ================= anchor nav routed through Lenis ================= */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (e) {
      var id = link.getAttribute("href");
      if (!id || id === "#") return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      if (lenis) {
        lenis.scrollTo(target, { offset: -104 });
      } else {
        var y = target.getBoundingClientRect().top + window.scrollY - 104;
        window.scrollTo({ top: y, behavior: reduceMotion ? "auto" : "smooth" });
      }
      history.pushState(null, "", id);
    });
  });

  /* ================= hero intro ================= */
  function runHeroIntro() {
    if (!canAnimate) {
      document.querySelectorAll(".reveal-word > span").forEach(function (s) {
        s.style.transform = "none";
      });
      return;
    }
    // fromTo, not from: these start hidden in CSS via .js-anim so the landing
    // never paints its finished state. A from() would take that hidden value
    // as the destination and leave the hero blank.
    var tl = gsap.timeline({ defaults: { ease: "power4.out" } });
    tl.to("#hero-heading .reveal-word > span", { y: "0%", duration: 1.1, stagger: 0.045 })
      .fromTo(
        "[data-hero-fade]",
        { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.12 },
        "-=0.6"
      )
      .fromTo("[data-hero-cue]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, "-=0.3");

    // Watchdog: the H1 is the first thing anyone sees. If the ticker never
    // advances this timeline, force the final state with an instant, non-tween set.
    setTimeout(function () {
      if (tl.progress() < 1) {
        gsap.set("#hero-heading .reveal-word > span", { y: "0%" });
        gsap.set("[data-hero-fade], [data-hero-cue]", { autoAlpha: 1, y: 0 });
      }
    }, 2500);
  }

  /* ================= header show/hide + scrollspy ================= */
  var header = document.querySelector("[data-header]");
  var lastY = window.scrollY;
  window.addEventListener("scroll", function () {
    var y = window.scrollY;
    if (header) {
      if (y > lastY && y > 160) {
        header.style.transform = "translateY(-100%)";
      } else {
        header.style.transform = "translateY(0)";
      }
    }
    lastY = y;
  });

  var sections = Array.prototype.slice.call(document.querySelectorAll("main section[id]"));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll("[data-nav-link]"));
  var linksById = {};
  navLinks.forEach(function (link) {
    linksById[link.getAttribute("href").replace("#", "")] = link;
  });
  if (sections.length && navLinks.length && "IntersectionObserver" in window) {
    var setActive = function (id) {
      navLinks.forEach(function (link) {
        var active = link === linksById[id];
        link.classList.toggle("text-gold", active);
        link.classList.toggle("text-cream/80", !active);
        if (active) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    };
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && linksById[entry.target.id]) setActive(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach(function (s) {
      if (linksById[s.id]) spy.observe(s);
    });
  }

  /* ================= mobile nav =================
     Slides down into place on open, mobile only -- the panel itself never
     gets a transform outside this interaction, so it can't trigger the
     containing-block bug fixed above (that was about a PARENT transform
     breaking a position:fixed CHILD; nothing inside this panel is fixed). */
  var toggles = document.querySelectorAll("[data-nav-toggle]");
  var panel = document.querySelector("[data-nav-panel]");
  if (toggles.length && panel) {
    var panelOpen = false;
    var mobileNavCanAnimate = canAnimate && window.matchMedia("(max-width: 767.98px)").matches;

    var setExpanded = function (open) {
      toggles.forEach(function (b) {
        b.setAttribute("aria-expanded", open ? "true" : "false");
      });
    };

    function openMobileNav() {
      if (panelOpen) return;
      panelOpen = true;
      panel.classList.remove("hidden");
      panel.classList.add("flex");
      if (mobileNavCanAnimate) {
        gsap.fromTo(panel, { yPercent: -100 }, { yPercent: 0, duration: 0.6, ease: "power4.out" });
        // Watchdog: a stalled ticker must not leave the open menu translated
        // off-screen and untappable. Force the resting state if the tween
        // hasn't visibly landed it already.
        setTimeout(function () {
          if (panelOpen && gsap.getProperty(panel, "yPercent") !== 0) {
            gsap.set(panel, { yPercent: 0 });
          }
        }, 900);
      }
      setExpanded(true);
    }

    function closeMobileNav() {
      if (!panelOpen) return;
      panelOpen = false;
      setExpanded(false);
      if (mobileNavCanAnimate) {
        gsap.to(panel, {
          yPercent: -100,
          duration: 0.45,
          ease: "power3.in",
          onComplete: function () {
            panel.classList.add("hidden");
            panel.classList.remove("flex");
            gsap.set(panel, { clearProps: "transform" });
          },
        });
        // Watchdog: if the close tween's onComplete never fires, the panel
        // must still end up hidden rather than stuck open off-screen.
        setTimeout(function () {
          if (!panelOpen && !panel.classList.contains("hidden")) {
            panel.classList.add("hidden");
            panel.classList.remove("flex");
            gsap.set(panel, { clearProps: "transform" });
          }
        }, 900);
      } else {
        panel.classList.add("hidden");
        panel.classList.remove("flex");
      }
    }

    toggles.forEach(function (toggle) {
      toggle.addEventListener("click", function () {
        if (panelOpen) closeMobileNav();
        else openMobileNav();
      });
    });
    panel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMobileNav);
    });
  }

  /* ================= generic scroll reveals =================
     IntersectionObserver, not ScrollTrigger: revealing content must not
     depend on the animation-frame ticker. If GSAP/ScrollTrigger never
     ticks (blocked script, stalled rAF, whatever), IO still fires and
     content still appears. ScrollTrigger is reserved below for effects
     that are inherently continuous (parallax, The Turn and tier pins). */
  var watchedReveals = [];
  function revealEl(el) {
    if (el.dataset.revealed) return;
    el.dataset.revealed = "1";
    if (canAnimate) {
      gsap.to(el, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out" });
    } else {
      el.style.opacity = "1";
      el.style.transform = "none";
    }
  }

  if (canAnimate) {
    gsap.set("[data-reveal]", { autoAlpha: 0, y: 40 });
    gsap.set("[data-reveal-item]", { autoAlpha: 0, y: 32 });
  }

  if ("IntersectionObserver" in window) {
    var revealObserver = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          if (entry.target.hasAttribute("data-reveal")) {
            revealEl(entry.target);
          } else if (entry.target.hasAttribute("data-reveal-stagger")) {
            var items = entry.target.querySelectorAll("[data-reveal-item]");
            items.forEach(function (item, i) {
              if (canAnimate) {
                gsap.to(item, { autoAlpha: 1, y: 0, duration: 0.8, delay: i * 0.1, ease: "power3.out" });
                item.dataset.revealed = "1";
              } else {
                revealEl(item);
              }
            });
          }
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" }
    );
    document.querySelectorAll("[data-reveal], [data-reveal-stagger]").forEach(function (el) {
      revealObserver.observe(el);
      watchedReveals.push(el);
    });
  } else {
    document.querySelectorAll("[data-reveal], [data-reveal-item]").forEach(revealEl);
  }

  // Watchdog: whatever the cause, nothing stays invisible forever.
  // Uses gsap.set (an instant, synchronous render), not gsap.to/revealEl,
  // so this fallback works even if the GSAP ticker itself is stalled.
  setTimeout(function () {
    document.querySelectorAll("[data-reveal]:not([data-revealed]), [data-reveal-item]:not([data-revealed])").forEach(function (el) {
      el.dataset.revealed = "1";
      if (canAnimate) {
        gsap.set(el, { autoAlpha: 1, y: 0 });
      } else {
        el.style.opacity = "1";
        el.style.transform = "none";
      }
    });
  }, 4000);

  /* ================= count-up stat =================
     With [data-count-scrub] the number is driven by the reader's own scroll
     through the section rather than firing once on entry: the 250 climbs
     while they read the mission beside it, which ties the figure to the act
     of moving through the page. Without GSAP it still lands on the total. */
  document.querySelectorAll("[data-count-to]").forEach(function (el) {
    var target = parseInt(el.getAttribute("data-count-to"), 10);
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      el.textContent = target + "+";
    }

    var scrubbed =
      el.hasAttribute("data-count-scrub") &&
      canAnimate &&
      typeof ScrollTrigger !== "undefined";

    if (scrubbed) {
      var section = el.closest("section");
      var everUpdated = false;
      ScrollTrigger.create({
        trigger: section,
        start: "top 85%",
        end: "center 45%",
        scrub: 0.5,
        onUpdate: function (self) {
          everUpdated = true;
          // Deliberately no latch here. An onLeave/`done` flag looks like a
          // safety net but ScrollTrigger can fire it while layout is still
          // settling on load, which pins the figure at its total and kills
          // the scrub for the whole session. Snap the last percent instead.
          el.textContent =
            (self.progress >= 0.995 ? target : Math.floor(self.progress * target)) + "+";
        },
      });
      // Watchdog covers the only real failure: the trigger never running at
      // all, which would strand the figure at zero.
      setTimeout(function () {
        if (!everUpdated) finish();
      }, 8000);
      return;
    }

    if (canAnimate && "IntersectionObserver" in window) {
      var counter = { val: 0 };
      var io = new IntersectionObserver(
        function (entries, obs) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            gsap.to(counter, {
              val: target,
              duration: 1.8,
              ease: "power2.out",
              onUpdate: function () {
                if (!done) el.textContent = Math.floor(counter.val) + "+";
              },
              onComplete: finish,
            });
            obs.unobserve(entry.target);
          });
        },
        { threshold: 0.4 }
      );
      io.observe(el);
      setTimeout(finish, 4000);
    } else {
      finish();
    }
  });

  /* ================= hero parallax glow follows cursor =================
     Guarded on #top existing at all: this whole block is homepage-only.
     Subpages reuse the hero markup pattern (id="hero-heading", data-hero-fade)
     for the same intro-reveal treatment but skip data-hero-glow/parallax/
     content, so without the guard ScrollTrigger would warn on a missing
     trigger on every subpage. */
  var heroSection = document.getElementById("top");
  if (canAnimate && !isCoarse && heroSection) {
    var glow = document.querySelector("[data-hero-glow]");
    if (glow) {
      var glowX = gsap.quickTo(glow, "x", { duration: 1.2, ease: "power3.out" });
      var glowY = gsap.quickTo(glow, "y", { duration: 1.2, ease: "power3.out" });
      heroSection.addEventListener("mousemove", function (e) {
        var rect = e.currentTarget.getBoundingClientRect();
        glowX((e.clientX - rect.left - rect.width / 2) * 0.3);
        glowY((e.clientY - rect.top - rect.height / 2) * 0.3);
      });
    }

    gsap.to("[data-hero-parallax]", {
      yPercent: 18,
      ease: "none",
      scrollTrigger: { trigger: heroSection, start: "top top", end: "bottom top", scrub: true },
    });
  }

  /* ================= hero hands off to The Turn =================
     The hero's content drifts up and dims on its way out so the cut into the
     next section reads as a camera move rather than a page break. Stops at
     0.2 alpha, not 0: if a scrub ever stalls mid-travel the hero must not be
     left blank. */
  if (canAnimate && heroSection) {
    gsap.to("[data-hero-content]", {
      yPercent: -10,
      autoAlpha: 0.2,
      ease: "none",
      scrollTrigger: { trigger: heroSection, start: "center center", end: "bottom top", scrub: true },
    });
  }

  /* ================= The Turn: pinned, scrub-lit narrative =================
     The page's one scroll-jacked moment, and the story's hinge: the hero says
     what AGB builds, this says why it has to exist. The line is split into
     words that light as scroll progress advances, so the sentence is read at
     the page's pace instead of skimmed. Everything below lg, reduced-motion,
     or GSAP-less degrades to "the sentence is simply lit". */
  (function initTurn() {
    var line = document.querySelector("[data-turn-line]");
    if (!line) return;

    // Walk child nodes rather than reading textContent: the phrase to pick out
    // is authored as <mark> in the HTML, so the copy stays editable without
    // touching this file. Flattening to spans also drops the <mark> wrapper,
    // which is what keeps the UA's yellow default from flashing in.
    var words = [];

    function pushWords(text, isMark) {
      text.split(/(\s+)/).forEach(function (chunk) {
        if (!chunk) return;
        if (/^\s+$/.test(chunk)) {
          if (words.length) line.appendChild(document.createTextNode(" "));
          return;
        }
        var span = document.createElement("span");
        span.className = "turn-word" + (isMark ? " turn-word--mark" : "");
        span.textContent = chunk;
        line.appendChild(span);
        words.push(span);
      });
    }

    var nodes = Array.prototype.slice.call(line.childNodes);
    line.textContent = "";
    nodes.forEach(function (node) {
      if (node.nodeType === 3) pushWords(node.textContent, false);
      else pushWords(node.textContent, node.nodeName === "MARK");
    });

    if (!words.length) return;

    var tail = document.querySelector("[data-turn-tail]");
    var horizon = document.querySelector("[data-turn-horizon]");
    var section = document.getElementById("the-turn");

    function litAll() {
      words.forEach(function (w) { w.classList.add("is-lit"); });
      if (tail) tail.classList.add("is-lit");
      if (horizon) horizon.classList.add("is-lit");
    }

    if (!canAnimate || typeof ScrollTrigger === "undefined") {
      litAll();
      return;
    }

    // EVERY path that touches the lit state derives it from where the section
    // actually sits. Nothing force-lights the sentence on a timer or on
    // teardown -- dimmed until scrolled onto is the designed state, and the
    // only thing allowed to change it is scroll position.
    var turnEverRendered = false;

    // Paints a given progress. No side effects, so teardown paths can use it.
    function paintTurn(progress) {
      var lit = Math.round(Math.min(1, Math.max(0, progress) / 0.8) * words.length);
      words.forEach(function (w, i) { w.classList.toggle("is-lit", i < lit); });
      if (horizon) horizon.classList.toggle("is-lit", progress > 0.06);
      if (tail) tail.classList.toggle("is-lit", progress > 0.82);
    }

    // Progress measured by hand from the section's own rect, for the paths
    // that have no ScrollTrigger progress to hand: context teardown, and the
    // scroll fallback. Same window as the narrow branch's trigger.
    function turnProgressFromPosition() {
      var r = section.getBoundingClientRect();
      var startAt = window.innerHeight * 0.8;
      var endAt = window.innerHeight * 0.55;
      return Math.min(1, Math.max(0, (startAt - r.top) / Math.max(1, r.height + startAt - endAt)));
    }

    // Driven by ScrollTrigger. Flags that something is genuinely driving
    // frames, which is what switches the scroll fallback off.
    function renderTurn(progress) {
      turnEverRendered = true;
      paintTurn(progress);
    }

    // gsap.matchMedia, not a one-shot window.matchMedia: a plain check only
    // runs at load, so a viewport that starts wide and narrows (or a device
    // whose metrics settle after first paint) keeps a pin it should never
    // have. matchMedia re-evaluates on resize and reverts the pin spacer for
    // us when the query stops matching.
    gsap.matchMedia().add(
      {
        wide: "(min-width: 1024px)",
        narrow: "(max-width: 1023.98px)",
      },
      function (ctx) {
        // Below lg the sentence still lights word by word -- it is the whole
        // point of the section -- but WITHOUT the pin. Progress comes from the
        // section's own travel through the viewport instead of from held
        // scroll, so a touch user is never trapped and can flick straight
        // past. Same renderTurn, different progress source.
        if (!ctx.conditions.wide) {
          var narrowST = ScrollTrigger.create({
            trigger: section,
            start: "top 80%",
            end: "bottom 55%",
            scrub: 0.5,
            onUpdate: function (self) { renderTurn(self.progress); },
            onRefresh: function (self) { renderTurn(self.progress); },
          });
          renderTurn(narrowST.progress);
          // Not litAll(): teardown must not force the sentence lit regardless of
          // where the reader is. Repaint from actual position instead.
          return function () { paintTurn(turnProgressFromPosition()); };
        }

        var turnST = ScrollTrigger.create({
          trigger: section,
          start: "top top",
          end: "+=" + words.length * 90,
          scrub: 0.6,
          pin: document.querySelector("[data-turn-pin]"),
          anticipatePin: 1,
          refreshPriority: 5, // document order: see note on the other pins
          onUpdate: function (self) {
            renderTurn(self.progress);
          },
          // Without this a refresh leaves whatever litAll() last wrote on
          // screen until the next scroll event.
          onRefresh: function (self) {
            renderTurn(self.progress);
          },
        });

        renderTurn(turnST.progress); // sync at creation, same reason

        // Dropping below lg tears down the trigger mid-sentence; leave the
        // line readable rather than half-dimmed.
        // Not litAll(): teardown must not force the sentence lit regardless of
          // where the reader is. Repaint from actual position instead.
          return function () { paintTurn(turnProgressFromPosition()); };
      }
    );

    // Fallback, deliberately NOT a timer.
    //
    // The dimmed state is the designed state: the sentence is supposed to sit
    // unlit until the reader scrolls onto it. A timer that force-lights it
    // after N seconds is wrong on its own terms -- it throws away the whole
    // effect for anyone who simply hasn't scrolled yet, and it fires while
    // they are still up in the hero.
    //
    // So the fallback is scroll-driven. It can only ever act in response to a
    // real scroll, and only if ScrollTrigger has still never driven a frame by
    // then (a stalled ticker, the one failure this needs to cover). In that
    // case it computes progress natively from the section's own position and
    // renders it -- the same lighting, just measured by hand.
    window.addEventListener(
      "scroll",
      function () {
        if (turnEverRendered) return;
        var r = section.getBoundingClientRect();
        if (r.top > window.innerHeight || r.bottom < 0) return; // not on screen yet
        // paintTurn, not renderTurn: this stays the fallback path rather than
        // claiming to be the driver, so if ScrollTrigger recovers on a later
        // frame it takes over cleanly from here.
        paintTurn(turnProgressFromPosition());
      },
      { passive: true }
    );
  })();

  /* ================= Donation tiers: pinned scrub =================
     Each tier arrives as its own beat while the section holds, so the four
     amounts read as a sequence -- what a build needs, in the order it needs
     it -- rather than a price grid to scan. */
  /* Runs `fn` only once `el` has actually been scrolled to, then waited.
     A plain setTimeout watchdog cannot tell "correctly waiting its turn" from
     "broken", so on a long page it fires while the section is still miles
     below the fold and forces the finished state -- which is then snapped
     back to the start when the scrub finally takes over. Gate on arrival. */
  function watchdogOnArrival(el, delay, fn) {
    if (!el) return;
    var fired = false;
    var run = function () {
      if (fired) return;
      fired = true;
      setTimeout(fn, delay);
    };
    if (!("IntersectionObserver" in window)) {
      setTimeout(run, 12000);
      return;
    }
    var io = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          obs.unobserve(entry.target);
          run();
        });
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(el);
  }

  var tierSection = document.getElementById("support");
  var tierPin = document.querySelector("[data-tier-pin]");

  // Clears back to the stylesheet rather than forcing opacity:1. Forcing it
  // wrote an inline style that outranked the .js-anim armed state, so after a
  // matchMedia revert the tiers sat visible at their finished position until
  // the scrub grabbed them and snapped them back to the start -- the exact
  // "shows the end, then restarts" behaviour this is meant to prevent.
  // Below lg the armed rule doesn't apply, so clearing leaves them visible.
  function showTierRows() {
    document.querySelectorAll("[data-tier-row]").forEach(function (row) {
      row.style.opacity = "";
      row.style.transform = "";
      row.style.visibility = "";
    });
  }

  if (!canAnimate || !tierSection || !tierPin) {
    showTierRows();
  } else {
    // Same matchMedia reasoning as The Turn above: the pin must be able to
    // come back off if the viewport narrows past lg.
    gsap.matchMedia().add(
      {
        wide: "(min-width: 1024px)",
        narrow: "(max-width: 1023.98px)",
      },
      function (ctx) {
        var rows = gsap.utils.toArray("[data-tier-row]");

        // Below lg each tier arrives on its own as it scrolls into view --
        // same beat-by-beat reading as the pinned desktop sequence, but
        // triggered per row rather than scrubbed against a held viewport.
        // once:true, so a row never re-hides after the reader has passed it.
        if (!ctx.conditions.wide) {
          rows.forEach(function (row, i) {
            gsap.fromTo(
              row,
              { autoAlpha: 0, x: -28 },
              {
                autoAlpha: 1,
                x: 0,
                duration: 0.7,
                ease: "power3.out",
                delay: (i % 2) * 0.05,
                scrollTrigger: { trigger: row, start: "top 90%", once: true },
              }
            );
          });
          // Watchdog: a row the reader has already scrolled past must never
          // still be sitting at opacity 0. Polls, and only forces rows whose
          // trigger point is behind the viewport -- rows still below the fold
          // are correctly hidden and must be left alone.
          var narrowTierTimer = setInterval(function () {
            var stuck = rows.filter(function (r) {
              return getComputedStyle(r).opacity === "0" && r.getBoundingClientRect().top < window.innerHeight * 0.9;
            });
            stuck.forEach(function (r) { gsap.set(r, { autoAlpha: 1, x: 0 }); });
            if (rows.every(function (r) { return getComputedStyle(r).opacity !== "0"; })) {
              clearInterval(narrowTierTimer);
            }
          }, 1500);
          return function () {
            clearInterval(narrowTierTimer);
            showTierRows();
          };
        }

        var tl = gsap.timeline({
          scrollTrigger: {
            trigger: tierSection,
            start: "top top",
            end: "+=" + rows.length * 260,
            scrub: 0.8,
            pin: tierPin,
            anticipatePin: 1,
            refreshPriority: 2,

          },
        });

        tl.set(rows, { autoAlpha: 0, x: -48 });
        rows.forEach(function (row, i) {
          tl.to(row, { autoAlpha: 1, x: 0, duration: 1, ease: "power2.out" }, i * 1);
        });
        var line = document.querySelector("[data-tier-line]");
        if (line) {
          var len = line.getTotalLength ? line.getTotalLength() : 1000;
          gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });
          tl.to(line, { strokeDashoffset: 0, duration: rows.length, ease: "none" }, 0);
        }

        // Watchdog. Polls, and only ever forces a row the scrub SHOULD have
        // revealed already.
        //
        // The previous version fired once, 3s after the section merely entered
        // view. The section is 1900px tall and its pin does not start until its
        // top hits the top of the viewport, so "entered view" is close to a full
        // viewport of scroll before the first row is due. It therefore forced
        // all four rows visible while the scrub was correctly holding them back,
        // and the section showed its finished state and then snapped to the
        // start. Arrival is the wrong gate whenever a pin sits between arriving
        // and the first beat -- compare progress instead.
        var tierST = tl.scrollTrigger || null;
        var tierTimer = setInterval(function () {
          var stillHidden = rows.filter(function (r) {
            return getComputedStyle(r).opacity === "0";
          });
          if (!stillHidden.length) { clearInterval(tierTimer); return; }

          // No trigger at all means nothing is driving these; show everything.
          if (!tierST) {
            gsap.set(rows, { autoAlpha: 1, x: 0 });
            clearInterval(tierTimer);
            return;
          }

          // Row i finishes arriving at (i+1)/rows.length of the timeline. Past
          // that point a hidden row is a genuine failure; before it, hidden is
          // the correct render.
          var p = tierST.progress;
          rows.forEach(function (row, i) {
            if (p >= (i + 1) / rows.length && getComputedStyle(row).opacity === "0") {
              gsap.set(row, { autoAlpha: 1, x: 0 });
            }
          });
        }, 1500);

        // Tearing down mid-scrub can leave rows stuck at autoAlpha 0.
        return function () {
          clearInterval(tierTimer);
          showTierRows();
        };
      }
    );
  }

  /* ================= SET PIECES =================
     The large moves. Each one is a different kind of camera: a numeral that
     owns the screen, horizontal travel, depth, type rolling into place.

     Two rules throughout.
     1. Nothing is hidden by CSS. Every "before" state is armed from JS inside
        a canAnimate guard, so a blocked CDN or reduced-motion leaves plain,
        fully legible sections.
     2. Pinning stops below lg. Horizontal scroll-jacking and long pins on a
        phone are a trap with no exit, so those breakpoints get the same
        content scrolling normally. */

  var mm = canAnimate && typeof ScrollTrigger !== "undefined" ? gsap.matchMedia() : null;

  /* ---------- shared: scroll velocity, for the wall ---------- */
  var scrollVelocity = 0;
  if (canAnimate) {
    var velLastY = window.scrollY;
    window.addEventListener(
      "scroll",
      function () {
        var y = window.scrollY;
        scrollVelocity = gsap.utils.clamp(-2600, 2600, (y - velLastY) * 45);
        velLastY = y;
      },
      { passive: true }
    );
  }

  /* ================= 02 THE COUNT =================
     The figure fills the viewport and counts while the section is held, then
     collapses toward the corner as the mission copy rises over it. The count
     is the headline, so it is driven by the reader's own scroll rather than
     firing once on entry. */
  if (mm) {
    var giant = document.querySelector("[data-count-giant]");
    var srCount = document.querySelector("[data-count-to]");
    var countTarget = srCount ? parseInt(srCount.getAttribute("data-count-to"), 10) : 250;

    // The figure is written from several places -- the scrub, the narrow
    // branch, the context cleanup -- and only ONE of them was ever putting it
    // back. Anything that can show the total must be paired with something
    // that re-syncs it to the current scroll position, or the section reads
    // "250+" on arrival and then snaps to 0 the moment the scrub takes over.
    function renderCount(progress) {
      // Counting finishes at 62%; the rest of the budget is the collapse, so
      // the number has landed before it starts moving.
      var p = Math.min(1, Math.max(0, progress) / 0.62);
      giant.textContent = Math.floor(p * countTarget) + (p >= 1 ? "+" : "");
    }

    if (giant) {
      mm.add("(min-width: 1024px)", function () {
        var tl = gsap.timeline({
          scrollTrigger: {
            trigger: "[data-count-stage]",
            start: "top top",
            end: "+=1600",
            scrub: 0.7,
            pin: "[data-count-pin]",
            anticipatePin: 1,
            refreshPriority: 4,

            onUpdate: function (self) {
              renderCount(self.progress);
            },
            // onUpdate alone only fires on scroll. Without this, a refresh or
            // a matchMedia revert (which sets the total) leaves the figure
            // reading 250+ until the reader scrolls into the pin.
            onRefresh: function (self) {
              renderCount(self.progress);
            },
          },
        });

        // Sync once at creation for the same reason.
        renderCount(tl.scrollTrigger ? tl.scrollTrigger.progress : 0);

        // The numeral moves as a layer, and the mission copy rises into the
        // space it vacates -- both inside the pinned viewport, so the collapse
        // reads as a handover rather than a screen emptying out. Anything
        // animated here must live inside [data-count-pin].
        // Timing is sequential on purpose, and the positions below are tied to
        // the 0.62 counting cutoff in onUpdate (total duration 1.65, so
        // 1.05 == 64% of the scroll). The number finishes counting, THEN
        // travels out of the right-hand half, and only then does the copy
        // arrive. Overlapping the last two reads as text materialising
        // underneath a 500px numeral.
        var COLLAPSE = 0.3; // how far the numeral layer shrinks

        tl.fromTo("[data-count-caption]", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.05)
          .to("[data-count-glow]", { scale: 1.35, autoAlpha: 0.35, duration: 1 }, 0)
          .to("[data-count-layer]", { scale: COLLAPSE, xPercent: -26, yPercent: -14, duration: 0.35, ease: "power2.inOut" }, 1.05)
          // The caption rides inside the layer, so it would be shrunk to ~4px
          // along with the numeral and vanish. Counter-scale by exactly the
          // inverse so it keeps its real size, and push it down to restore the
          // gap the layer's shrink closed up. It stays put -- "250+" on its own
          // with no label is the one thing this section can't end on.
          .to(
            "[data-count-caption]",
            { scale: 1 / COLLAPSE, y: 56, transformOrigin: "50% 0%", duration: 0.35, ease: "power2.inOut" },
            1.05
          )
          .to("[data-count-glow]", { autoAlpha: 0, duration: 0.3 }, 1.1)
          .fromTo(
            "[data-mission-lead]",
            { autoAlpha: 0, y: 80 },
            { autoAlpha: 1, y: 0, duration: 0.25, ease: "power3.out" },
            1.4
          );

        return function () {
          giant.textContent = countTarget + "+";
          gsap.set("[data-count-layer], [data-count-caption], [data-mission-lead]", { clearProps: "all" });
        };
      });

      // Below lg the figure still counts as the reader moves through the
      // section -- the number IS the headline here, and a static "100+" gives
      // that away for free. What mobile drops is the COLLAPSE: that move
      // repositions the numeral inside a held viewport and only reads with a
      // pin, so here the numeral simply stays put and counts. No pin, so the
      // section scrolls normally on touch.
      mm.add("(max-width: 1023.98px)", function () {
        var narrowCountST = ScrollTrigger.create({
          trigger: "#our-mission",
          start: "top 85%",
          end: "center 50%",
          scrub: 0.5,
          onUpdate: function (self) { renderCount(self.progress); },
          onRefresh: function (self) { renderCount(self.progress); },
        });
        renderCount(narrowCountST.progress);
        // Reverting to the wide branch must not leave a half-counted figure.
        return function () { giant.textContent = countTarget + "+"; };
      });

      // Watchdog, gated on arrival. As a bare 6s timer this was the main cause
      // of the section showing its finished state: it fired while the reader
      // was still up in the hero, saw the figure legitimately sitting at 0,
      // and wrote the total -- which the scrub then snapped back to 0.
      watchdogOnArrival(document.getElementById("our-mission"), 3000, function () {
        if (giant.textContent === "0") giant.textContent = countTarget + "+";
      });
    }
  }

  /* ================= 03 THE WINDOW =================
     Two programmes, so the section is built for two. Each title is a stencil
     plate: the real heading is outlined, and an aria-hidden duplicate in the
     same grid cell is filled by a scene that does NOT travel with the type.

     Three things move, none of them the panel:
       1. the fill wipes open across the letterforms (clip-path),
       2. the scene behind the plate drifts against the scroll (parallax),
       3. the window itself pans across that scene (background-position),
     so the same words show a different part of the world on the way in and on
     the way out. The panel stays planted -- position:sticky only, never a pin,
     so a touch user can always flick past.

     Everything here is enhancement. .win-plate is legible with no JS at all. */
  if (canAnimate && typeof ScrollTrigger !== "undefined") {
    var winPanels = gsap.utils.toArray("[data-win-panel]");

    winPanels.forEach(function (panel) {
      var fill = panel.querySelector("[data-win-fill]");
      var scene = panel.querySelector("[data-win-scene]");
      var kicker = panel.querySelector("[data-win-kicker]");
      var body = panel.querySelector("[data-win-body]");
      var edge = panel.querySelector("[data-win-edge]");
      var ghost = panel.querySelector("[data-win-ghost]");

      var reveal = gsap.timeline({
        scrollTrigger: { trigger: panel, start: "top 72%", once: true },
      });

      if (edge) {
        reveal.fromTo(edge, { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: "power3.out" }, 0);
      }
      if (kicker) {
        reveal.fromTo(kicker, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.05);
      }
      if (fill) {
        // fromTo against the CSS-armed inset. The wipe is the reveal, so it
        // gets the longest beat on the panel.
        reveal.fromTo(
          fill,
          { clipPath: "inset(0 100% 0 0)" },
          { clipPath: "inset(0 0% 0 0)", duration: 1.35, ease: "power3.inOut" },
          0.15
        );
      }
      if (body) {
        reveal.fromTo(body, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.7);
      }

      // Continuous, for as long as the panel is on screen. Scrubbed rather
      // than triggered, so the pan tracks the reader instead of playing once.
      if (scene) {
        gsap.fromTo(
          scene,
          { yPercent: -9 },
          {
            yPercent: 9,
            ease: "none",
            scrollTrigger: { trigger: panel, start: "top bottom", end: "bottom top", scrub: true },
          }
        );
      }
      if (ghost) {
        gsap.fromTo(
          ghost,
          { yPercent: -58, xPercent: 4 },
          {
            yPercent: -42,
            xPercent: -4,
            ease: "none",
            scrollTrigger: { trigger: panel, start: "top bottom", end: "bottom top", scrub: true },
          }
        );
      }
      if (fill) {
        gsap.fromTo(
          fill,
          { backgroundPosition: "50% 4%" },
          {
            backgroundPosition: "50% 96%",
            ease: "none",
            scrollTrigger: { trigger: panel, start: "top bottom", end: "bottom top", scrub: true },
          }
        );
      }

      // Watchdog: a fill stuck at inset(0 100% 0 0) is an invisible word.
      // The outlined plate underneath still carries the heading, so this is a
      // polish failure rather than a blank screen -- but fix it anyway.
      watchdogOnArrival(panel, 3000, function () {
        if (fill && String(gsap.getProperty(fill, "clipPath")).indexOf("100%") !== -1) {
          gsap.set(fill, { clipPath: "inset(0 0% 0 0)" });
        }
        [kicker, body].filter(Boolean).forEach(function (el) {
          if (getComputedStyle(el).opacity === "0") gsap.set(el, { autoAlpha: 1, y: 0 });
        });
      });
    });
  }

  /* ================= 05 THE WALL =================
     Three bands of supporter names at different depths, running in opposite
     directions. Base drift plus scroll velocity, so dragging the page hauls
     the names with it and they coast back to a slow crawl. Each track is
     cloned until it covers the viewport -- five names is nowhere near enough
     to fill a 1440p row on its own. */
  (function initWall() {
    var rows = Array.prototype.slice.call(document.querySelectorAll("[data-wall-row]"));
    if (!rows.length) return;

    var wall = document.querySelector("[data-wall]");
    var state = [];

    function build() {
      state = rows.map(function (row) {
        var track = row.querySelector("[data-wall-track]");
        var base = track.querySelector(".wall-group");

        Array.prototype.slice.call(track.querySelectorAll(".wall-group")).forEach(function (g, i) {
          if (i) g.remove();
        });

        var groupW = base.getBoundingClientRect().width;
        var need = groupW ? Math.max(2, Math.ceil((window.innerWidth * 1.6) / groupW)) : 2;
        for (var i = 1; i < need; i++) {
          var clone = base.cloneNode(true);
          clone.setAttribute("aria-hidden", "true");
          Array.prototype.slice.call(clone.querySelectorAll("a")).forEach(function (a) {
            a.setAttribute("tabindex", "-1");
          });
          track.appendChild(clone);
        }

        return {
          track: track,
          groupW: groupW,
          dir: parseFloat(row.getAttribute("data-wall-dir")) || -1,
          offset: 0,
          setX: gsap.quickSetter ? gsap.quickSetter(track, "x", "px") : null,
        };
      });
    }

    // A group measured before layout has a real width comes back as 0, which
    // both under-clones the row and makes the ticker skip it entirely -- the
    // wall just sits there. That happens whenever the page is measured before
    // the viewport has its size (embedded frames, restored tabs) or before
    // the display face lands. Keep re-measuring until the widths are real.
    var buildTries = 0;
    function ensureBuilt() {
      build();
      var measured = state.length && state.every(function (r) { return r.groupW > 0; });
      if (!measured && buildTries++ < 30) requestAnimationFrame(ensureBuilt);
    }

    ensureBuilt();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    if (document.readyState !== "complete") window.addEventListener("load", build);

    var wallResize;
    window.addEventListener("resize", function () {
      clearTimeout(wallResize);
      wallResize = setTimeout(build, 200);
    });

    if (!canAnimate) return;

    var hovering = false;
    if (wall) {
      wall.addEventListener("mouseenter", function () { hovering = true; });
      wall.addEventListener("mouseleave", function () { hovering = false; });
    }

    // Speeds differ per depth so the bands separate instead of moving as one.
    var speeds = [78, 52, 34];

    gsap.ticker.add(function (time, deltaTime) {
      var dt = Math.min(deltaTime, 50) / 1000;
      state.forEach(function (row, i) {
        if (!row.setX) return;
        // Self-heal: every rebuild above can still land while the viewport has
        // no size, leaving a cached width of 0 that makes this row sit dead
        // forever. Re-measure straight from the DOM until it reports a real
        // one -- cheap, and only runs while the row is broken.
        if (!row.groupW) {
          var g = row.track.querySelector(".wall-group");
          row.groupW = g ? g.getBoundingClientRect().width : 0;
          if (!row.groupW) return;
        }
        var drift = hovering ? 0 : speeds[i] || 50;
        var push = Math.abs(scrollVelocity) * (0.4 - i * 0.09);
        row.offset += row.dir * (drift + push) * dt;

        // Wrap on one group: every group is identical, so a shift of exactly
        // one is invisible.
        if (row.offset <= -row.groupW) row.offset += row.groupW;
        if (row.offset > 0) row.offset -= row.groupW;
        row.setX(row.offset);
      });
      scrollVelocity *= 0.9;
    });
  })();

  /* ================= 08 THE ODOMETER =================
     The statement is held at full-screen scale and each line rolls up into
     place on its own beat, like a split-flap board settling. The supporting
     copy only arrives once the sentence has finished assembling. */
  if (mm) {
    var odoLines = gsap.utils.toArray("[data-odo-line] .odo-inner");
    if (odoLines.length) {
      mm.add(
        { wide: "(min-width: 1024px)", narrow: "(max-width: 1023.98px)" },
        function (ctx) {
          // Below lg the split-flap roll still happens, line by line, but each
          // line is triggered as it enters rather than scrubbed against a
          // pinned viewport. The statement still assembles as you read down it.
          if (!ctx.conditions.wide) {
            odoLines.forEach(function (line, i) {
              gsap.fromTo(
                line,
                { yPercent: 108, y: 0 },
                {
                  yPercent: 0,
                  y: 0,
                  duration: 0.85,
                  ease: "power3.out",
                  delay: i * 0.07,
                  scrollTrigger: { trigger: line.parentNode, start: "top 92%", once: true },
                }
              );
            });
            gsap.fromTo(
              "[data-odo-tail]",
              { autoAlpha: 0, y: 36 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.8,
                ease: "power3.out",
                scrollTrigger: { trigger: "[data-odo-tail]", start: "top 92%", once: true },
              }
            );

            // Watchdog. The shared odometer watchdog further down is a ONE-SHOT
            // timer from page load: by the time a mobile reader scrolls this far
            // it has long since fired and found the section below the fold, so it
            // can never help here. These lines are CSS-armed at this breakpoint
            // now, so without a polling check a stalled ticker leaves the whole
            // statement invisible. Only forces what is genuinely overdue --
            // anything still below its trigger point is correctly hidden.
            var narrowOdoTail = document.querySelector("[data-odo-tail]");
            var narrowOdoTimer = setInterval(function () {
              var due = function (el) {
                return el && el.getBoundingClientRect().top < window.innerHeight * 0.92;
              };
              odoLines.forEach(function (line) {
                if (gsap.getProperty(line, "yPercent") > 50 && due(line.parentNode)) {
                  gsap.set(line, { yPercent: 0, y: 0 });
                }
              });
              if (narrowOdoTail && getComputedStyle(narrowOdoTail).opacity === "0" && due(narrowOdoTail)) {
                gsap.set(narrowOdoTail, { autoAlpha: 1, y: 0 });
              }
            }, 1500);

            // Reverting to the wide branch (or a torn-down trigger) must leave
            // the statement readable, never mid-roll.
            return function () {
              clearInterval(narrowOdoTimer);
              gsap.set(odoLines, { yPercent: 0, y: 0, autoAlpha: 1 });
              gsap.set("[data-odo-tail]", { autoAlpha: 1, y: 0 });
            };
          }

          var tl = gsap.timeline({
            scrollTrigger: {
              trigger: "#story",
              start: "top top",
              end: "+=" + odoLines.length * 320,
              scrub: 0.65,
              pin: "[data-odo-pin]",
              anticipatePin: 1,
              refreshPriority: 1,

            },
          });

          tl.set(odoLines, { yPercent: 108, y: 0 });
          odoLines.forEach(function (line, i) {
            tl.to(line, { yPercent: 0, y: 0, duration: 1, ease: "power3.out" }, i * 0.85);
          });
          tl.fromTo(
            "[data-odo-tail]",
            { autoAlpha: 0, y: 50 },
            { autoAlpha: 1, y: 0, duration: 1 },
            odoLines.length * 0.85
          );

          return function () {
            gsap.set(odoLines, { clearProps: "all" });
            gsap.set("[data-odo-tail]", { clearProps: "all" });
          };
        }
      );

      // Watchdog: the lines are masked, so a stalled ticker would leave the
      // section's whole statement off-screen.
      setTimeout(function () {
        var story = document.getElementById("story");
        if (!story) return;
        var hidden = gsap.getProperty(odoLines[0], "yPercent") > 50;
        if (story.getBoundingClientRect().top < window.innerHeight && hidden) {
          gsap.set(odoLines, { yPercent: 0, y: 0 });
          gsap.set("[data-odo-tail]", { autoAlpha: 1, y: 0 });
        }
      }, 7000);
    }
  }

  /* ================= 09 GET INVOLVED: the cards fan out =================
     They arrive as a pile opening into the grid -- rotated, scaled and thrown
     in from alternating sides -- rather than fading in place. */
  if (canAnimate && typeof ScrollTrigger !== "undefined") {
    var dealCards = gsap.utils.toArray("[data-deal-card]");
    if (dealCards.length) {
      dealCards.forEach(function (card, i) {
        var fromLeft = i % 2 === 0;
        // fromTo: the cards start at opacity 0 in CSS (.js-anim), so a from()
        // would animate them to that same hidden value.
        gsap.fromTo(
          card,
          {
            autoAlpha: 0,
            y: 140,
            xPercent: fromLeft ? -12 : 12,
            rotateX: -28,
            rotateZ: fromLeft ? -4 : 4,
            scale: 0.88,
          },
          {
            autoAlpha: 1,
            y: 0,
            xPercent: 0,
            rotateX: 0,
            rotateZ: 0,
            scale: 1,
            duration: 1.05,
            ease: "power3.out",
            delay: (i % 2) * 0.06,
            clearProps: "transform",
            scrollTrigger: { trigger: card, start: "top 88%", once: true },
          }
        );
      });
      // Same gating as the tiers: cards below the fold are meant to be hidden.
      watchdogOnArrival(document.querySelector("[data-deal]"), 3000, function () {
        dealCards.forEach(function (c) {
          if (getComputedStyle(c).opacity === "0") gsap.set(c, { autoAlpha: 1, clearProps: "transform" });
        });
      });
    }
  }

  /* ================= 10 THE ASK: the band blooms open =================
     The close opens from a slot in the middle of the screen to full bleed and
     the headline pushes forward as it lands. gsap.from means the resting
     state is the plain full band already in the stylesheet. */
  if (canAnimate && typeof ScrollTrigger !== "undefined") {
    var curtain = document.querySelector("[data-curtain]");
    if (curtain) {
      gsap.from(curtain, {
        clipPath: "inset(46% 0% 46% 0%)",
        ease: "none",
        scrollTrigger: { trigger: curtain, start: "top bottom", end: "top 45%", scrub: 0.5 },
      });
      gsap.from("#donate-heading", {
        scale: 0.82,
        autoAlpha: 0,
        y: 40,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: { trigger: curtain, start: "top 72%", once: true },
      });
      setTimeout(function () {
        if (curtain.getBoundingClientRect().bottom < 0) curtain.style.clipPath = "";
      }, 8000);
    }
  }

  /* ================= remaining small devices ================= */
  if (canAnimate && typeof ScrollTrigger !== "undefined") {
    /* transparency: the accountability rows print out one at a time */
    var ledgerRows = gsap.utils.toArray("[data-ledger-row]");
    if (ledgerRows.length) {
      ledgerRows.forEach(function (r) { r.classList.add("is-armed"); });
      ScrollTrigger.create({
        trigger: "[data-ledger]",
        start: "top 80%",
        end: "bottom 75%",
        scrub: 0.4,
        onUpdate: function (self) {
          var printed = Math.ceil(self.progress * ledgerRows.length);
          ledgerRows.forEach(function (r, i) { r.classList.toggle("is-armed", i >= printed); });
        },
      });
      setTimeout(function () {
        var t = document.getElementById("transparency");
        if (t && t.getBoundingClientRect().top < window.innerHeight && ledgerRows[0].classList.contains("is-armed")) {
          ledgerRows.forEach(function (r) { r.classList.remove("is-armed"); });
        }
      }, 6000);
    }
  }

  /* ================= scroll progress bar ================= */
  var progressBar = document.querySelector("[data-scroll-progress]");
  if (progressBar) {
    var updateProgress = function () {
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var pct = docHeight > 0 ? Math.min(100, (window.scrollY / docHeight) * 100) : 0;
      progressBar.style.width = pct + "%";
    };
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    if (lenis) lenis.on("scroll", updateProgress);
    updateProgress();
  }

  /* ================= chapter rail sync ================= */
  var chapterLinks = Array.prototype.slice.call(document.querySelectorAll("[data-chapter-link]"));
  var chapterFill = document.querySelector("[data-chapter-fill]");
  if (chapterLinks.length && sections.length && "IntersectionObserver" in window) {
    var chapterById = {};
    chapterLinks.forEach(function (link) {
      chapterById[link.getAttribute("href").replace("#", "")] = link;
    });
    var setActiveChapter = function (id) {
      var activeIndex = -1;
      chapterLinks.forEach(function (link, i) {
        var dot = link.querySelector("[data-chapter-dot]");
        var active = link === chapterById[id];
        if (active) activeIndex = i;
        if (dot) dot.classList.toggle("is-active", active);
      });
      if (chapterFill && activeIndex >= 0) {
        var pct = (activeIndex / (chapterLinks.length - 1)) * 100;
        chapterFill.style.height = pct + "%";
      }
    };
    var chapterSpy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && chapterById[entry.target.id]) setActiveChapter(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach(function (s) {
      if (chapterById[s.id]) chapterSpy.observe(s);
    });
  }

  /* ================= word-mask reveal for section headings =================
     Same reveal-word mask as the hero, generalized to every [data-split]
     heading. Independent watchdog per element, same reasoning as above:
     content must not depend on the ticker to become visible. */
  document.querySelectorAll("[data-split]:not(#hero-heading)").forEach(function (el) {
    var spans = el.querySelectorAll(".reveal-word > span");
    if (!spans.length) return;
    var revealed = false;
    function reveal(instant) {
      if (revealed) return;
      revealed = true;
      if (canAnimate) {
        if (instant) {
          gsap.set(spans, { y: "0%" });
        } else {
          gsap.to(spans, { y: "0%", duration: 0.9, stagger: 0.02, ease: "power4.out" });
        }
      } else {
        spans.forEach(function (s) { s.style.transform = "none"; });
      }
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries, obs) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              reveal(false);
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.2 }
      );
      io.observe(el);
    } else {
      reveal(true);
    }
    setTimeout(function () { reveal(true); }, 5000);
  });

  /* ================= Ledger numeral glitch-in ================= */
  if (canAnimate) {
    var ledgerStat = document.querySelector("[data-ledger-stat]");
    if (ledgerStat) {
      gsap.from(ledgerStat, {
        autoAlpha: 0,
        scale: 0.85,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: { trigger: ledgerStat, start: "top 80%" },
      });
    }
  }

  /* ================= story hairlines drift ================= */
  if (canAnimate && document.getElementById("story")) {
    gsap.to("[data-story-parallax]", {
      yPercent: -14,
      ease: "none",
      scrollTrigger: { trigger: "#story", start: "top bottom", end: "bottom top", scrub: true },
    });
  }

  /* ================= final layout pass =================
     Every pinned set piece is created inside a gsap.matchMedia context, which
     evaluates its query once at construction and then waits for a media
     *change* event. If the page is measured before the viewport has its real
     size -- an embedded/preview frame that sizes after first paint, a window
     restored narrow and then maximised, a tab opened in the background -- the
     narrow branch wins at init and the change event never arrives, so the
     wide branch never runs and every large moment on the page is silently
     missing. matchMediaRefresh reverts and re-evaluates all contexts against
     the media state as it actually is now. */
  if (canAnimate) {
    var settleLayout = function () {
      if (gsap.matchMediaRefresh) gsap.matchMediaRefresh();
      ScrollTrigger.refresh();
    };

    ScrollTrigger.refresh();
    if (document.readyState === "complete") requestAnimationFrame(settleLayout);
    else window.addEventListener("load", function () { requestAnimationFrame(settleLayout); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(settleLayout);

    /* A refresh computes each trigger's start/end from the layout as it is at
       that instant. Refresh too early -- before the display face lands, before
       an embedded viewport takes its real size -- and the numbers are wrong,
       but the triggers still report a progress from them and still render it.
       That is how the second section came to sit fully lit at scroll 0: its
       progress was measured as 0.82 against a page that had not finished
       laying out, and nothing measured it again.

       So: re-measure whenever the viewport actually changes size, not just on
       the events that usually precede it. Debounced, and paired with the
       onRefresh handlers on each scrubbed section so a re-measure also
       re-renders that section to match. */
    var settleTimer;
    var queueSettle = function () {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settleLayout, 150);
    };

    if (typeof ResizeObserver !== "undefined") {
      var lastW = document.documentElement.clientWidth;
      var lastH = document.documentElement.clientHeight;
      new ResizeObserver(function () {
        var w = document.documentElement.clientWidth;
        var h = document.documentElement.clientHeight;
        if (w === lastW && h === lastH) return;
        lastW = w;
        lastH = h;
        queueSettle();
      }).observe(document.documentElement);
    }
  }

  /* ================= Formspree forms =================
     Generic: any <form data-formspree> on any page gets AJAX submission with
     inline success/error states, no page reload. Posts with Accept: application/json
     per Formspree's AJAX contract (https://help.formspree.io/hc/en-us/articles/360013580813).
     A network failure or an unconfigured endpoint both fall through to the
     same visible error state, which points people at Discord instead --
     the form failing closed must not be a dead end. */
  document.querySelectorAll("[data-formspree]").forEach(function (form) {
    var status = form.querySelector("[data-form-status]");
    var submitBtn = form.querySelector('button[type="submit"]');
    var submitLabel = submitBtn ? submitBtn.querySelector(".btn-roll > span") : null;

    function setStatus(kind, message) {
      if (!status) return;
      status.textContent = message;
      status.classList.remove("hidden", "text-cream/60", "text-gold", "text-red");
      status.classList.add(kind === "error" ? "text-red" : kind === "success" ? "text-gold" : "text-cream/60");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (form.dataset.submitting === "1") return;

      var action = form.getAttribute("action") || "";
      // Matches every placeholder variant (YOUR_FORM_ID, YOUR_VETERAN_FORM_ID,
      // YOUR_SUPPORTER_FORM_ID, YOUR_PARTNER_FORM_ID...). A literal check for
      // one exact string silently let the others through, so the page fired a
      // pointless request at Formspree and surfaced its "Form not found" 404
      // instead of the far clearer "not connected yet" message below.
      if (!action || /YOUR_[A-Z_]*FORM_ID/.test(action)) {
        setStatus("error", "This form isn't connected yet. Please reach us on Discord instead — link below.");
        return;
      }

      form.dataset.submitting = "1";
      if (submitBtn) submitBtn.disabled = true;
      setStatus("pending", "Sending…");

      fetch(action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      })
        .then(function (res) {
          if (res.ok) {
            form.reset();
            form.hidden = true;
            var confirm = form.parentElement.querySelector("[data-form-confirm]");
            if (confirm) confirm.classList.remove("hidden");
            else setStatus("success", "Thank you — we received it and will be in touch.");
          } else {
            return res.json().then(function (data) {
              var msg = data && data.errors && data.errors.length ? data.errors.map(function (er) { return er.message; }).join(", ") : "Something went wrong.";
              setStatus("error", msg + " Please try again, or reach us on Discord instead.");
            });
          }
        })
        .catch(function () {
          setStatus("error", "Something went wrong. Please try again, or reach us on Discord instead.");
        })
        .finally(function () {
          form.dataset.submitting = "0";
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  });

  /* ================= Modal ("toast") dialogs =================
     Generic: any [data-modal-target="some-id"] opens <dialog id="some-id"
     data-modal>. Native showModal()/close() handle focus trapping, Escape,
     and stacking, so an info popup can open on top of a form popup for
     free -- no z-index or focus-management bookkeeping needed here.

     Background scroll lock: `html { overflow: hidden }` (in custom.css)
     isn't enough on its own here, because Lenis drives scroll by animating
     the real scrollTop itself on every wheel event rather than relying on
     the browser's native wheel-to-scroll behavior -- it doesn't know or
     care that a dialog is open. So this also fixes <body> in place (the
     standard cross-browser scroll-lock technique) and pauses Lenis while
     any dialog is open, restoring both on the dialog's native "close"
     event -- which fires for every close path (our buttons, backdrop
     click, AND the Escape key, which no click handler ever sees). A
     counter handles stacked dialogs: the benefits-letter example can open
     on top of the application form without the outer form's close
     unlocking scroll early. */
  var openDialogCount = 0;
  var scrollLockY = 0;

  function lockBackgroundScroll() {
    if (openDialogCount === 0) {
      scrollLockY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = -scrollLockY + "px";
      document.body.style.left = "0";
      document.body.style.right = "0";
      if (lenis) lenis.stop();
    }
    openDialogCount++;
  }

  function unlockBackgroundScroll() {
    openDialogCount = Math.max(0, openDialogCount - 1);
    if (openDialogCount === 0) {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      window.scrollTo(0, scrollLockY);
      if (lenis) lenis.start();
    }
  }

  document.querySelectorAll("[data-modal-target]").forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      var dialog = document.getElementById(trigger.getAttribute("data-modal-target"));
      if (dialog && typeof dialog.showModal === "function") {
        dialog.showModal();
        lockBackgroundScroll();
      }
    });
  });

  document.querySelectorAll("dialog[data-modal]").forEach(function (dialog) {
    dialog.querySelectorAll("[data-modal-close]").forEach(function (btn) {
      btn.addEventListener("click", function () { dialog.close(); });
    });
    // Clicking the backdrop fires a click event whose target is the <dialog>
    // itself (the inner content wrapper is what actually catches clicks on
    // the visible panel), so this is the standard native "light dismiss".
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", unlockBackgroundScroll);
  });
})();
