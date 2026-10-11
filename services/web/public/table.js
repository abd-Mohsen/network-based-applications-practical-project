(function () {
  document.getElementById("nav").innerHTML = RF.navHtml("/table");
  document.getElementById("nav-id").hidden = true;

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      document.querySelectorAll(".tab-panel").forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-panel") !== btn.getAttribute("data-tab");
      });
    });
  });

  function cell(value) {
    return value === null || value === undefined || value === "" ? "—" : RF.escapeHtml(value);
  }

  function tripRow(trip) {
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

  function outboxRow(row) {
    return (
      "<tr>" +
      "<td>" + cell(row.id) + "</td>" +
      "<td>" + cell(row.eventType) + "</td>" +
      "<td style=\"max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\" title=\"" +
      RF.escapeHtml(row.payload) + "\">" + cell(row.payload) + "</td>" +
      "<td>" + (row.published ? "✓" : "—") + "</td>" +
      "<td>" + cell(row.createdAt) + "</td>" +
      "</tr>"
    );
  }

  function processedEventRow(row) {
    const approvedCell = row.approved === null ? "—" : row.approved ? "✓" : "✗";
    return (
      "<tr>" +
      "<td>" + cell(row.eventId) + "</td>" +
      "<td>" + cell(row.tripId) + "</td>" +
      "<td>" + approvedCell + "</td>" +
      "<td>" + cell(row.processedAt) + "</td>" +
      "</tr>"
    );
  }

  function renderTable(rows, bodySelector, emptyHintId, rowFn) {
    document.querySelector(bodySelector).innerHTML = rows.map(rowFn).join("");
    document.getElementById(emptyHintId).hidden = rows.length > 0;
  }

  function render(snapshot) {
    document.getElementById("ts").textContent = snapshot.updatedAt
      ? RF.t("dash.updatedAgo") + " " + RF.timeAgo(snapshot.updatedAt)
      : "";

    renderTable(snapshot.trips || [], "#trips-table tbody", "trips-empty-hint", tripRow);
    renderTable(snapshot.outbox || [], "#outbox-table tbody", "outbox-empty-hint", outboxRow);
    renderTable(snapshot.processedEvents || [], "#processed-events-table tbody", "processed-events-empty-hint", processedEventRow);
  }

  RF.connectEvents(render);
})();
