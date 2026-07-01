import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const clients = new Set();

const centers = [
  { id: "pc-main", name: "Main Block Print Center", location: "Ground Floor", printers: 3, health: 94, open: true },
  { id: "pc-library", name: "Library Xerox Hub", location: "Library Entrance", printers: 2, health: 88, open: true },
  { id: "pc-admin", name: "Admin Block Print Desk", location: "Admin Block", printers: 1, health: 71, open: true }
];

let jobs = [
  {
    id: "PQ-2401",
    studentName: "Gokul A",
    department: "AI & DS",
    fileName: "DAA_Record.pdf",
    centerId: "pc-main",
    centerName: "Main Block Print Center",
    pages: 18,
    colorMode: "B/W",
    sides: "Duplex",
    copies: 1,
    paperSize: "A4",
    schedule: "Now",
    groupName: "",
    paymentMethod: "Campus Wallet",
    amount: 28,
    token: 41,
    status: "Printing",
    eta: 8,
    ecoPoints: 12,
    createdAt: new Date(Date.now() - 1000 * 60 * 16).toISOString()
  },
  {
    id: "PQ-2402",
    studentName: "Akshaya",
    department: "CSE",
    fileName: "Hall_Ticket.pdf",
    centerId: "pc-library",
    centerName: "Library Xerox Hub",
    pages: 2,
    colorMode: "Color",
    sides: "Single",
    copies: 1,
    paperSize: "A4",
    schedule: "Now",
    groupName: "",
    paymentMethod: "UPI Demo",
    amount: 12,
    token: 18,
    status: "Ready",
    eta: 0,
    ecoPoints: 0,
    createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString()
  }
];

const users = [
  { name: "Gokul A", role: "Student", department: "AI & DS", orders: 7 },
  { name: "Akshaya", role: "Student", department: "CSE", orders: 4 },
  { name: "Print Shop Staff", role: "Staff", department: "Campus Services", orders: 0 }
];

function json(response, data, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
  });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function activeJobs(centerId) {
  return jobs.filter((job) => job.centerId === centerId && !["Collected", "Cancelled"].includes(job.status));
}

function leastBusyCenter() {
  return [...centers].filter((center) => center.open).sort((a, b) => activeJobs(a.id).length - activeJobs(b.id).length)[0] || centers[0];
}

function estimateCost({ pages = 1, colorMode = "B/W", sides = "Single", copies = 1, binding = false }) {
  const pageCount = Number(pages || 1) * Number(copies || 1);
  const pageRate = colorMode === "Color" ? 6 : 1.5;
  const sideDiscount = sides === "Duplex" ? Math.ceil(pageCount / 2) * 0.4 : 0;
  const bindingCost = binding ? 25 : 0;
  return Math.max(5, Math.round(pageCount * pageRate - sideDiscount + bindingCost));
}

function withQr(job) {
  return {
    ...job,
    qrSvg: makeQrSvg(`${job.id}-${job.token}-${job.centerName}`)
  };
}

function makeQrSvg(text) {
  let seed = 0;
  for (let i = 0; i < text.length; i += 1) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  const cells = [];
  for (let y = 0; y < 17; y += 1) {
    for (let x = 0; x < 17; x += 1) {
      const finder =
        (x < 5 && y < 5) ||
        (x > 11 && y < 5) ||
        (x < 5 && y > 11);
      const bit = finder || ((seed + x * 13 + y * 29 + x * y) % 5 < 2);
      if (bit) cells.push(`<rect x="${x * 6}" y="${y * 6}" width="5" height="5" rx="1"/>`);
    }
  }
  return `<svg viewBox="0 0 102 102" xmlns="http://www.w3.org/2000/svg"><rect width="102" height="102" fill="white"/><g fill="#0b302d">${cells.join("")}</g></svg>`;
}

function makeInsights() {
  const totalRevenue = jobs.reduce((sum, job) => sum + job.amount, 0);
  const ready = jobs.filter((job) => job.status === "Ready").length;
  const collected = jobs.filter((job) => job.status === "Collected").length;
  const active = jobs.filter((job) => !["Collected", "Cancelled"].includes(job.status)).length;
  const duplexSavings = jobs.filter((job) => job.sides === "Duplex").reduce((sum, job) => sum + Math.floor(job.pages / 2) * job.copies, 0);
  return {
    totalRevenue,
    ready,
    collected,
    active,
    peakHour: jobs.length > 4 ? "12:30 PM - 2:00 PM" : "10:30 AM - 12:00 PM",
    duplexSavings,
    popularSize: "A4",
    popularMode: jobs.filter((job) => job.colorMode === "B/W").length >= jobs.filter((job) => job.colorMode === "Color").length ? "B/W" : "Color",
    centerLoads: centers.map((center) => ({
      ...center,
      queue: activeJobs(center.id).length,
      wait: activeJobs(center.id).length * 6 + (100 - center.health > 20 ? 5 : 0)
    })),
    busyPrediction: [
      { slot: "9-10 AM", level: 42 },
      { slot: "11-12 PM", level: 68 },
      { slot: "1-2 PM", level: 91 },
      { slot: "3-4 PM", level: 57 }
    ]
  };
}

function state() {
  return {
    jobs: jobs.map(withQr),
    centers,
    users,
    insights: makeInsights(),
    recommendedCenter: leastBusyCenter()
  };
}

function broadcast() {
  const payload = `data: ${JSON.stringify(state())}\n\n`;
  clients.forEach((client) => client.write(payload));
}

async function routeApi(request, response, url) {
  if (request.method === "OPTIONS") return json(response, {});

  if (url.pathname === "/api/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    response.write(`data: ${JSON.stringify(state())}\n\n`);
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return undefined;
  }

  if (url.pathname === "/api/bootstrap") return json(response, state());

  if (url.pathname === "/api/estimate" && request.method === "POST") {
    const body = await readBody(request);
    const pages = Number(body.pages || 1);
    return json(response, {
      cost: estimateCost(body),
      blankPages: pages > 12 ? 1 : 0,
      duplexSuggestion: pages >= 6 && body.sides !== "Duplex",
      recommendedCenter: leastBusyCenter(),
      ecoPoints: body.sides === "Duplex" ? Math.max(3, Math.floor(pages / 2)) : 0
    });
  }

  if (url.pathname === "/api/jobs" && request.method === "POST") {
    const body = await readBody(request);
    const center = body.centerId === "auto" ? leastBusyCenter() : centers.find((item) => item.id === body.centerId) || centers[0];
    const pages = Number(body.pages || 1);
    const copies = Number(body.copies || 1);
    const job = {
      id: `PQ-${2401 + jobs.length}`,
      studentName: body.studentName || "Demo Student",
      department: body.department || "AI & DS",
      fileName: body.fileName || "uploaded-document.pdf",
      centerId: center.id,
      centerName: center.name,
      pages,
      colorMode: body.colorMode || "B/W",
      sides: body.sides || "Single",
      copies,
      paperSize: body.paperSize || "A4",
      schedule: body.schedule || "Now",
      groupName: body.groupName || "",
      paymentMethod: body.paymentMethod || "Campus Wallet",
      amount: estimateCost({ ...body, pages, copies }),
      token: 40 + jobs.length + 1,
      status: "Pending",
      eta: activeJobs(center.id).length * 6 + 6,
      ecoPoints: body.sides === "Duplex" ? Math.max(3, Math.floor((pages * copies) / 2)) : 0,
      createdAt: new Date().toISOString()
    };
    jobs = [job, ...jobs];
    broadcast();
    return json(response, withQr(job), 201);
  }

  const statusMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/status$/);
  if (statusMatch && request.method === "PATCH") {
    const body = await readBody(request);
    jobs = jobs.map((job) => job.id === statusMatch[1] ? { ...job, status: body.status || job.status, eta: ["Ready", "Collected"].includes(body.status) ? 0 : job.eta } : job);
    broadcast();
    return json(response, withQr(jobs.find((job) => job.id === statusMatch[1])));
  }

  const centerMatch = url.pathname.match(/^\/api\/centers\/([^/]+)$/);
  if (centerMatch && request.method === "PATCH") {
    const body = await readBody(request);
    const center = centers.find((item) => item.id === centerMatch[1]);
    if (!center) return json(response, { message: "Center not found" }, 404);
    Object.assign(center, body);
    broadcast();
    return json(response, center);
  }

  return json(response, { message: "API route not found" }, 404);
}

async function serveStatic(response, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(root, cleanPath));
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    }[extname(filePath)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type });
    response.end(data);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    await routeApi(request, response, url);
    return;
  }
  await serveStatic(response, url.pathname);
});

const PORT = process.env.PORT || 5173;
server.listen(PORT, () => {
  console.log(`PrintQ running at http://localhost:${PORT}`);
});
