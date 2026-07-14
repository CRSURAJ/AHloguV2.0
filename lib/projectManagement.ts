import type {
  Project,
  ProjectActivityEntry,
  ProjectDepartment,
  ProjectGates,
  ProjectStageKey,
  ProjectStageTargets,
  ProjectTrade,
  ProjectTrades,
} from "@/types/work";

/**
 * Post-sale delivery pipeline. Projects advance one stage at a time and may
 * only move forward once every exit criterion for the current stage is signed
 * off. Jobs (worker work orders) are created under a project in the Build
 * phase and link back via `Job.projectId`.
 */
export const STAGES: ReadonlyArray<{ key: ProjectStageKey; label: string }> = [
  { key: "handover", label: "Handover" },
  { key: "procurement", label: "Procurement" },
  { key: "engineering", label: "Engineering" },
  { key: "build", label: "Build" },
  { key: "qa", label: "QA / FAT" },
  { key: "dispatch", label: "Dispatch" },
  { key: "commissioning", label: "Commissioning" },
  { key: "closed", label: "Closed" },
];

export const STAGE_KEYS: ReadonlyArray<ProjectStageKey> = STAGES.map((s) => s.key);

export const DEFAULT_STAGE: ProjectStageKey = "handover";

export const DEPARTMENT_OPTIONS: ReadonlyArray<{ value: ProjectDepartment; label: string }> = [
  { value: "install", label: "Install" },
  { value: "service", label: "Service" },
];

export type TradeDef = {
  key: string;
  label: string;
  short: string;
  /** Responsible discipline shown as a hint next to the trade. */
  owner: string;
};

export const TRADES: ReadonlyArray<TradeDef> = [
  { key: "plumbing", label: "Plumbing", short: "PL", owner: "Plumbing" },
  { key: "electrical", label: "Electrical", short: "EL", owner: "Electrical" },
  { key: "prefab", label: "Pre-fab", short: "PF", owner: "Fabrication" },
  { key: "controller", label: "Controller", short: "CT", owner: "Controls" },
];

export const CHECKLISTS: Record<string, string[]> = {
  plumbing: ["Rough-in", "Primary pipework", "Valves & fittings", "Pressure test", "Insulation"],
  electrical: ["Cable trays", "Terminations", "Board & test"],
  prefab: ["Skid frame", "Mount components", "Weld & finish"],
  controller: ["Wire & program", "Bench test", "Commission params"],
};

export type ExitCriterion = {
  id: string;
  label: string;
  /** Responsible discipline / role hint. */
  owner: string;
  /** When set to "trades", the criterion clears automatically once all trades are done. */
  auto?: "trades";
};

export const EXIT_CRITERIA: Record<ProjectStageKey, ExitCriterion[]> = {
  handover: [
    { id: "so", label: "Signed sales order attached", owner: "Sales" },
    { id: "scope", label: "Scope & site constraints documented", owner: "Sales" },
    { id: "meet", label: "Handover meeting held", owner: "Operations" },
    { id: "deposit", label: "Deposit received", owner: "Finance" },
    { id: "eta", label: "Delivery dates confirmed", owner: "Procurement" },
  ],
  procurement: [
    { id: "po", label: "POs raised for all BOM items", owner: "Procurement" },
    { id: "long", label: "Long-lead items ordered", owner: "Procurement" },
    { id: "eta", label: "Delivery dates confirmed", owner: "Procurement" },
    { id: "recv", label: "Materials to start build received", owner: "Stores" },
  ],
  engineering: [
    { id: "draw", label: "Shop drawings issued", owner: "Engineering" },
    { id: "bom", label: "Bill of materials finalised", owner: "Engineering" },
    { id: "ctrl", label: "Controller spec confirmed", owner: "Controls" },
    { id: "approve", label: "Customer approved drawings", owner: "Project manager" },
    { id: "eta", label: "Delivery dates confirmed", owner: "Procurement" },
  ],
  build: [
    {
      id: "trades",
      label: "All trades complete & signed off",
      owner: "Workshop lead",
      auto: "trades",
    },
    { id: "walk", label: "Workshop QA walk-through done", owner: "Workshop lead" },
    { id: "eta", label: "Delivery dates confirmed", owner: "Procurement" },
  ],
  qa: [
    { id: "fat", label: "Factory acceptance test passed", owner: "QA" },
    { id: "cert", label: "Test certificates recorded", owner: "QA" },
    { id: "cust", label: "Customer acceptance (if req.)", owner: "Project manager" },
    { id: "eta", label: "Delivery dates confirmed", owner: "Procurement" },
  ],
  dispatch: [
    { id: "book", label: "Delivery booked", owner: "Logistics" },
    { id: "rig", label: "Packing / rigging plan done", owner: "Logistics" },
    { id: "access", label: "Site access confirmed", owner: "Project manager" },
    { id: "eta", label: "Delivery dates confirmed", owner: "Procurement" },
  ],
  commissioning: [
    { id: "comm", label: "On-site commissioning complete", owner: "Commissioning" },
    { id: "params", label: "Controller params verified", owner: "Controls" },
    { id: "signoff", label: "Customer sign-off obtained", owner: "Project manager" },
    { id: "oem", label: "O&M manuals & warranty handed over", owner: "Admin" },
  ],
  closed: [],
};

export const stageIndex = (key: ProjectStageKey): number => STAGE_KEYS.indexOf(key);

/** Builds the default trade structure (all not-started, nothing signed off). */
export function makeInitialTrades(): ProjectTrades {
  const out: ProjectTrades = {};

  for (const trade of TRADES) {
    out[trade.key] = {
      state: "not_started",
      blocked: false,
      reason: "",
      checklist: (CHECKLISTS[trade.key] ?? []).map((label) => ({ label, signoff: null })),
    };
  }

  return out;
}

// --- Safe accessors (defensive against partial cloud data) -----------------

export const getStage = (project: Project): ProjectStageKey => project.stage ?? DEFAULT_STAGE;

export const getDepartment = (project: Project): ProjectDepartment =>
  project.department ?? "install";

/**
 * Merges the project's stored trade progress onto the canonical trade +
 * checklist structure, so new checklist items appear on older projects.
 */
export function getTrades(project: Project): ProjectTrades {
  const trades = project.trades ?? {};
  const out: ProjectTrades = {};

  for (const trade of TRADES) {
    const existing = trades[trade.key];
    const checklistLabels = CHECKLISTS[trade.key] ?? [];

    out[trade.key] = {
      state: existing?.state ?? "not_started",
      blocked: existing?.blocked ?? false,
      reason: existing?.reason ?? "",
      checklist: checklistLabels.map((label, index) => ({
        label,
        signoff: existing?.checklist?.[index]?.signoff ?? null,
      })),
    };
  }

  return out;
}

export const getGates = (project: Project): ProjectGates => project.gates ?? {};

export const isProjectBlocked = (project: Project): boolean => project.blocked === true;

export const getStageTargets = (project: Project): ProjectStageTargets =>
  project.stageTargets ?? {};

/**
 * Completion target for a stage. The legacy single `targetDate` acts as the
 * current stage's target on projects created before per-stage targets.
 */
export function getStageTarget(project: Project, stage: ProjectStageKey): string | null {
  const fromTargets = getStageTargets(project)[stage];
  if (fromTargets !== undefined) return fromTargets;

  return stage === getStage(project) ? (project.targetDate ?? null) : null;
}

// --- Gate / progress logic (pure) ------------------------------------------

export const tradeDone = (trade: ProjectTrade): boolean =>
  !trade.blocked && (trade.state === "complete" || trade.state === "signed_off");

export function allTradesDone(project: Project): boolean {
  const trades = getTrades(project);
  return TRADES.every((trade) => tradeDone(trades[trade.key]));
}

export const checklistDone = (trade: ProjectTrade): number =>
  trade.checklist.filter((item) => item.signoff).length;

export const checklistPct = (trade: ProjectTrade): number =>
  trade.checklist.length === 0
    ? 0
    : Math.round((checklistDone(trade) / trade.checklist.length) * 100);

export function criterionMet(
  project: Project,
  stage: ProjectStageKey,
  criterion: ExitCriterion,
): boolean {
  if (criterion.auto === "trades") {
    return allTradesDone(project);
  }

  return Boolean(getGates(project)[stage]?.[criterion.id]);
}

/** Returns [signed, total] for a stage's exit criteria. */
export function gateProgress(
  project: Project,
  stage: ProjectStageKey = getStage(project),
): [number, number] {
  const criteria = EXIT_CRITERIA[stage] ?? [];
  return [criteria.filter((c) => criterionMet(project, stage, c)).length, criteria.length];
}

export function stageComplete(project: Project): boolean {
  const stage = getStage(project);
  return (EXIT_CRITERIA[stage] ?? []).every((c) => criterionMet(project, stage, c));
}

export function canDropOn(project: Project, targetKey: ProjectStageKey): boolean {
  const current = stageIndex(getStage(project));
  const target = stageIndex(targetKey);

  if (target === current) return false;
  if (target < current) return true;
  if (isProjectBlocked(project)) return false;

  return target === current + 1 && stageComplete(project);
}

// --- Activity log (pure) -----------------------------------------------------

export function makeActivityEntry(
  kind: ProjectActivityEntry["kind"],
  by: string,
  detail: Partial<Pick<ProjectActivityEntry, "field" | "from" | "to" | "note">> = {},
): ProjectActivityEntry {
  return {
    kind,
    field: detail.field ?? "",
    from: detail.from ?? "",
    to: detail.to ?? "",
    at: new Date().toISOString(),
    by,
    note: detail.note ?? "",
  };
}

/** Project-detail fields whose edits are recorded in the activity log. */
const AUDITED_FIELDS: ReadonlyArray<{
  key: "projectRef" | "customerName" | "location" | "department" | "value" | "description";
  label: string;
}> = [
  { key: "projectRef", label: "Reference" },
  { key: "customerName", label: "Customer / site" },
  { key: "location", label: "Location" },
  { key: "department", label: "Department" },
  { key: "value", label: "Contract value" },
  { key: "description", label: "Description" },
];

/** One "field" activity entry per audited detail that actually changed. */
export function diffProjectFields(
  project: Project,
  updates: Partial<Record<string, string | undefined>>,
  by: string,
): ProjectActivityEntry[] {
  const entries: ProjectActivityEntry[] = [];

  for (const { key, label } of AUDITED_FIELDS) {
    const next = updates[key];
    if (next === undefined) continue;

    const current = (project[key] ?? "").trim();
    if (next.trim() === current) continue;

    entries.push(makeActivityEntry("field", by, { field: label, from: current, to: next.trim() }));
  }

  return entries;
}

// --- Dates ------------------------------------------------------------------

export type DueTone = "good" | "warn" | "bad" | "mute";

export type DueStatus = {
  tone: DueTone;
  label: string;
  days: number | null;
};

/**
 * Countdown for the current stage's completion target ("Stage due" in the
 * UI — deliberately not called "target" there to avoid being read as the
 * delivery date).
 */
export function dueStatus(project: Project, now: number = Date.now()): DueStatus {
  const stage = getStage(project);

  if (stage === "closed") {
    return { tone: "mute", label: "Delivered", days: null };
  }

  const iso = getStageTarget(project, stage);
  const target = iso ? Date.parse(iso) : NaN;

  if (Number.isNaN(target)) {
    return { tone: "mute", label: "no date", days: null };
  }

  const days = Math.ceil((target - now) / 864e5);
  const tone: DueTone = days < 0 ? "bad" : days <= 7 ? "warn" : "good";
  const label = days < 0 ? `${-days}d overdue` : days === 0 ? "due today" : `${days}d left`;

  return { tone, label, days };
}

/**
 * Countdown to the customer delivery date — the #1 date on every project
 * until dispatch is complete, so it headlines the board card.
 */
export function deliveryStatus(project: Project, now: number = Date.now()): DueStatus {
  const stage = getStage(project);

  if (stage === "closed" || stage === "commissioning") {
    return { tone: "mute", label: "Delivered", days: null };
  }

  const delivery = project.deliveryDate ? Date.parse(project.deliveryDate) : NaN;

  if (Number.isNaN(delivery)) {
    return { tone: "mute", label: "not set", days: null };
  }

  const days = Math.ceil((delivery - now) / 864e5);
  const tone: DueTone = days < 0 ? "bad" : days <= 7 ? "warn" : "good";
  const label = days < 0 ? `${-days}d overdue` : days === 0 ? "due today" : `${days}d left`;

  return { tone, label, days };
}

export function stagePipelinePct(project: Project): number {
  return Math.round((stageIndex(getStage(project)) / (STAGES.length - 1)) * 100);
}

/**
 * Days the project has sat in its current stage — from the last stage move in
 * the activity log, falling back to creation for projects that never moved.
 */
export function stageAgeDays(project: Project, now: number = Date.now()): number | null {
  const log = project.activityLog ?? [];
  let since = project.createdAt;

  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i].kind === "stage") {
      since = log[i].at;
      break;
    }
  }

  const ms = Date.parse(since);
  if (Number.isNaN(ms)) return null;

  return Math.max(0, Math.floor((now - ms) / 864e5));
}

/** One-line human description of an activity entry. */
export function describeActivity(entry: ProjectActivityEntry): string {
  switch (entry.kind) {
    case "stage":
      return `Stage: ${entry.from || "—"} → ${entry.to || "—"}`;
    case "blocked":
      return entry.to === "blocked"
        ? `Blocked${entry.note ? ` — ${entry.note}` : ""}`
        : "Unblocked";
    default:
      return `${entry.field}: ${entry.from || "—"} → ${entry.to || "—"}`;
  }
}

// --- Money --------------------------------------------------------------------

/**
 * Parses a human contract-value string ("$186k", "1.2M", "186,000") into
 * whole dollars. Returns null when the string isn't a recognisable amount.
 */
export function parseMoney(input: string): number | null {
  const raw = input
    .trim()
    .toLowerCase()
    .replace(/aud/g, "")
    .replace(/[$,\s]/g, "");
  if (!raw) return null;

  const match = raw.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!match) return null;

  const multiplier = match[2] === "k" ? 1e3 : match[2] === "m" ? 1e6 : 1;
  return Math.round(parseFloat(match[1]) * multiplier);
}

/** Whole dollars → compact display ("$186k", "$1.2M"). */
export function formatMoney(amount: number): string {
  if (amount >= 1e6) {
    const millions = amount / 1e6;
    return `$${millions >= 10 || Number.isInteger(millions) ? Math.round(millions) : millions.toFixed(1)}M`;
  }
  if (amount >= 1e3) return `$${Math.round(amount / 1e3)}k`;
  return `$${amount}`;
}

/** Summable contract value — the numeric field, else parsed from the legacy string. */
export function getValueAmount(project: Project): number | null {
  if (typeof project.valueAmount === "number" && Number.isFinite(project.valueAmount)) {
    return project.valueAmount;
  }

  return parseMoney(project.value ?? "");
}

// --- Formatting -------------------------------------------------------------

export function formatDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";

  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";

  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";

  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Minutes → "12h 30m" (or "45m" under an hour). */
export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** ISO → yyyy-mm-dd for a native date input. */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";

  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";

  return new Date(ms).toISOString().slice(0, 10);
}

/** yyyy-mm-dd from a native date input → ISO string (or null when empty). */
export function fromDateInputValue(value: string): string | null {
  if (!value) return null;

  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
