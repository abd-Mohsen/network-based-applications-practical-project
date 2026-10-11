(function () {
  document.getElementById("nav").innerHTML = RF.navHtml("/table");
  document.getElementById("nav-id").hidden = true;

  function cell(value) {
    return value === null || value === undefined || value === "" ? "—" : RF.escapeHtml(value);
  }

  function row(trip) {
    return (
      "<tr>" +
      "<td>" + cell(trip.id) + "</td>" +
      "<td>" + cell(trip.origin) + "</td>" +
      "<td>" + cell(trip.destination) + "</td>" +
      "<td>" + cell(trip.fare) + "</td>" +
      "<td>" + RF.statusPill(trip.status) + "</td>" +
      "<td>" + cell(trip.riderId) + "</td>" +
      "<td>" + cell(trip.driverId) + "</td>" +
      "<td>" + cell(trip.createdAt) + "</td>" +
      "<td>" + cell(trip.acceptedAt) + "</td>" +
      "<td>" + cell(trip.completedAt) + "</td>" +
      "<td>" + cell(trip.cancelledAt) + "</td>" +
      "</tr>"
    );
  }

  function render(snapshot) {
    document.getElementById("ts").textContent = snapshot.updatedAt
      ? RF.t("dash.updatedAgo") + " " + RF.timeAgo(snapshot.updatedAt)
      : "";

    const trips = snapshot.trips || [];
    document.querySelector("#trips-table tbody").innerHTML = trips.map(row).join("");
    document.getElementById("empty-hint").hidden = trips.length > 0;
  }

  RF.connectEvents(render);
})();
