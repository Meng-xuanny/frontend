const API_BASE = window.location.hostname.includes("localhost")
  ? "http://127.0.0.1:8000"
  : "https://visionsafeapi-ahh6gthchugscuak.australiaeast-01.azurewebsites.net";

const map = L.map("map").setView([-33.8, 151.0], 6);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap",
}).addTo(map);

let hotspotLayer = L.layerGroup().addTo(map);
let heatLayer = null;
let hotspots = [];

// ------------------ Load hotspots ------------------

function buildUrl() {
  const time = document.getElementById("timeFilter").value;
  const species = document.getElementById("speciesFilter").value;
  const road_name = document.getElementById("roadFilter").value;

  let url = API_BASE + "/hotspots?";

  if (road_name) url += `road_name=${road_name}&`;
  if (time) url += `time_of_day=${time}&`;
  if (species) url += `species=${species}`;

  return url;
}

async function loadHotspots() {
  hotspotLayer.clearLayers();
  hotspots = [];

  if (heatLayer) map.removeLayer(heatLayer);

  const res = await fetch(buildUrl());
  const data = await res.json();

  drawHeatmap(data.segments);
  data.segments.forEach(drawHotspot);
}

// ------------------ Draw hotspot ------------------
function computeRadius(seg) {
  const intensity =
    seg.total_events +
    seg.event_breakdown.killed * 3 +
    seg.event_breakdown.injured * 1;

  return Math.max(150, Math.sqrt(intensity) * 80);
}

// severity
function severityColor(seg) {
  if (seg.event_breakdown.killed > 5) return "#7a0000"; // dark red
  if (seg.event_breakdown.killed > 0) return "#cc0000";
  if (seg.event_breakdown.injured > 5) return "#ff6600";
  if (seg.event_breakdown.injured > 0) return "#ff9900";
  return "#ffd966"; // low severity
}

function drawHotspot(seg) {
  const radius = computeRadius(seg);
  const color = severityColor(seg);

  const isExtreme = seg.danger_category === "Extreme";

  const riskColor = isExtreme ? "#b30000" : "#d97706"; // dark red / orange
  const riskText = isExtreme ? "EXTREME RISK AREA" : "HIGH RISK AREA";

  const recommendation = isExtreme
    ? "Slow down immediately and scan road edges."
    : "Reduce speed and stay alert for wildlife.";

  L.circle([seg.start_lat, seg.start_lon], {
    radius,
    color,
    fillOpacity: 0.55,
  }).addTo(hotspotLayer).bindPopup(`
      <div style="max-width:220px;font-family:sans-serif;">
        
        <div style="
          font-weight:bold;
          font-size:15px;
          color:${riskColor};
          margin-bottom:6px;">
          ⚠ ${riskText}
        </div>

        <div style="font-weight:bold;">
          ${seg.road_name}
        </div>

        <div style="margin-top:8px;">
          <span style="color:${riskColor}; font-weight:bold;">
            Recommended:
          </span><br>
          ${recommendation}
        </div>

      </div>
    `);

  hotspots.push({
    lat: seg.start_lat,
    lon: seg.start_lon,
    radius,
    name: seg.road_name,
    level: seg.danger_category,
  });
}

function drawHeatmap(data) {
  if (heatLayer) map.removeLayer(heatLayer);

  const points = data.map((seg) => {
    const weight =
      seg.total_events +
      seg.event_breakdown.killed * 4 +
      seg.event_breakdown.injured * 2;

    return [seg.start_lat, seg.start_lon, weight];
  });

  heatLayer = L.heatLayer(points, {
    radius: 45,
    blur: 30,
    minOpacity: 0.4,
    gradient: {
      0.2: "#ffffb2",
      0.4: "#fecc5c",
      0.6: "#fd8d3c",
      0.8: "#f03b20",
      1.0: "#7a0000",
    },
  }).addTo(map);
}

// ------------------ Vehicle ------------------

let vehicle;

function addVehicle() {
  vehicle = L.marker([-34, 151], { draggable: true }).addTo(map);

  vehicle.on("move", (e) => {
    checkAlert(e.latlng);
  });
}

let activeBannerTimeout = null;

function showBanner(message, level) {
  const banner = document.getElementById("riskBanner");

  banner.className = "risk-banner " + level;
  banner.innerText = message;

  banner.classList.remove("hidden");

  // slight delay so transition works
  setTimeout(() => {
    banner.classList.add("show");
  }, 10);

  // auto hide after 5 seconds
  if (activeBannerTimeout) clearTimeout(activeBannerTimeout);

  activeBannerTimeout = setTimeout(() => {
    banner.classList.remove("show");
    setTimeout(() => banner.classList.add("hidden"), 400);
  }, 5000);
}

function checkAlert(pos) {
  hotspots.forEach((h) => {
    const d = map.distance([h.lat, h.lon], pos);

    if (d < h.radius && !h.alerted) {
      h.alerted = true;

      const isExtreme = h.level === "Extreme";

      const message = isExtreme
        ? "⚠ EXTREME wildlife collision risk ahead on " +
          h.name +
          ". Slow down immediately."
        : "⚠ High wildlife collision risk ahead on " +
          h.name +
          ". Reduce speed and stay alert.";

      showBanner(message, isExtreme ? "extreme" : "high");
    }

    if (d >= h.radius) {
      h.alerted = false;
    }
  });
}

// ------------------ Init ------------------

loadHotspots();
addVehicle();
