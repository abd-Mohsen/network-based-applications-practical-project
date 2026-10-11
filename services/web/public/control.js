(function () {
  document.getElementById("nav").innerHTML = RF.navHtml("/control");
  document.getElementById("nav-id").hidden = true;

  const logEl = document.getElementById("log");
  const lines = [];
  function log(text) {
    lines.unshift("[" + new Date().toLocaleTimeString() + "] " + text);
    if (lines.length > 30) lines.pop();
    logEl.innerHTML = lines.map(function (l) { return '<div class="log-line">' + RF.escapeHtml(l) + "</div>"; }).join("");
  }

  // --- live-state-driven toggle buttons ---------------------------------
  // Each of these used to be a pair of buttons (Pause/Resume, Kill/Restore,
  // Stop/Start). Now it's one button per service, reading real state off the
  // same SSE snapshot the dashboard uses (consumerPaused / down / gateway
  // reachability are all already in each service's /metrics) -- so the
  // label and color always reflect what's actually true, not a guess.

  const CONSUMER_SERVICES = {
    payment: { metricsKey: "payment-service", pauseLabel: "control.pausePayment", resumeLabel: "control.resumePayment" },
    notification: { metricsKey: "notification-service", pauseLabel: "control.pauseNotification", resumeLabel: "control.resumeNotification" },
  };

  function renderConsumerButtons(snapshot) {
    document.querySelectorAll("[data-toggle-consumer]").forEach(function (btn) {
      const cfg = CONSUMER_SERVICES[btn.getAttribute("data-toggle-consumer")];
      const m = (snapshot.metrics || {})[cfg.metricsKey];
      if (!m || m.ok === false) {
        btn.textContent = RF.t("dash.unreachable");
        btn.className = "btn-secondary";
        btn.disabled = true;
        btn.removeAttribute("data-paused");
        return;
      }
      const paused = m.consumerPaused === true;
      btn.disabled = false;
      btn.setAttribute("data-paused", paused ? "1" : "0");
      btn.textContent = RF.t(paused ? cfg.resumeLabel : cfg.pauseLabel);
      btn.className = paused ? "btn-success" : "btn-danger";
    });
  }

  function renderFraudButton(snapshot) {
    const btn = document.querySelector("[data-toggle-fraud]");
    if (!btn) return;
    const m = (snapshot.metrics || {})["fraud-check-service"];
    if (!m || m.ok === false) {
      btn.textContent = RF.t("dash.unreachable");
      btn.className = "btn-secondary";
      btn.disabled = true;
      btn.removeAttribute("data-down");
      return;
    }
    const down = m.down === true;
    btn.disabled = false;
    btn.setAttribute("data-down", down ? "1" : "0");
    btn.textContent = RF.t(down ? "control.restore" : "control.kill");
    btn.className = down ? "btn-success" : "btn-danger";
  }

  function renderGatewayButton(snapshot) {
    const btn = document.querySelector("[data-toggle-gateway]");
    if (!btn) return;
    // monitor polls the gateway container directly (not through edge), so
    // "ok" here is a true read of whether the gateway process itself is up.
    const m = (snapshot.metrics || {}).gateway;
    if (!m) {
      btn.textContent = RF.t("dash.unreachable");
      btn.className = "btn-secondary";
      btn.disabled = true;
      return;
    }
    const up = m.ok === true;
    btn.disabled = false;
    btn.setAttribute("data-up", up ? "1" : "0");
    btn.textContent = RF.t(up ? "control.gateway.stop" : "control.gateway.start");
    btn.className = up ? "btn-danger" : "btn-success";
  }

  RF.connectEvents(function (snapshot) {
    renderConsumerButtons(snapshot);
    renderFraudButton(snapshot);
    renderGatewayButton(snapshot);
  });

  document.body.addEventListener("click", async function (ev) {
    const toggleConsumer = ev.target.closest("[data-toggle-consumer]");
    const toggleFraud = ev.target.closest("[data-toggle-fraud]");
    const toggleGateway = ev.target.closest("[data-toggle-gateway]");
    const actionBtn = ev.target.closest("[data-action]");

    // Toggle buttons disable themselves immediately to prevent a double
    // click, then re-enable naturally on the next SSE tick (~1s) once
    // renderXButton sees the new state -- no manual re-enable needed, that
    // also means a failed request just leaves the button reflecting
    // whatever is still actually true.
    if (toggleConsumer) {
      const svc = toggleConsumer.getAttribute("data-toggle-consumer");
      const action = toggleConsumer.getAttribute("data-paused") === "1" ? "resume-consumer" : "pause-consumer";
      toggleConsumer.disabled = true;
      try {
        const result = await RF.postJSON("/api/chaos/" + action + "/" + svc, {});
        log(action + " " + svc + " -> " + JSON.stringify(result));
      } catch (err) {
        log("ERROR: " + (err.message || "request failed"));
      }
      return;
    }

    if (toggleFraud) {
      const action = toggleFraud.getAttribute("data-down") === "1" ? "restore-fraud" : "kill-fraud";
      toggleFraud.disabled = true;
      try {
        const result = await RF.postJSON("/api/chaos/" + action, {});
        log(action + " -> " + JSON.stringify(result));
      } catch (err) {
        log("ERROR: " + (err.message || "request failed"));
      }
      return;
    }

    if (toggleGateway) {
      const action = toggleGateway.getAttribute("data-up") === "1" ? "stop-gateway" : "start-gateway";
      toggleGateway.disabled = true;
      try {
        const result = await RF.postJSON("/api/chaos/" + action, {});
        log(action + " -> " + JSON.stringify(result));
      } catch (err) {
        log("ERROR: " + (err.message || "request failed"));
      }
      return;
    }

    if (!actionBtn) return;
    const action = actionBtn.getAttribute("data-action");
    actionBtn.disabled = true;
    try {
      let result;
      if (action === "duplicate-next") {
        const n = Number(document.getElementById("dup-n").value) || 0;
        result = await RF.postJSON("/api/chaos/duplicate-next", { n: n });
        log("duplicate-next " + n + " -> " + JSON.stringify(result));
      } else if (action === "latency-fraud") {
        const ms = Number(document.getElementById("latency-ms").value) || 0;
        result = await RF.postJSON("/api/chaos/latency-fraud", { ms: ms });
        log("latency-fraud " + ms + "ms -> " + JSON.stringify(result));
      } else if (action === "generate-trips") {
        const n = Number(document.getElementById("gen-n").value) || 0;
        log("generating " + n + " trips…");
        result = await RF.postJSON("/api/chaos/generate-trips", { n: n });
        log("generate-trips " + n + " -> created " + result.created + "/" + n);
      }
    } catch (err) {
      log("ERROR: " + (err.message || "request failed"));
    } finally {
      actionBtn.disabled = false;
    }
  });
})();
