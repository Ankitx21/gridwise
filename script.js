const tariffData = [
  { hour: 0, tariff: 5.2, carbon: 540, band: "normal" },
  { hour: 3, tariff: 5.0, carbon: 590, band: "normal" },
  { hour: 6, tariff: 5.8, carbon: 680, band: "normal" },
  { hour: 9, tariff: 5.6, carbon: 520, band: "normal" },
  { hour: 11, tariff: 4.9, carbon: 310, band: "cheap" },
  { hour: 13, tariff: 4.8, carbon: 220, band: "cheap" },
  { hour: 15, tariff: 5.0, carbon: 260, band: "cheap" },
  { hour: 17, tariff: 5.9, carbon: 420, band: "normal" },
  { hour: 18, tariff: 7.25, carbon: 620, band: "peak" },
  { hour: 20, tariff: 7.25, carbon: 720, band: "peak" },
  { hour: 22, tariff: 5.6, carbon: 610, band: "normal" },
  { hour: 24, tariff: 5.2, carbon: 560, band: "normal" }
];

const defaultAppliances = [
  { id: "washing", name: "Washing machine", kind: "flexible", userStart: 18.25, recommendedStart: 12.75, duration: 70, power: 0.7, enabled: true, note: "Laundry can finish anytime today" },
  { id: "dishwasher", name: "Dishwasher", kind: "flexible", userStart: 20.0, recommendedStart: 14.1, duration: 95, power: 1.15, enabled: true, note: "Shifted out of 18:00-22:00 peak" },
  { id: "geyser", name: "Geyser", kind: "comfort", userStart: 7.0, recommendedStart: 6.35, duration: 28, power: 2.0, enabled: true, note: "Morning comfort load" },
  { id: "bedroom-ac", name: "Bedroom AC", kind: "comfort", userStart: 21.0, recommendedStart: 17.2, duration: 75, power: 1.35, enabled: true, note: "Pre-cool before peak tariff" },
  { id: "water-pump", name: "Water pump", kind: "flexible", userStart: 19.5, recommendedStart: 11.8, duration: 25, power: 0.75, enabled: true, note: "Tank top-up during low-cost window" },
  { id: "ev-charger", name: "EV charger", kind: "flexible", userStart: 19.0, recommendedStart: 10.0, duration: 150, power: 2.2, enabled: true, note: "Largest flexible load" },
  { id: "refrigerator", name: "Refrigerator", kind: "critical", userStart: 0.0, recommendedStart: 0.0, duration: 1440, power: 0.12, enabled: true, note: "Always-on base load" }
];

let appliances = JSON.parse(JSON.stringify(defaultAppliances));

const elements = {
  chart: document.querySelector("#tariffChart"),
  timeline: document.querySelector("#timeline"),
  applianceList: document.querySelector("#applianceList"),
  statCards: document.querySelector("#statCards"),
  summaryRows: document.querySelector("#summaryRows"),
  loadBar: document.querySelector("#loadBar"),
  peakLoadText: document.querySelector("#peakLoadText"),
  savingText: document.querySelector("#savingText"),
  shiftedText: document.querySelector("#shiftedText"),
  enabledCount: document.querySelector("#enabledCount"),
  recommendationTitle: document.querySelector("#recommendationTitle"),
  recommendationText: document.querySelector("#recommendationText"),
  form: document.querySelector("#applianceForm"),
  recommendBtn: document.querySelector("#recommendBtn"),
  clearManualBtn: document.querySelector("#clearManualBtn")
};

function formatHour(value) {
  const normalized = ((value % 24) + 24) % 24;
  const hour = Math.floor(normalized);
  const rawMinutes = Math.round((normalized - hour) * 60);
  const safeHour = rawMinutes === 60 ? (hour + 1) % 24 : hour;
  const safeMinutes = rawMinutes === 60 ? 0 : rawMinutes;
  return `${String(safeHour).padStart(2, "0")}:${String(safeMinutes).padStart(2, "0")}`;
}

function parseTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours + minutes / 60;
}

function toTimeValue(hourValue) {
  return formatHour(hourValue);
}

function endTime(item, field = "recommendedStart") {
  return item[field] + item.duration / 60;
}

function currency(value) {
  return `₹${value.toFixed(0)}`;
}

function tariffAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  for (let index = 0; index < tariffData.length - 1; index += 1) {
    const current = tariffData[index];
    const next = tariffData[index + 1];
    if (h >= current.hour && h < next.hour) return current.tariff;
  }
  return tariffData[tariffData.length - 1].tariff;
}

function carbonAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  for (let index = 0; index < tariffData.length - 1; index += 1) {
    const current = tariffData[index];
    const next = tariffData[index + 1];
    if (h >= current.hour && h < next.hour) return current.carbon;
  }
  return tariffData[tariffData.length - 1].carbon;
}

function energy(item) {
  return item.power * item.duration / 60;
}

function runCost(item, startField) {
  const start = item[startField];
  let remaining = item.duration / 60;
  let cursor = start;
  let total = 0;

  while (remaining > 0.001) {
    const segment = Math.min(0.25, remaining);
    total += item.power * segment * tariffAt(cursor);
    cursor += segment;
    remaining -= segment;
  }

  return total;
}

function runCarbon(item, startField) {
  const start = item[startField];
  let remaining = item.duration / 60;
  let cursor = start;
  let total = 0;

  while (remaining > 0.001) {
    const segment = Math.min(0.25, remaining);
    total += item.power * segment * carbonAt(cursor) / 1000;
    cursor += segment;
    remaining -= segment;
  }

  return total;
}

function userCost(item) {
  return runCost(item, "userStart");
}

function optimizedCost(item) {
  return runCost(item, "recommendedStart");
}

function savedMoney(item) {
  if (item.kind === "critical") return 0;
  return Math.max(0, userCost(item) - optimizedCost(item));
}

function savedCo2(item) {
  if (item.kind === "critical") return 0;
  return Math.max(0, runCarbon(item, "userStart") - runCarbon(item, "recommendedStart"));
}

function activeAppliances() {
  return appliances.filter((item) => item.enabled);
}

function bestStartFor(item) {
  if (item.kind === "critical") return item.userStart;
  const searchWindows = item.kind === "comfort"
    ? [Math.max(0, item.userStart - 4), item.userStart]
    : [9, 16];
  let best = item.userStart;
  let bestScore = Infinity;
  const latest = Math.max(searchWindows[0], searchWindows[1] - item.duration / 60);

  for (let time = searchWindows[0]; time <= latest; time += 0.25) {
    const cost = energy(item) * tariffAt(time);
    const co2Penalty = energy(item) * carbonAt(time) / 1000;
    const comfortPenalty = item.kind === "comfort" ? Math.abs(item.userStart - time) * 0.75 : 0;
    const score = cost + co2Penalty + comfortPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = time;
    }
  }
  return Math.round(best * 4) / 4;
}

function optimizeSchedule() {
  appliances = appliances.map((item) => ({ ...item, recommendedStart: bestStartFor(item) }));
  avoidOverlaps();
  elements.recommendationTitle.textContent = "Best schedule applied for the full day";
  elements.recommendationText.textContent = "Flexible loads are moved into low-cost, lower-carbon hours. Comfort loads are shifted only when they still make sense for daily use.";
  renderAll();
}

function projectedLoadAt(time, candidate = null) {
  return 1.35 + appliances.reduce((sum, item) => {
    const start = candidate && candidate.id === item.id ? candidate.start : item.recommendedStart;
    const finish = start + item.duration / 60;
    const active = item.enabled && (item.kind === "critical" || (time >= start && time < finish));
    return active ? sum + item.power : sum;
  }, 0);
}

function isSafeSlot(item, start) {
  for (let time = start; time < start + item.duration / 60; time += 0.25) {
    if (projectedLoadAt(time, { id: item.id, start }) > 4.8) return false;
  }
  return true;
}

function avoidOverlaps() {
  const sorted = appliances
    .filter((item) => item.enabled && item.kind !== "critical")
    .sort((a, b) => b.power - a.power || a.recommendedStart - b.recommendedStart);

  sorted.forEach((item) => {
    const preferred = item.recommendedStart;
    let best = preferred;
    let bestDistance = Infinity;
    for (let time = 5; time <= 23.5 - item.duration / 60; time += 0.25) {
      if (!isSafeSlot(item, time)) continue;
      const distance = Math.abs(time - preferred);
      const peakPenalty = time >= 18 && time < 22 ? 6 : 0;
      const score = distance + peakPenalty;
      if (score < bestDistance) {
        bestDistance = score;
        best = time;
      }
    }
    item.recommendedStart = Math.round(best * 4) / 4;
  });
}

function drawTariffChart() {
  const width = 760;
  const height = 290;
  const padding = { top: 20, right: 42, bottom: 44, left: 54 };
  const x = (hour) => padding.left + (hour / 24) * (width - padding.left - padding.right);
  const yTariff = (value) => height - padding.bottom - ((value - 4.5) / 3.2) * (height - padding.top - padding.bottom);
  const yCarbon = (value) => height - padding.bottom - ((value - 180) / 580) * (height - padding.top - padding.bottom);
  const path = (data, y) => data.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.hour).toFixed(1)} ${y(point).toFixed(1)}`).join(" ");

  elements.chart.innerHTML = `
    <rect class="cheap-band" x="${x(11)}" y="${padding.top}" width="${x(16) - x(11)}" height="${height - padding.top - padding.bottom}"></rect>
    <rect class="peak-band" x="${x(18)}" y="${padding.top}" width="${x(22) - x(18)}" height="${height - padding.top - padding.bottom}"></rect>
    ${[5, 6, 7].map((tick) => `<line class="grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${yTariff(tick)}" y2="${yTariff(tick)}"></line><text class="axis-text" x="12" y="${yTariff(tick) + 4}">₹${tick}</text>`).join("")}
    ${[0, 4, 8, 12, 16, 20, 24].map((tick) => `<text class="axis-text" x="${x(tick) - 14}" y="${height - 14}">${String(tick).padStart(2, "0")}:00</text>`).join("")}
    <path class="tariff-line" d="${path(tariffData, (point) => yTariff(point.tariff))}"></path>
    <path class="carbon-line" d="${path(tariffData, (point) => yCarbon(point.carbon))}"></path>
    ${tariffData.map((point) => `<circle cx="${x(point.hour)}" cy="${yTariff(point.tariff)}" r="5" fill="var(--surface)" stroke="var(--primary)" stroke-width="3"></circle>`).join("")}
    <text class="axis-text" x="${width - 170}" y="32">solid: tariff ₹/kWh</text>
    <text class="axis-text" x="${width - 170}" y="52">dashed: CO2 g/kWh</text>
  `;
}

function renderTimeline() {
  const ticks = [0, 4, 8, 12, 16, 20, 24];
  elements.timeline.innerHTML = `
    <div class="time-axis"><span></span>${ticks.map((tick) => `<span>${String(tick).padStart(2, "0")}:00</span>`).join("")}</div>
  `;

  activeAppliances().forEach((item) => {
    const left = (item.recommendedStart / 24) * 100;
    const width = Math.max((item.duration / 60 / 24) * 100, item.kind === "critical" ? 100 : 4);
    const row = document.createElement("div");
    row.className = "timeline-row";
    row.innerHTML = `
      <div class="timeline-label">${item.name}</div>
      <div class="timeline-track">
        <div class="timeline-block ${item.kind}" style="left:${item.kind === "critical" ? 0 : left}%;width:${width}%">${formatHour(item.recommendedStart)} - ${formatHour(endTime(item))}</div>
      </div>
    `;
    elements.timeline.appendChild(row);
  });
}

function renderAppliances() {
  elements.applianceList.innerHTML = "";
  appliances.forEach((item) => {
    const card = document.createElement("div");
    card.className = "appliance-card";
    card.innerHTML = `
      <div class="appliance-main">
        <div class="appliance-title"><strong>${item.name}</strong><span class="pill">${item.kind}</span></div>
        <div class="appliance-meta">${item.note}</div>
        <div class="edit-grid">
          <label>Appliance<input type="text" value="${item.name}" data-id="${item.id}" data-field="name"></label>
          <label>Type
            <select data-id="${item.id}" data-field="kind">
              <option value="flexible" ${item.kind === "flexible" ? "selected" : ""}>Flexible</option>
              <option value="comfort" ${item.kind === "comfort" ? "selected" : ""}>Comfort</option>
              <option value="critical" ${item.kind === "critical" ? "selected" : ""}>Critical</option>
            </select>
          </label>
          <label>Preferred time<input type="time" value="${toTimeValue(item.userStart)}" data-id="${item.id}" data-field="userStart"></label>
          <label>Recommended<input type="time" value="${toTimeValue(item.recommendedStart)}" data-id="${item.id}" data-field="recommendedStart"></label>
          <label>Runtime min<input type="number" min="10" max="1440" value="${item.duration}" data-id="${item.id}" data-field="duration"></label>
          <label>Power kW<input type="number" min="0.1" max="7" step="0.05" value="${item.power}" data-id="${item.id}" data-field="power"></label>
        </div>
      </div>
      <div class="card-actions">
        <label class="switch" aria-label="Toggle ${item.name}"><input type="checkbox" ${item.enabled ? "checked" : ""} data-id="${item.id}" data-field="enabled"><span class="slider"></span></label>
        <button class="small-button" type="button" data-optimize="${item.id}">Best</button>
        <button class="icon-button" type="button" data-remove="${item.id}" aria-label="Remove ${item.name}">×</button>
      </div>
    `;
    elements.applianceList.appendChild(card);
  });
}
function renderStats() {
  const active = activeAppliances();
  const totalEnergy = active.reduce((sum, item) => sum + energy(item), 0) || 1;
  elements.statCards.innerHTML = active.map((item) => {
    const itemEnergy = energy(item);
    const saved = savedMoney(item);
    const co2 = savedCo2(item);
    const user = userCost(item);
    const optimized = optimizedCost(item);
    const share = (itemEnergy / totalEnergy) * 100;
    return `
      <article class="appliance-stat">
        <div class="stat-title"><span class="label">${item.kind}</span><strong>${item.name}</strong></div>
        <div class="stat-grid">
          <span>Consumption <b>${itemEnergy.toFixed(2)} kWh</b></span>
          <span>Energy share <b>${share.toFixed(0)}%</b></span>
          <span>Preferred cost <b>${currency(user)}</b></span>
          <span>Scheduled cost <b>${currency(optimized)}</b></span>
          <span>Money saved <b>${currency(saved)}</b></span>
          <span>CO2e saved <b>${co2.toFixed(2)} kg</b></span>
          <span>Peak draw <b>${item.power.toFixed(2)} kW</b></span>
          <span>Timing <b>${formatHour(item.recommendedStart)}</b></span>
        </div>
        <div class="saving-bar"><span style="width:${Math.min(100, (saved / Math.max(user, 1)) * 100)}%"></span></div>
      </article>
    `;
  }).join("");
}
function renderSummary() {
  elements.summaryRows.innerHTML = activeAppliances().map((item) => `
    <tr>
      <td>${item.name}</td>
      <td>${formatHour(item.userStart)}</td>
      <td>${formatHour(item.recommendedStart)} - ${formatHour(endTime(item))}</td>
      <td>${energy(item).toFixed(2)} kWh</td>
      <td>${currency(savedMoney(item))}</td>
      <td>${savedCo2(item).toFixed(2)} kg</td>
    </tr>
  `).join("");
}

function updateMetrics() {
  const active = activeAppliances();
  const saved = active.reduce((sum, item) => sum + savedMoney(item), 0);
  const co2 = active.reduce((sum, item) => sum + savedCo2(item), 0);
  const shifted = active.reduce((sum, item) => sum + (Math.abs(item.userStart - item.recommendedStart) >= 1 ? energy(item) : 0), 0);
  let peak = 1.35;

  for (let time = 0; time < 24; time += 0.25) {
    const load = active.reduce((sum, item) => {
      if (item.kind === "critical") return sum + item.power;
      return time >= item.recommendedStart && time < endTime(item) ? sum + item.power : sum;
    }, 0);
    peak = Math.max(peak, load);
  }

  elements.peakLoadText.textContent = `${peak.toFixed(1)} kW`;
  elements.loadBar.style.width = `${Math.min(100, (peak / 6) * 100)}%`;
  elements.savingText.textContent = currency(saved);
  elements.shiftedText.textContent = `${shifted.toFixed(1)} kWh`;
  elements.enabledCount.textContent = `${active.length} active`;

  if (peak > 4.8) {
    elements.recommendationTitle.textContent = "Load warning: schedule exceeds 4.8 kW";
    elements.recommendationText.textContent = `Projected peak is ${peak.toFixed(1)} kW. Move one high-power appliance or press Use best schedule.`;
  }
}

function renderAll() {
  drawTariffChart();
  renderTimeline();
  renderAppliances();
  renderStats();
  renderSummary();
  updateMetrics();
}

elements.applianceList.addEventListener("change", (event) => {
  const input = event.target;
  const item = appliances.find((appliance) => appliance.id === input.dataset.id);
  if (!item) return;
  const field = input.dataset.field;
  if (field === "enabled") item.enabled = input.checked;
  if (field === "name") item.name = input.value.trim() || item.name;
  if (field === "kind") item.kind = input.value;
  if (field === "userStart" || field === "recommendedStart") item[field] = parseTime(input.value);
  if (field === "duration") item.duration = Number(input.value);
  if (field === "power") item.power = Number(input.value);

  if (["userStart", "duration", "power", "kind"].includes(field)) {
    item.recommendedStart = bestStartFor(item);
    avoidOverlaps();
    elements.recommendationTitle.textContent = "Recommended schedule refreshed";
    elements.recommendationText.textContent = "Your preferred appliance details changed, so the best whole-day timing was recalculated automatically.";
  }

  renderAll();
});
elements.applianceList.addEventListener("click", (event) => {
  const optimizeId = event.target.dataset.optimize;
  if (optimizeId) {
    const item = appliances.find((appliance) => appliance.id === optimizeId);
    if (!item) return;
    item.recommendedStart = bestStartFor(item);
    avoidOverlaps();
    elements.recommendationTitle.textContent = `${item.name} moved to its best slot`;
    elements.recommendationText.textContent = "The appliance recommendation was refreshed against today's price, carbon and peak-load signals.";
    renderAll();
    return;
  }

  const id = event.target.dataset.remove;
  if (!id) return;
  appliances = appliances.filter((item) => item.id !== id);
  renderAll();
});
elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#newName").value.trim();
  const preferred = parseTime(document.querySelector("#newPreferred").value);
  const duration = Number(document.querySelector("#newDuration").value);
  const power = Number(document.querySelector("#newPower").value);
  const kind = document.querySelector("#newKind").value;
  const item = {
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
    name,
    kind,
    userStart: preferred,
    recommendedStart: preferred,
    duration,
    power,
    enabled: true,
    note: "User-added appliance"
  };
  item.recommendedStart = bestStartFor(item);
  appliances.push(item);
  avoidOverlaps();
  elements.form.reset();
  document.querySelector("#newName").value = "Clothes iron";
  document.querySelector("#newPreferred").value = "17:30";
  document.querySelector("#newDuration").value = "30";
  document.querySelector("#newPower").value = "1.20";
  renderAll();
});

elements.recommendBtn.addEventListener("click", optimizeSchedule);

elements.clearManualBtn.addEventListener("click", () => {
  appliances = JSON.parse(JSON.stringify(defaultAppliances));
  elements.recommendationTitle.textContent = "Recommended schedule restored";
  elements.recommendationText.textContent = "The original pre-filled whole-day plan is back in place with realistic dummy values.";
  renderAll();
});

optimizeSchedule();

