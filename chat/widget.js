(() => {
  const root = document.createElement("div");
  root.className = "cw-chat";
  root.innerHTML = `
    <div class="cw-nudge" hidden>
      <button class="cw-nudge__dismiss" type="button" aria-label="Dismiss this question">×</button>
      <button class="cw-nudge__open" type="button"></button>
    </div>
    <button class="cw-launch" type="button" aria-expanded="false" aria-controls="cw-panel">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 16.5V7.8A2.8 2.8 0 0 1 7.8 5h8.4A2.8 2.8 0 0 1 19 7.8v5.2a2.8 2.8 0 0 1-2.8 2.8H9.2L5 19.2z"></path>
      </svg>
      <span class="sr">Open the chat</span>
    </button>
    <section class="cw-panel" id="cw-panel" role="dialog" aria-labelledby="cw-title" hidden>
      <header class="cw-head">
        <div>
          <span class="cw-kicker">Office</span>
          <h2 id="cw-title">Ask D & P</h2>
        </div>
        <button class="cw-close" type="button" aria-label="Close chat">×</button>
      </header>
      <div class="cw-log" aria-live="polite"></div>
      <div class="cw-chips"></div>
      <button class="cw-form-toggle" type="button" aria-expanded="false" hidden>Add quote details</button>
      <form class="cw-form" hidden>
        <p class="cw-form-note">Photos go by WhatsApp. This box takes your details only.</p>
        <input class="cw-field" name="name" autocomplete="name" maxlength="80" required placeholder="Your name">
        <input class="cw-field" name="phone" autocomplete="tel" maxlength="20" required placeholder="Phone">
        <input class="cw-field" name="postcode" autocomplete="postal-code" maxlength="10" required placeholder="Postcode">
        <input class="cw-field" name="job" maxlength="400" required placeholder="The job, such as guttering">
        <button class="cw-send" type="submit">Save for Dale</button>
      </form>
      <form class="cw-composer">
        <label class="sr" for="cw-input">Message</label>
        <textarea class="cw-input" id="cw-input" rows="1" maxlength="600" placeholder="Ask about a leak, a quote, or your area"></textarea>
        <button class="cw-send" type="submit">Send</button>
      </form>
      <nav class="cw-links" aria-label="Next steps">
        <a class="cw-quote" href="/contact-us/">Get a free quote</a>
        <a class="cw-phone" href="tel:+447587415299">07587 415299</a>
        <a class="cw-wa" href="https://wa.me/447587415299" target="_blank" rel="noopener">WhatsApp</a>
      </nav>
    </section>
  `;
  document.body.appendChild(root);

  const nudge = root.querySelector(".cw-nudge");
  const nudgeDismiss = root.querySelector(".cw-nudge__dismiss");
  const nudgeOpen = root.querySelector(".cw-nudge__open");
  const launch = root.querySelector(".cw-launch");
  const panel = root.querySelector(".cw-panel");
  const close = root.querySelector(".cw-close");
  const log = root.querySelector(".cw-log");
  const chips = root.querySelector(".cw-chips");
  const formToggle = root.querySelector(".cw-form-toggle");
  const form = root.querySelector(".cw-form");
  const composer = root.querySelector(".cw-composer");
  const input = root.querySelector(".cw-input");
  const send = composer.querySelector("button");
  const title = root.querySelector("#cw-title");
  const quote = root.querySelector(".cw-quote");
  const phone = root.querySelector(".cw-phone");
  const whatsapp = root.querySelector(".cw-wa");
  const sr = root.querySelector(".sr");

  const messages = [];
  let busy = false;
  let config = null;
  let nudgeArmed = false;
  let started = false;
  let engaged = false;
  const seenKey = "dp-nudge-seen";
  const fallback = {
    title: "Ask D & P",
    launcherLabel: "Open the chat",
    greeting:
      "Hello, this is the D & P assistant. I can help with roofing, building, the areas we cover, and quotes. What do you need?",
    placeholder: "Ask about a leak, a quote, or your area",
    suggestions: ["There's a leak", "Do you cover my area?", "I want a quote"],
    nudge: {
      text: "Leak, slipped tiles, or do you need a quote?",
      delayMs: 22000,
      scroll: 0.45,
      replies: [
        { label: "There's a leak", message: "Water is coming through my ceiling.", calls: null },
        { label: "I need a quote", message: "I want a quote.", calls: null },
        { label: "Do you cover me?", message: "Do you cover my area?", calls: null },
      ],
    },
    calculatorHref: "",
    formTitle: "Add quote details",
    formSubmit: "Save for Dale",
    auditHref: "/contact-us/",
    auditLabel: "Get a free quote",
    bookHref: "https://wa.me/447587415299",
    bookLabel: "WhatsApp",
    phoneHref: "tel:+447587415299",
    phone: "07587 415299",
    whatsappHref: "https://wa.me/447587415299",
    actions: [
      { id: "quote", label: "Get a quote", href: "/contact-us/" },
      { id: "phone", label: "Call Dale", href: "tel:+447587415299" },
      { id: "whatsapp", label: "WhatsApp", href: "https://wa.me/447587415299" },
      { id: "areas", label: "Areas we cover", href: "/locations/" },
      { id: "gallery", label: "See the gallery", href: "/gallery/" },
      { id: "survey", label: "Drone survey", href: "/drone-roof-survey/" },
    ],
  };

  function seenNudge() {
    try { return sessionStorage.getItem(seenKey) === "1"; } catch { return true; }
  }

  function markNudge() {
    try { sessionStorage.setItem(seenKey, "1"); } catch { /* private mode */ }
  }

  function safeHref(href, fallbackHref) {
    try {
      const url = new URL(href, location.origin);
      if (url.origin === location.origin || url.protocol === "https:" || url.protocol === "tel:") return url.href;
    } catch { /* keep fallback */ }
    return fallbackHref;
  }

  function add(role, text) {
    const p = document.createElement("p");
    p.className = role === "user" ? "cw-msg cw-msg--user" : role === "note" ? "cw-msg cw-msg--note" : "cw-msg cw-msg--bot";
    p.textContent = text;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
    return p;
  }

  function splitActions(acc) {
    const mark = "\u2063actions:";
    const idx = acc.indexOf(mark);
    if (idx === -1) {
      const partial = acc.match(/\n?\u2063(?:a(?:c(?:t(?:i(?:o(?:n(?::[a-z,]*)?)?)?)?)?)?)?$/);
      if (partial && partial[0].includes("\u2063")) return { text: acc.slice(0, partial.index), actions: [] };
      return { text: acc, actions: [] };
    }
    const raw = acc.slice(idx + mark.length).split(",").map((item) => item.trim()).filter(Boolean);
    return { text: acc.slice(0, idx).replace(/\n$/, ""), actions: raw.slice(0, 3) };
  }

  function renderActions(bubble, ids) {
    const next = bubble.nextElementSibling;
    if (next && next.classList.contains("cw-actions")) next.remove();
    const known = (config && config.actions) || fallback.actions;
    const row = document.createElement("div");
    row.className = "cw-actions";
    ids.slice(0, 3).forEach((id) => {
      const action = known.find((item) => item.id === id);
      if (!action || !action.label || !action.href) return;
      const href = safeHref(action.href, "");
      if (!href) return;
      const link = document.createElement("a");
      link.className = "cw-action";
      link.href = href;
      link.textContent = action.label;
      if (link.protocol === "https:" && link.origin !== location.origin) {
        link.target = "_blank";
        link.rel = "noopener";
      }
      row.appendChild(link);
    });
    if (!row.childElementCount) return;
    bubble.after(row);
  }

  function narrowScreen() {
    return window.matchMedia("(max-width: 860px)").matches;
  }

  function fitViewport() {
    const vv = window.visualViewport;
    const open = root.classList.contains("is-open") && narrowScreen();
    if (!vv || !open) {
      document.documentElement.classList.toggle("cw-lock", root.classList.contains("is-open") && narrowScreen());
      root.style.removeProperty("--cw-vv-top");
      root.style.removeProperty("--cw-vv-left");
      root.style.removeProperty("--cw-vv-w");
      root.style.removeProperty("--cw-vv-h");
      panel.classList.remove("is-keyboard");
      return;
    }
    document.documentElement.classList.toggle("cw-lock", true);
    const keyboard = window.innerHeight - vv.height > 80;
    root.style.setProperty("--cw-vv-top", `${vv.offsetTop}px`);
    root.style.setProperty("--cw-vv-left", `${vv.offsetLeft}px`);
    root.style.setProperty("--cw-vv-w", `${vv.width}px`);
    root.style.setProperty("--cw-vv-h", `${vv.height}px`);
    panel.classList.toggle("is-keyboard", keyboard);
    log.scrollTop = log.scrollHeight;
  }

  function pagePath() {
    let path = location.pathname || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return path;
  }

  function visitorHasSpoken() {
    return started || messages.some((message) => message.role === "user");
  }

  function applyConfig(next) {
    config = next;
    title.textContent = next.title || title.textContent;
    sr.textContent = next.launcherLabel || sr.textContent;
    launch.setAttribute("aria-label", next.launcherLabel || "Open the chat");
    input.placeholder = next.placeholder || input.placeholder;
    formToggle.textContent = next.formTitle || formToggle.textContent;
    form.querySelector("button").textContent = next.formSubmit || "Save for Dale";
    quote.href = safeHref(next.auditHref, "/contact-us/");
    quote.textContent = next.auditLabel || "Get a free quote";
    phone.href = safeHref(next.phoneHref, "tel:+447587415299");
    phone.textContent = next.phone || "07587 415299";
    whatsapp.href = safeHref(next.whatsappHref || next.bookHref, "https://wa.me/447587415299");
    whatsapp.textContent = next.bookLabel || "WhatsApp";
    if (next.nudge && next.nudge.text) nudgeOpen.textContent = next.nudge.text;
    if (!visitorHasSpoken()) renderSuggestions(next.suggestions);
    if (!nudgeArmed) {
      nudgeArmed = true;
      armNudge(next.nudge || { delayMs: 22000, scroll: 0.45 });
    }
    if (!messages.length && next.greeting) {
      messages.push({ role: "assistant", content: next.greeting });
      add("assistant", next.greeting);
    }
  }

  function renderSuggestions(list) {
    chips.replaceChildren();
    if (visitorHasSpoken()) return;
    (list || []).slice(0, 3).forEach((label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cw-chip";
      button.textContent = label;
      button.addEventListener("click", () => ask(label));
      chips.appendChild(button);
    });
  }

  function hideChips() {
    started = true;
    chips.replaceChildren();
  }

  function replyFor(text) {
    const replies = (config && config.nudge && config.nudge.replies) || [];
    return replies.find((reply) => reply.message === text || reply.label === text);
  }

  function showNudgeReplies() {
    if (visitorHasSpoken()) return;
    chips.replaceChildren();
    const replies = ((config && config.nudge && config.nudge.replies) || []).slice(0, 3);
    replies.forEach((reply) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cw-chip";
      button.textContent = reply.label;
      button.addEventListener("click", () => ask(reply.message));
      chips.appendChild(button);
    });
  }

  function hideNudge() {
    nudge.hidden = true;
  }

  function scrolledFar(amount) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 80) return false;
    return window.scrollY / max >= amount;
  }

  function armNudge(settings) {
    if (seenNudge()) return;
    const delay = Number(settings.delayMs) || 22000;
    const amount = Number(settings.scroll) || 0.45;
    let timer = 0;
    const stop = () => {
      clearTimeout(timer);
      removeEventListener("scroll", onScroll);
    };
    const tryShow = () => {
      if (seenNudge() || engaged || root.classList.contains("is-open") || !nudgeOpen.textContent) return;
      nudge.hidden = false;
      markNudge();
      stop();
    };
    const onScroll = () => { if (scrolledFar(amount)) tryShow(); };
    timer = setTimeout(tryShow, delay);
    addEventListener("scroll", onScroll, { passive: true });
    if (scrolledFar(amount)) tryShow();
  }

  function openFromNudge() {
    engaged = true;
    hideNudge();
    markNudge();
    const question = nudgeOpen.textContent;
    setOpen(true);
    if (question && !messages.some((message) => message.content === question)) {
      messages.push({ role: "assistant", content: question });
      add("assistant", question);
    }
    showNudgeReplies();
  }

  function openForm() {
    formToggle.hidden = false;
    form.hidden = false;
    form.classList.add("is-open");
    formToggle.setAttribute("aria-expanded", "true");
  }

  function setOpen(open) {
    root.classList.toggle("is-open", open);
    panel.hidden = !open;
    launch.setAttribute("aria-expanded", open ? "true" : "false");
    document.documentElement.classList.toggle("cw-lock", open && narrowScreen());
    if (open) {
      fitViewport();
      input.focus({ preventScroll: true });
    } else {
      fitViewport();
      launch.focus();
    }
  }

  async function loadConfig() {
    try {
      const response = await fetch("/api/chat");
      if (!response.ok) throw new Error(String(response.status));
      applyConfig(await response.json());
    } catch {
      applyConfig(fallback);
    }
  }

  function wantsDetails(text) {
    const asksForName = /\byour name\b/i.test(text);
    const asksForReach = /\b(phone|postcode)\b/i.test(text);
    return asksForName && asksForReach;
  }

  async function ask(text) {
    const content = text.replace(/\s+/g, " ").trim();
    if (!content || busy) return;
    busy = true;
    send.disabled = true;
    hideChips();
    messages.push({ role: "user", content });
    add("user", content);
    input.value = "";
    const bubble = add("assistant", "…");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages, page: pagePath() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        bubble.className = "cw-msg cw-msg--note";
        bubble.textContent = data.error || "Sorry, try again in a moment.";
        messages.pop();
        return;
      }
      const reader = response.body && response.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      const paint = () => {
        const parsed = splitActions(acc);
        bubble.textContent = parsed.text || "…";
        renderActions(bubble, parsed.actions);
        log.scrollTop = log.scrollHeight;
      };
      if (reader) {
        while (true) {
          const step = await reader.read();
          if (step.done) break;
          acc += decoder.decode(step.value, { stream: true });
          paint();
        }
        acc += decoder.decode();
      } else {
        acc = await response.text();
      }
      const parsed = splitActions(acc);
      bubble.textContent = parsed.text || "Sorry, I missed that.";
      renderActions(bubble, parsed.actions);
      const picked = replyFor(content);
      if (picked && config && config.calculatorHref) {
        const note = document.createElement("p");
        note.className = "cw-msg cw-msg--bot";
        const link = document.createElement("a");
        link.href = config.calculatorHref;
        link.textContent = "Open the calculator";
        note.append(link);
        log.appendChild(note);
      }
      messages.push({ role: "assistant", content: bubble.textContent });
      fitViewport();
      if (wantsDetails(bubble.textContent)) openForm();
    } catch {
      bubble.className = "cw-msg cw-msg--note";
      bubble.textContent = "Sorry, the chat didn't connect. You can still ring 07587 415299 or use the quote link below.";
      messages.pop();
    } finally {
      busy = false;
      send.disabled = false;
      input.focus({ preventScroll: true });
    }
  }

  launch.addEventListener("click", () => {
    engaged = true;
    hideNudge();
    markNudge();
    setOpen(true);
  });
  nudgeDismiss.addEventListener("click", (event) => {
    event.stopPropagation();
    hideNudge();
    markNudge();
  });
  nudgeOpen.addEventListener("click", openFromNudge);
  close.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("is-open")) setOpen(false);
  });
  formToggle.addEventListener("click", () => {
    const open = form.hidden;
    form.hidden = !open;
    form.classList.toggle("is-open", open);
    formToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) form.querySelector("input").focus();
  });
  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    ask(input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask(input.value);
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead: data, page: pagePath() }),
      });
      const payload = await response.json().catch(() => ({}));
      const note = add(response.ok ? "assistant" : "note", payload.message || payload.error || "Sorry, that didn't send.");
      if (response.ok && Array.isArray(payload.actions)) renderActions(note, payload.actions);
      if (response.ok) {
        form.reset();
        form.hidden = true;
        form.classList.remove("is-open");
        formToggle.setAttribute("aria-expanded", "false");
      }
    } catch {
      add("note", "Sorry, that didn't send. Ring 07587 415299 or WhatsApp D & P.");
    } finally {
      button.disabled = false;
    }
  });

  const ready = loadConfig();
  launch.addEventListener("click", () => { ready.then(() => input.focus({ preventScroll: true })); }, { once: true });
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", fitViewport);
    visualViewport.addEventListener("scroll", fitViewport);
  }
  addEventListener("resize", fitViewport);
  input.addEventListener("focus", () => {
    requestAnimationFrame(fitViewport);
    setTimeout(fitViewport, 60);
    setTimeout(fitViewport, 320);
  });
})();
