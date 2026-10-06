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

  document.body.addEventListener("click", async function (ev) {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    btn.disabled = true;
    try {
      let result;
      if (action === "pause-consumer" || action === "resume-consumer") {
        const svc = btn.getAttribute("data-svc");
        result = await RF.postJSON("/api/chaos/" + action + "/" + svc, {});
        log(action + " " + svc + " -> " + JSON.stringify(result));
      } else if (action === "duplicate-next") {
        const n = Number(document.getElementById("dup-n").value) || 0;
        result = await RF.postJSON("/api/chaos/duplicate-next", { n: n });
        log("duplicate-next " + n + " -> " + JSON.stringify(result));
      } else if (action === "kill-fraud" || action === "restore-fraud") {
        result = await RF.postJSON("/api/chaos/" + action, {});
        log(action + " -> " + JSON.stringify(result));
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
      btn.disabled = false;
    }
  });
})();
