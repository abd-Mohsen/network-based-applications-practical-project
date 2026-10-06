(function () {
  const riderId = RF.getOrCreateId("rideflow.riderId", "rider");

  document.getElementById("nav").innerHTML = RF.navHtml("/");
  document.getElementById("nav-id").innerHTML = RF.t("rider.ridingAs") + ' <span class="mono">' + riderId + "</span>";

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
        return (
          '<div class="trip-card">' +
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
    const fare = Number(document.getElementById("fare").value);
    try {
      await RF.postJSON("/api/trips", { origin, destination, fare, riderId });
      ev.target.reset();
    } catch (err) {
      errorEl.textContent = err.message || RF.t("rider.error.default");
    }
  });
})();
