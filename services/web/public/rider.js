(function () {
  const riderId = RF.getOrCreateId("rideflow.riderId", "rider");
  const TOKEN_KEY = "rideflow.riderToken";

  document.getElementById("nav").innerHTML = RF.navHtml("/");
  document.getElementById("nav-id").innerHTML = RF.t("rider.ridingAs") + ' <span class="mono">' + riderId + "</span>";

  RF.ensureToken(TOKEN_KEY, riderId)
    .catch(function () {
      // ensureToken only fetches when storage is empty; a failure here just
      // means the panel opens with nothing yet -- Reset still works later.
    })
    .finally(function () {
      RF.renderTokenPanel(document.getElementById("token-panel"), TOKEN_KEY, riderId);
    });

  function renderTrips(trips) {
    const mine = trips.filter(function (t) {
      return t.riderId === riderId;
    });
    const el = document.getElementById("trips");
    if (mine.length === 0) {
      el.innerHTML = '<div class="empty">' + RF.t("rider.empty") + "</div>";
      return;
    }
    el.innerHTML = mine
      .map(function (t) {
        const cancelBtn =
          t.status === "requested"
            ? '<div class="btn-row" style="margin-top:10px;"><button class="btn-secondary cancel-btn">' +
              RF.t("rider.cancel.button") +
              "</button></div>"
            : "";
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
          RF.t("rider.requestedAgo") +
          " " +
          RF.timeAgo(t.createdAt) +
          (t.driverId
            ? " · " + RF.t("rider.driverLabel") + ' <span class="mono">' + RF.escapeHtml(t.driverId) + "</span>"
            : "") +
          "</div>" +
          '<div class="stepper">' +
          RF.stepperHtml(t) +
          "</div>" +
          cancelBtn +
          "</div>"
        );
      })
      .join("");
  }

  RF.connectEvents(function (snapshot) {
    renderTrips(snapshot.trips || []);
  });

  document.getElementById("trip-form").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const errorEl = document.getElementById("form-error");
    errorEl.textContent = "";
    const origin = document.getElementById("origin").value.trim();
    const destination = document.getElementById("destination").value.trim();
    try {
      // No fare field -- trip-service predicts it from the route. Token is
      // read fresh here, not cached, so an edit made in the panel just
      // before clicking Submit is exactly what gets sent.
      await RF.postJSON("/api/trips", { origin, destination, riderId }, localStorage.getItem(TOKEN_KEY));
      ev.target.reset();
    } catch (err) {
      errorEl.textContent = err.message || RF.t("rider.error.default");
    }
  });

  document.getElementById("trips").addEventListener("click", async function (ev) {
    if (!ev.target.classList.contains("cancel-btn")) return;
    const card = ev.target.closest(".trip-card");
    const id = card.getAttribute("data-id");
    ev.target.disabled = true;
    try {
      await RF.postJSON("/api/trips/" + id + "/cancel", { riderId }, localStorage.getItem(TOKEN_KEY));
    } catch (err) {
      alert(err.message || RF.t("rider.error.cancel"));
      ev.target.disabled = false;
    }
  });
})();
