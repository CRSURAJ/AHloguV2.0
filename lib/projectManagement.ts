import type {
  Project,
  ProjectDepartment,
  ProjectGates,
  ProjectStageKey,
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

  return target === current + 1 && stageComplete(project);
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
  if (getStage(project) === "closed") {
    return { tone: "mute", label: "Delivered", days: null };
  }

  const target = project.targetDate ? Date.parse(project.targetDate) : NaN;

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
