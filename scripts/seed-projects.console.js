/**
 * Seed 50 sample projects onto the delivery board.
 *
 * HOW TO RUN:
 *   1. Open the app in the browser and log in as admin/manager.
 *   2. Open DevTools (F12) → Console.
 *   3. Paste this whole file and press Enter.
 *   4. Reload the page when it reports "done".
 *
 * Uses your own Cognito session token and the normal POST /projects API,
 * so everything passes server-side validation. Case numbers 2001–2050.
 * A cleanup snippet to delete all seeded projects is at the bottom.
 */
(async () => {
  const API = "https://akll4crv52.execute-api.ap-southeast-4.amazonaws.com";

  const token = (() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.endsWith(".idToken")) return localStorage.getItem(key);
    }
    throw new Error("No Cognito idToken found in localStorage — log in first.");
  })();

  const DAY = 864e5;
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const STAGES = [
    "handover",
    "procurement",
    "engineering",
    "build",
    "qa",
    "dispatch",
    "commissioning",
    "closed",
  ];
  const STAGE_LABELS = {
    handover: "Handover",
    procurement: "Procurement",
    engineering: "Engineering",
    build: "Build",
    qa: "QA / FAT",
    dispatch: "Dispatch",
    commissioning: "Commissioning",
    closed: "Closed",
  };
  const CRITERIA = {
    handover: ["so", "scope", "meet", "deposit", "eta"],
    procurement: ["po", "long", "eta", "recv"],
    engineering: ["draw", "bom", "ctrl", "approve", "eta"],
    build: ["walk", "eta"], // "trades" is auto — cleared by trade state
    qa: ["fat", "cert", "cust", "eta"],
    dispatch: ["book", "rig", "access", "eta"],
    commissioning: ["comm", "params", "signoff", "oem"],
    closed: [],
  };
  const CHECKLISTS = {
    plumbing: ["Rough-in", "Primary pipework", "Valves & fittings", "Pressure test", "Insulation"],
    electrical: ["Cable trays", "Terminations", "Board & test"],
    prefab: ["Skid frame", "Mount components", "Weld & finish"],
    controller: ["Wire & program", "Bench test", "Commission params"],
  };
  const TYPE_TRADES = {
    supply_loose: [],
    prefab: ["plumbing", "electrical", "prefab"],
    prefab_install: ["plumbing", "electrical", "prefab"],
    supply_loose_install: ["plumbing", "electrical"],
  };
  const TYPES = ["supply_loose", "prefab", "prefab_install", "supply_loose_install"];

  const PEOPLE = ["S. Dhungana", "M. Riley", "J. Chen", "A. Kowalski", "T. Nguyen", "P. O'Brien"];
  const VALUES = [
    "$42k",
    "$68k",
    "$95k",
    "$120k",
    "$150k",
    "$186k",
    "$210k",
    "$240k",
    "$275k",
    "$320k",
    "$380k",
    "$450k",
    "$520k",
    "$610k",
    "$740k",
    "$860k",
    "$1.1M",
    "$1.4M",
    "$2.2M",
  ];
  const CUSTOMERS = [
    "Brunswick Baths",
    "Monash Aquatic Centre",
    "St Vincent's Private",
    "Carlton Brewhouse",
    "Geelong Grammar",
    "Northcote Leisure Centre",
    "Box Hill Hospital",
    "Werribee Mansion Hotel",
    "Sunshine Energy Park",
    "Kew Recreation Centre",
    "Altona Meadows Pool",
    "Epping Plaza",
    "La Trobe University",
    "Dandenong Market",
    "Preston Laundry Co",
    "Footscray Arts Precinct",
    "Moonee Valley Racecourse",
    "Bundoora RMIT Campus",
    "Frankston Hospital",
    "Hawthorn Aquatic",
    "Craigieburn Splash Park",
    "Richmond Icehouse",
    "Doncaster Shoppingtown",
    "Essendon Fields Hotel",
    "Pakenham Sports Hub",
    "Broadmeadows Leisure",
    "Glen Waverley Hotel",
    "Coburg Velodrome",
    "Mornington Winery",
    "Ballarat Grammar",
    "Bendigo Health",
    "Traralgon Rec Centre",
    "Shepparton Dairy Co",
    "Wodonga TAFE",
    "Mildura Base Hospital",
    "Warrnambool Foreshore Pavilion",
    "Torquay Surf Club",
    "Ocean Grove Bowls",
    "Castlemaine Woollen Mill",
    "Daylesford Springs Spa",
    "Yarra Valley Chocolaterie",
    "Healesville Sanctuary",
    "Phillip Island Resort",
    "Queenscliff Ferry Terminal",
    "Sorrento Baths",
    "Portsea Golf Club",
    "Eltham College",
    "Ivanhoe Grammar",
    "Sandringham Yacht Club",
    "Williamstown Seaworks",
  ];
  const SUBURBS = [
    "Brunswick VIC",
    "Clayton VIC",
    "Fitzroy VIC",
    "Carlton VIC",
    "Geelong VIC",
    "Northcote VIC",
    "Box Hill VIC",
    "Werribee VIC",
    "Sunshine VIC",
    "Kew VIC",
    "Altona VIC",
    "Epping VIC",
    "Bundoora VIC",
    "Dandenong VIC",
    "Preston VIC",
    "Footscray VIC",
    "Moonee Ponds VIC",
    "Frankston VIC",
    "Hawthorn VIC",
    "Craigieburn VIC",
    "Richmond VIC",
    "Doncaster VIC",
    "Essendon VIC",
    "Pakenham VIC",
    "Broadmeadows VIC",
    "Glen Waverley VIC",
    "Coburg VIC",
    "Mornington VIC",
    "Ballarat VIC",
    "Bendigo VIC",
    "Traralgon VIC",
    "Shepparton VIC",
  ];
  const SO_LABELS = [
    "Plant Room A",
    "Plant Room B",
    "Main Building",
    "Pool Hall",
    "North Wing",
    "South Wing",
    "Boiler House",
    "Rooftop Plant",
    "Basement Plant",
    "Gym & Spa",
    "Kitchen Block",
    "",
  ];
  const BLOCK_REASONS = [
    "Waiting on customer site access",
    "Heat pump on back order — 6 week ETA",
    "Engineering revision requested by client",
    "Deposit not yet received",
  ];

  // Weighted stage spread across the pipeline.
  const STAGE_POOL = [
    ...Array(8).fill("handover"),
    ...Array(7).fill("procurement"),
    ...Array(8).fill("engineering"),
    ...Array(10).fill("build"),
    ...Array(6).fill("qa"),
    ...Array(4).fill("dispatch"),
    ...Array(5).fill("commissioning"),
    ...Array(2).fill("closed"),
  ];

  const signOff = (at) => ({ by: pick(PEOPLE), at: iso(at), comment: "Verified — seed data" });

  const makeProject = (i) => {
    const stage = STAGE_POOL[i];
    const stageIdx = STAGES.indexOf(stage);
    const type = pick(TYPES);
    const controlPanel = Math.random() < 0.8;
    const tradeKeys = [...TYPE_TRADES[type], ...(controlPanel ? ["controller"] : [])];

    // Timeline: walk stage targets so earlier stages sit in the past and the
    // current stage lands near today (some overdue, some comfortable).
    let cursor = now - (stageIdx * 18 + rand(0, 12)) * DAY;
    const startedAt = cursor;
    const stageTargets = {};
    for (const s of STAGES) {
      if (s === "closed") continue;
      cursor += rand(10, 25) * DAY;
      stageTargets[s] = iso(cursor);
    }
    const deliveryDate = iso(Date.parse(stageTargets.commissioning) + rand(2, 6) * DAY);

    // Gates: everything before the current stage fully signed; the current
    // stage partially signed.
    const gates = {};
    const activityLog = [];
    let moveAt = startedAt;
    for (let s = 0; s < stageIdx; s++) {
      const key = STAGES[s];
      gates[key] = {};
      for (const c of CRITERIA[key]) gates[key][c] = signOff(moveAt + rand(1, 9) * DAY);
      moveAt = Math.min(Date.parse(stageTargets[key] ?? iso(moveAt + 14 * DAY)), now - DAY);
      activityLog.push({
        kind: "stage",
        field: "",
        from: STAGE_LABELS[STAGES[s]],
        to: STAGE_LABELS[STAGES[s + 1]],
        at: iso(moveAt),
        by: pick(PEOPLE),
        note: "",
      });
    }
    if (stage !== "closed") {
      gates[stage] = {};
      for (const c of CRITERIA[stage]) {
        gates[stage][c] = Math.random() < 0.4 ? signOff(now - rand(0, 5) * DAY) : null;
      }
    }

    // Trades: past Build → all signed off; at Build → random progress.
    let trades;
    if (stageIdx > STAGES.indexOf("build")) {
      trades = {};
      for (const key of tradeKeys) {
        trades[key] = {
          state: "signed_off",
          blocked: false,
          reason: "",
          checklist: CHECKLISTS[key].map((label) => ({
            label,
            signoff: signOff(moveAt - rand(1, 10) * DAY),
          })),
        };
      }
    } else if (stage === "build") {
      trades = {};
      const states = ["not_started", "in_progress", "in_progress", "complete", "signed_off"];
      for (const key of tradeKeys) {
        const state = pick(states);
        const doneCount =
          state === "not_started"
            ? 0
            : state === "in_progress"
              ? rand(1, Math.max(1, CHECKLISTS[key].length - 1))
              : CHECKLISTS[key].length;
        trades[key] = {
          state,
          blocked: false,
          reason: "",
          checklist: CHECKLISTS[key].map((label, idx) => ({
            label,
            signoff: idx < doneCount ? signOff(now - rand(0, 12) * DAY) : null,
          })),
        };
      }
      // A few blocked trades for the BaajBoard action list.
      if (i % 9 === 0 && tradeKeys.length > 0) {
        const key = pick(tradeKeys);
        trades[key].blocked = true;
        trades[key].reason = pick(BLOCK_REASONS);
      }
    }

    const salesOrders = Array.from({ length: rand(1, 3) }, (_, n) => ({
      id: crypto.randomUUID(),
      soNumber: String(84100 + i * 3 + n),
      label: pick(SO_LABELS),
    }));

    const blocked = stage !== "closed" && i % 12 === 5;

    return {
      projectRef: String(2001 + i),
      customerName: CUSTOMERS[i],
      location: pick(SUBURBS),
      description: "",
      projectType: type,
      controlPanel,
      salesOrders,
      value: pick(VALUES),
      stage,
      gates,
      ...(trades ? { trades } : {}),
      blocked,
      blockedReason: blocked ? pick(BLOCK_REASONS) : "",
      targetDate: stage === "closed" ? null : stageTargets[stage],
      deliveryDate,
      stageTargets,
      dateLog: [],
      activityLog,
    };
  };

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < 50; i++) {
    const project = makeProject(i);
    try {
      const res = await fetch(`${API}/projects`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      if (res.ok) {
        ok++;
        console.log(`✓ ${project.projectRef} ${project.customerName} [${project.stage}]`);
      } else {
        failed++;
        console.warn(`✗ ${project.projectRef}`, res.status, await res.text());
      }
    } catch (error) {
      failed++;
      console.warn(`✗ ${project.projectRef}`, error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  console.log(`done — ${ok} created, ${failed} failed. Reload the page to see them.`);
})();

/* ============================================================================
 * CLEANUP — paste this instead to DELETE all seeded projects (case 2001–2050).
 * Requires an admin login (DELETE /projects is admin-only).
 * ============================================================================
(async () => {
  const API = "https://akll4crv52.execute-api.ap-southeast-4.amazonaws.com";
  let token;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.endsWith(".idToken")) token = localStorage.getItem(key);
  }
  const res = await fetch(`${API}/projects`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  const projects = Array.isArray(body) ? body : (body.projects ?? []);
  const seeded = projects.filter((p) => /^20(0[1-9]|[1-4][0-9]|50)$/.test(p.projectRef));
  console.log(`Deleting ${seeded.length} seeded projects…`);
  for (const p of seeded) {
    const del = await fetch(`${API}/projects/${p.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(del.ok ? `✓ deleted ${p.projectRef}` : `✗ ${p.projectRef} ${del.status}`);
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log("cleanup done — reload the page.");
})();
============================================================================ */
