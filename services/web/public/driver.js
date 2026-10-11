(function () {
  const driverId = RF.getOrCreateId("rideflow.driverId", "driver");
  const TOKEN_KEY = "rideflow.driverToken";

  document.getElementById("nav").innerHTML = RF.navHtml("/driver");
  document.getElementById("nav-id").innerHTML = RF.t("driver.drivingAs") + ' <span class="mono">' + driverId + "</span>";

  RF.ensureToken(TOKEN_KEY, driverId)
    .catch(function () {})
    .finally(function () {
      RF.renderTokenPanel(document.getElementById("token-panel"), TOKEN_KEY, driverId);
    });

  function tripRow(t, action) {
    return (
      '<div class="trip-card" data-id="' +
      t.id +
      '">' +
      '<div class="trip-route">' +
      RF.escapeHtml(t.origin) +
      " → " +
      RF.escapeHtml(t.destination) +
      '<span class="fare mono">$' +
      t.fare.toFixed(2) +
      "</span>" +
      RF.statusPill(t.status) +
      "</div>" +
      '<div class="trip-meta">' +
      RF.t("driver.riderLabel") +
      ' <span class="mono">' +
      RF.escapeHtml(t.riderId) +
      "</span> · " +
      RF.t("driver.requestedAgo") +
      " " +
      RF.timeAgo(t.createdAt) +
      "</div>" +
      (action || "") +
      "</div>"
    );
  }

  function render(snapshot) {
    const trips = snapshot.trips || [];

    const active = trips.find(function (t) {
      return t.status === "accepted" && t.driverId === driverId;
    });
    document.getElementById("active").innerHTML = active
      ? '<div class="card">' +
        "<h2>" +
        RF.t("driver.active.heading") +
        "</h2>" +
        tripRow(
          active,
          '<div class="btn-row" style="margin-top:10px;"><button class="btn-primary complete-btn">' +
            RF.t("driver.complete.button") +
            "</button></div>"
        ) +
        "</div>"
      : "";

    const queue = trips.filter(function (t) {
      return t.status === "requested";
    });
    document.getElementById("queue").innerHTML =
      queue.length === 0
        ? '<div class="empty">' + RF.t("driver.queue.empty") + "</div>"
        : queue
            .map(function (t) {
              return tripRow(
                t,
                '<div class="btn-row" style="margin-top:10px;"><button class="btn-secondary accept-btn" ' +
                  (active ? "disabled" : "") +
                  ">" +
                  RF.t("driver.accept.button") +
                  "</button></div>"
              );
            })
            .join("");

    const history = trips
      .filter(function (t) {
        return t.status === "completed" && t.driverId === driverId;
      })
      .slice(0, 5);
    document.getElementById("history").innerHTML =
      history.length === 0
        ? '<div class="empty">' + RF.t("driver.history.empty") + "</div>"
        : history.map(function (t) { return tripRow(t); }).join("");
  }

  RF.connectEvents(render);

  document.body.addEventListener("click", async function (ev) {
    const card = ev.target.closest(".trip-card");
    if (!card) return;
    const id = card.getAttribute("data-id");

    if (ev.target.classList.contains("accept-btn")) {
      ev.target.disabled = true;
      try {
        await RF.postJSON("/api/trips/" + id + "/accept", { driverId: driverId }, localStorage.getItem(TOKEN_KEY));
      } catch (err) {
        alert(err.message || RF.t("driver.error.accept"));
        ev.target.disabled = false;
      }
    }

    if (ev.target.classList.contains("complete-btn")) {
      ev.target.disabled = true;
      try {
        await RF.postJSON("/api/trips/" + id + "/complete", { driverId: driverId }, localStorage.getItem(TOKEN_KEY));
      } catch (err) {
        alert(err.message || RF.t("driver.error.complete"));
        ev.target.disabled = false;
      }
    }
  });
})();
