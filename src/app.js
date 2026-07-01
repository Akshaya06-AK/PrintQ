const statusFlow = ["Pending", "Printing", "Ready", "Collected"];
const state = {
  role: "student",
  jobs: [],
  centers: [],
  users: [],
  insights: null,
  recommendedCenter: null,
  form: {
    studentName: "Gokul A",
    department: "AI & DS",
    centerId: "auto",
    pages: 12,
    colorMode: "B/W",
    sides: "Duplex",
    copies: 1,
    paperSize: "A4",
    binding: false,
    schedule: "Now",
    groupName: "",
    paymentMethod: "Campus Wallet",
    fileName: ""
  },
  estimate: null
};

const view = document.querySelector("#view");
const metrics = document.querySelector("#metrics");
const notice = document.querySelector("#notice");
const liveTicket = document.querySelector("#liveTicket");

function money(value) {
  return `Rs.${Number(value || 0).toLocaleString("en-IN")}`;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  return res.json();
}

async function load() {
  const data = await api("/api/bootstrap");
  applyServerState(data);
  render();
}

function connectEvents() {
  const source = new EventSource("/api/events");
  source.onmessage = (event) => {
    applyServerState(JSON.parse(event.data));
    render();
  };
}

function applyServerState(data) {
  state.jobs = data.jobs || state.jobs;
  state.centers = data.centers || state.centers;
  state.users = data.users || state.users;
  state.insights = data.insights || state.insights;
  state.recommendedCenter = data.recommendedCenter || state.recommendedCenter;
}

async function refreshEstimate() {
  state.estimate = await api("/api/estimate", {
    method: "POST",
    body: JSON.stringify(state.form)
  });
  state.recommendedCenter = state.estimate.recommendedCenter;
  render();
}

function setRole(role) {
  state.role = role;
  document.querySelectorAll("[data-role]").forEach((button) => button.classList.toggle("active", button.dataset.role === role));
  render();
}

function setNotice(text) {
  notice.textContent = text;
}

function render() {
  renderMetrics();
  renderLiveTicket();
  if (state.role === "student") renderStudent();
  if (state.role === "shop") renderShop();
  if (state.role === "admin") renderAdmin();
}

function renderMetrics() {
  const insights = state.insights || {};
  metrics.innerHTML = [
    ["Active Queue", insights.active || 0],
    ["Ready Prints", insights.ready || 0],
    ["Revenue Today", money(insights.totalRevenue || 0)],
    ["Sheets Saved", insights.duplexSavings || 0]
  ].map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");
}

function renderLiveTicket() {
  const myJob = state.jobs.find((job) => job.studentName === state.form.studentName) || state.jobs[0];
  liveTicket.innerHTML = myJob ? `
    <span>Live Token</span>
    <strong>${myJob.token}</strong>
    <p>${myJob.status} at ${myJob.centerName}</p>
    <div class="qr">${myJob.qrSvg}</div>
  ` : "<span>Live Token</span><strong>--</strong><p>No active jobs</p>";
}

function renderStudent() {
  const form = state.form;
  const estimate = state.estimate || {};
  const myJobs = state.jobs.filter((job) => job.studentName === form.studentName);

  view.innerHTML = `
    <div class="content-grid">
      <section class="panel wide">
        <div class="section-title">
          <div><p class="eyebrow">Student Module</p><h2>Upload and book print</h2></div>
          <span class="pill">Wallet balance: Rs.850</span>
        </div>
        <form class="print-form" id="printForm">
          ${field("studentName", "Student name", "text", form.studentName)}
          ${field("department", "Department", "text", form.department)}
          <label class="full">Upload PDF/DOCX<input id="fileInput" type="file" accept=".pdf,.doc,.docx" /></label>
          <label>Print center<select name="centerId">
            <option value="auto" ${form.centerId === "auto" ? "selected" : ""}>Auto assign least busy printer</option>
            ${state.centers.map((center) => `<option value="${center.id}" ${form.centerId === center.id ? "selected" : ""}>${center.name}</option>`).join("")}
          </select></label>
          ${field("pages", "Pages", "number", form.pages)}
          ${select("colorMode", "Color mode", ["B/W", "Color"], form.colorMode)}
          ${select("sides", "Print side", ["Single", "Duplex"], form.sides)}
          ${field("copies", "Copies", "number", form.copies)}
          ${select("paperSize", "Paper size", ["A4", "A3", "Legal"], form.paperSize)}
          ${select("schedule", "Schedule", ["Now", "After 1 hour", "Tomorrow morning"], form.schedule)}
          ${select("paymentMethod", "Payment", ["Campus Wallet", "UPI Demo", "Card Demo"], form.paymentMethod)}
          ${field("groupName", "Group name", "text", form.groupName, "Optional project team")}
          <label class="check full"><input name="binding" type="checkbox" ${form.binding ? "checked" : ""} /> Add simple binding</label>
          <button class="submit full" type="submit">Pay and Generate QR Token</button>
        </form>
      </section>

      <aside class="panel">
        <div class="section-title compact"><div><p class="eyebrow">Smart Estimate</p><h2>${money(estimate.cost || 0)}</h2></div></div>
        <div class="insight-list">
          <p><b>Recommended:</b> ${state.recommendedCenter?.name || "Calculating..."}</p>
          <p><b>Blank page detection:</b> ${estimate.blankPages || 0} suspected blank pages</p>
          <p><b>Eco points:</b> +${estimate.ecoPoints || 0}</p>
          ${estimate.duplexSuggestion ? `<p class="good">Use duplex printing to reduce paper and cost.</p>` : ""}
        </div>
      </aside>

      <section class="panel wide">
        <div class="section-title"><div><p class="eyebrow">Order history</p><h2>My print jobs</h2></div></div>
        ${jobTable(myJobs)}
      </section>
    </div>
  `;

  document.querySelector("#printForm").addEventListener("input", onFormInput);
  document.querySelector("#printForm").addEventListener("change", onFormInput);
  document.querySelector("#printForm").addEventListener("submit", submitJob);
  document.querySelector("#fileInput").addEventListener("change", (event) => {
    state.form.fileName = event.target.files?.[0]?.name || "";
  });
}

function field(name, label, type, value, placeholder = "") {
  return `<label>${label}<input name="${name}" type="${type}" min="1" value="${escapeHtml(value)}" placeholder="${placeholder}" /></label>`;
}

function select(name, label, options, value) {
  return `<label>${label}<select name="${name}">${options.map((option) => `<option ${value === option ? "selected" : ""}>${option}</option>`).join("")}</select></label>`;
}

function onFormInput(event) {
  const target = event.target;
  if (!target.name) return;
  state.form[target.name] = target.type === "checkbox" ? target.checked : target.value;
  refreshEstimate();
}

async function submitJob(event) {
  event.preventDefault();
  const job = await api("/api/jobs", {
    method: "POST",
    body: JSON.stringify(state.form)
  });
  setNotice(`${job.id} created. Token ${job.token} sent to print shop.`);
}

function renderShop() {
  const activeJobs = state.jobs.filter((job) => job.status !== "Collected");
  view.innerHTML = `
    <div class="content-grid">
      <section class="panel wide">
        <div class="section-title">
          <div><p class="eyebrow">Print Shop Dashboard</p><h2>Incoming live jobs</h2></div>
          <span class="pill">Peak: ${state.insights?.peakHour || "-"}</span>
        </div>
        <div class="job-cards">
          ${activeJobs.map(jobCard).join("") || `<p class="empty">No active print jobs.</p>`}
        </div>
      </section>
      <aside class="panel">
        <div class="section-title compact"><div><p class="eyebrow">Center loads</p><h2>Queue</h2></div></div>
        ${state.centers.map((center) => `<div class="load-row"><span>${center.name}</span><b>${state.jobs.filter((job) => job.centerId === center.id && job.status !== "Collected").length} jobs</b></div>`).join("")}
      </aside>
    </div>
  `;
  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => updateStatus(button.dataset.job, button.dataset.status));
  });
}

function jobCard(job) {
  return `
    <article class="job-card">
      <div class="job-top">
        <div><strong>${job.id}</strong><p>${escapeHtml(job.fileName)} • ${escapeHtml(job.studentName)}</p></div>
        <span class="status ${job.status.toLowerCase()}">${job.status}</span>
      </div>
      <div class="job-meta">
        <span>${job.pages} pages</span><span>${job.colorMode}</span><span>${job.sides}</span><span>${job.copies} copies</span><span>${money(job.amount)}</span>
      </div>
      <div class="status-buttons">
        ${statusFlow.map((status) => `<button data-job="${job.id}" data-status="${status}" class="${job.status === status ? "active" : ""}">${status}</button>`).join("")}
      </div>
    </article>
  `;
}

async function updateStatus(id, status) {
  await api(`/api/jobs/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
  setNotice(`Job ${id} moved to ${status}`);
}

function renderAdmin() {
  view.innerHTML = `
    <div class="content-grid">
      <section class="panel wide">
        <div class="section-title">
          <div><p class="eyebrow">Admin Dashboard</p><h2>Print centers and printer health</h2></div>
          <span class="pill">Popular mode: ${state.insights?.popularMode || "-"}</span>
        </div>
        <div class="center-grid">
          ${state.centers.map(centerCard).join("")}
        </div>
      </section>
      <aside class="panel">
        <div class="section-title compact"><div><p class="eyebrow">Analytics</p><h2>Busy hours</h2></div></div>
        ${(state.insights?.busyPrediction || []).map((slot) => `
          <div class="busy-row"><span>${slot.slot}</span><div><i style="width:${slot.level}%"></i></div><b>${slot.level}%</b></div>
        `).join("")}
      </aside>
      <section class="panel wide">
        <div class="section-title"><div><p class="eyebrow">All orders</p><h2>Revenue and user activity</h2></div></div>
        ${jobTable(state.jobs)}
      </section>
    </div>
  `;
  document.querySelectorAll("[data-center]").forEach((button) => {
    button.addEventListener("click", () => updateCenter(button.dataset.center, button.dataset.open !== "true"));
  });
}

function centerCard(center) {
  return `
    <article class="center-card">
      <div><strong>${center.name}</strong><p>${center.location} • ${center.printers} printers</p></div>
      <div class="health-bar"><span style="width:${center.health}%"></span></div>
      <div class="center-actions">
        <span>${center.health}% health • ${center.open ? "Open" : "Closed"}</span>
        <button data-center="${center.id}" data-open="${center.open}">${center.open ? "Close" : "Open"}</button>
      </div>
    </article>
  `;
}

async function updateCenter(id, open) {
  await api(`/api/centers/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ open })
  });
  setNotice(`Print center ${open ? "opened" : "closed"}`);
}

function jobTable(jobs) {
  if (!jobs.length) return `<p class="empty">No jobs yet. Create one from the student module.</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Token</th><th>File</th><th>Center</th><th>Options</th><th>Amount</th><th>Status</th><th>QR</th></tr></thead>
        <tbody>
          ${jobs.map((job) => `
            <tr>
              <td>${job.token}</td>
              <td><b>${escapeHtml(job.fileName)}</b><br><span>${escapeHtml(job.studentName)}</span></td>
              <td>${escapeHtml(job.centerName)}</td>
              <td>${job.pages}p • ${job.colorMode} • ${job.sides} • x${job.copies}</td>
              <td>${money(job.amount)}</td>
              <td><span class="status ${job.status.toLowerCase()}">${job.status}</span></td>
              <td><div class="mini-qr">${job.qrSvg}</div></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

document.querySelectorAll("[data-role]").forEach((button) => {
  button.addEventListener("click", () => setRole(button.dataset.role));
});

document.querySelectorAll("[data-role-jump]").forEach((button) => {
  button.addEventListener("click", () => setRole(button.dataset.roleJump));
});

await load();
await refreshEstimate();
connectEvents();
