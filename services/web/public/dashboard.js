(function () {
  document.getElementById("nav").innerHTML = RF.navHtml("/dashboard");
  document.getElementById("nav-id").hidden = true;

  const PROBLEM_KEYS = [
    "failuresToDlq",
    "publishFailedLost",
    "authFailures",
    "rateLimited",
    "forcedFailures",
    "breakerShortCircuits",
  ];

  // Hidden from the dashboard card entirely, per request -- the metrics are
  // still collected server-side (notification-service's /metrics), just not
  // rendered as tiles here.
  const HIDDEN_KEYS = ["webhookSendFailures", "webhookSignatureFailures"];

  function tileClass(key, value) {
    if (typeof value !== "number") return "";
    if (PROBLEM_KEYS.indexOf(key) !== -1) return value > 0 ? "bad" : "good";
    return "";
  }

  function statePill(label, value) {
    if (value === "open") return '<span class="pill pill-danger">' + label + ": " + RF.t("dash.breaker.open") + "</span>";
    if (value === "half-open")
      return '<span class="pill pill-warning">' + label + ": " + RF.t("dash.breaker.halfOpen") + "</span>";
    if (value === "closed") return '<span class="pill pill-success">' + label + ": " + RF.t("dash.breaker.closed") + "</span>";
    if (value === true) return '<span class="pill pill-warning">' + label + "</span>";
    return "";
  }

  function serviceCard(name, m) {
    if (!m.ok) {
      return (
        '<div class="card"><h2 class="mono">' +
        name +
        '</h2><div class="unreachable">' +
        RF.t("dash.unreachable") +
        (m.error ? ": " + RF.escapeHtml(m.error) : "") +
        "</div></div>"
      );
    }

    const pills = [];
    if ("breakerState" in m) pills.push(statePill(RF.t("dash.breaker"), m.breakerState));
    if (m.consumerPaused) pills.push(statePill(RF.t("dash.consumerPaused"), true));
    if (m.down) pills.push(statePill(RF.t("dash.down"), true));

    const tiles = Object.keys(m)
      .filter(function (k) {
        return k !== "ok" && typeof m[k] === "number" && HIDDEN_KEYS.indexOf(k) === -1;
      })
      .map(function (k) {
        return (
          '<div class="tile ' +
          tileClass(k, m[k]) +
          '" title="' +
          k +
          '"><div class="value">' +
          m[k] +
          '</div><div class="key' +
          (RF.isKnownMetric(k) ? "" : " mono") +
          '">' +
          RF.escapeHtml(RF.metricLabel(k)) +
          "</div></div>"
        );
      })
      .join("");

    return (
      '<div class="card"><h2 class="mono">' +
      name +
      "</h2>" +
      (pills.length ? '<div class="btn-row" style="margin-bottom:6px;">' + pills.join("") + "</div>" : "") +
      '<div class="tile-row">' +
      tiles +
      "</div></div>"
    );
  }

  function render(snapshot) {
    document.getElementById("ts").textContent = snapshot.updatedAt
      ? RF.t("dash.updatedAgo") + " " + RF.timeAgo(snapshot.updatedAt)
      : "";

    const services = snapshot.metrics || {};
    document.getElementById("service-cards").innerHTML = Object.keys(services)
      .map(function (name) {
        return serviceCard(name, services[name]);
      })
      .join("");

    const queues = snapshot.queues || {};
    const tbody = Object.keys(queues)
      .map(function (name) {
        const q = queues[name];
        const depthCell = q.error
          ? '<span class="unreachable">' + RF.escapeHtml(q.error) + "</span>"
          : '<span class="mono">' +
            q.messages +
            "</span>" +
            (name.indexOf("dlq") !== -1 && q.messages > 0
              ? ' <span class="pill pill-danger">' + RF.t("dash.nonEmpty") + "</span>"
              : "");
        return (
          "<tr><td class=\"mono\">" + name + "</td><td>" + depthCell + "</td><td>" + (q.consumers ?? "—") + "</td></tr>"
        );
      })
      .join("");
    document.querySelector("#queue-table tbody").innerHTML = tbody;
  }

  RF.connectEvents(render);
})();
