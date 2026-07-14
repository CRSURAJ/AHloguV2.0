import { getCloudProvider } from "@/lib/cloud/client";
import { DEFAULT_STAGE, makeInitialTrades, parseMoney, STAGE_KEYS } from "@/lib/projectManagement";
import type {
  Project,
  ProjectActivityEntry,
  ProjectActivityKind,
  ProjectDateLogEntry,
  ProjectDepartment,
  ProjectGates,
  ProjectSignOff,
  ProjectStageKey,
  ProjectStageTargets,
  ProjectTrade,
  ProjectTradeChecklistItem,
  ProjectTrades,
  TradeState,
} from "@/types/work";

const PROJECTS_STORAGE_KEY = "project_logu:projects";

export const PROJECTS_CHANGED_EVENT = "ahlogu:projects-changed";

export type CreateProjectInput = {
  projectRef: string;
  customerName: string;
  location?: string;
  description?: string;
  department?: ProjectDepartment;
  value?: string;
  valueAmount?: number | null;
  stage?: ProjectStageKey;
  blocked?: boolean;
  blockedReason?: string;
  targetDate?: string | null;
  deliveryDate?: string | null;
  stageTargets?: ProjectStageTargets;
  gates?: ProjectGates;
  trades?: ProjectTrades;
  dateLog?: ProjectDateLogEntry[];
  activityLog?: ProjectActivityEntry[];
};

export type UpdateProjectInput = Partial<CreateProjectInput>;

function getCloud() {
  return getCloudProvider();
}

function shouldUseAwsProjects(): boolean {
  return getCloud().providerName === "aws";
}

const CLOUD_PROJECTS_REFRESH_MS = 15_000;
let cachedCloudProjects: Project[] | null = null;
let cachedCloudProjectsAt = 0;
let inFlightCloudProjects: Promise<Project[]> | null = null;

async function listCloudProjectsWithGuard(): Promise<Project[]> {
  const now = Date.now();

  if (cachedCloudProjects && now - cachedCloudProjectsAt < CLOUD_PROJECTS_REFRESH_MS) {
    return cachedCloudProjects;
  }

  if (inFlightCloudProjects) {
    return inFlightCloudProjects;
  }

  inFlightCloudProjects = getCloud()
    .projects.list()
    .then((projects) => {
      cachedCloudProjects = projects;
      cachedCloudProjectsAt = Date.now();
      return projects;
    })
    .finally(() => {
      inFlightCloudProjects = null;
    });

  return inFlightCloudProjects;
}

export function clearCloudProjectsCache(): void {
  cachedCloudProjects = null;
  cachedCloudProjectsAt = 0;
  inFlightCloudProjects = null;
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanDate(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : value;
}

const TRADE_STATES = new Set<TradeState>(["not_started", "in_progress", "complete", "signed_off"]);

function cleanStage(value: unknown): ProjectStageKey {
  return typeof value === "string" && (STAGE_KEYS as readonly string[]).includes(value)
    ? (value as ProjectStageKey)
    : DEFAULT_STAGE;
}

function cleanDepartment(value: unknown): ProjectDepartment {
  return value === "install" || value === "service" ? value : "install";
}

function cleanValueAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function cleanNullableDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;

  return Number.isNaN(Date.parse(value)) ? null : value;
}

function cleanSignOff(value: unknown): ProjectSignOff | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<ProjectSignOff>;
  const by = cleanString(item.by);

  if (!by) return null;

  const signoff: ProjectSignOff = {
    by,
    at: cleanDate(item.at, new Date().toISOString()),
    comment: cleanString(item.comment),
  };

  const documentUrl = cleanString(item.documentUrl);
  const documentTitle = cleanString(item.documentTitle);

  if (documentUrl) signoff.documentUrl = documentUrl;
  if (documentTitle) signoff.documentTitle = documentTitle;

  return signoff;
}

function cleanTrades(value: unknown): ProjectTrades {
  if (!value || typeof value !== "object") return makeInitialTrades();

  const source = value as Record<string, unknown>;
  const out: ProjectTrades = {};

  for (const [key, rawTrade] of Object.entries(source)) {
    if (!rawTrade || typeof rawTrade !== "object") continue;

    const trade = rawTrade as Partial<ProjectTrade>;
    const checklist: ProjectTradeChecklistItem[] = Array.isArray(trade.checklist)
      ? trade.checklist
          .map((entry): ProjectTradeChecklistItem | null => {
            if (!entry || typeof entry !== "object") return null;

            const label = cleanString((entry as { label?: unknown }).label);
            if (!label) return null;

            return { label, signoff: cleanSignOff((entry as { signoff?: unknown }).signoff) };
          })
          .filter((entry): entry is ProjectTradeChecklistItem => entry !== null)
      : [];

    const state =
      typeof trade.state === "string" && TRADE_STATES.has(trade.state as TradeState)
        ? (trade.state as TradeState)
        : "not_started";

    out[key] = {
      state,
      blocked: trade.blocked === true,
      reason: cleanString(trade.reason),
      checklist,
    };
  }

  return out;
}

function cleanGates(value: unknown): ProjectGates {
  if (!value || typeof value !== "object") return {};

  const source = value as Record<string, unknown>;
  const out: ProjectGates = {};

  for (const [stageKey, rawCriteria] of Object.entries(source)) {
    if (!rawCriteria || typeof rawCriteria !== "object") continue;

    const criteria = rawCriteria as Record<string, unknown>;
    const stageGate: Record<string, ProjectSignOff | null> = {};

    for (const [criterionId, rawSignOff] of Object.entries(criteria)) {
      stageGate[criterionId] = cleanSignOff(rawSignOff);
    }

    out[stageKey] = stageGate;
  }

  return out;
}

function cleanDateLog(value: unknown): ProjectDateLogEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): ProjectDateLogEntry | null => {
      if (!entry || typeof entry !== "object") return null;

      const item = entry as Partial<ProjectDateLogEntry>;
      const field =
        item.field === "delivery" ? "delivery" : item.field === "target" ? "target" : null;
      const to = cleanString(item.to);

      if (!field || !to) return null;

      const out: ProjectDateLogEntry = {
        field,
        from: typeof item.from === "string" && item.from ? item.from : null,
        to,
        at: cleanDate(item.at, new Date().toISOString()),
        by: cleanString(item.by),
        reason: cleanString(item.reason),
      };

      if (
        typeof item.stage === "string" &&
        (STAGE_KEYS as readonly string[]).includes(item.stage)
      ) {
        out.stage = item.stage;
      }

      return out;
    })
    .filter((entry): entry is ProjectDateLogEntry => entry !== null);
}

const ACTIVITY_KINDS = new Set<ProjectActivityKind>(["stage", "field", "blocked"]);

function cleanActivityLog(value: unknown): ProjectActivityEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): ProjectActivityEntry | null => {
      if (!entry || typeof entry !== "object") return null;

      const item = entry as Partial<ProjectActivityEntry>;
      if (typeof item.kind !== "string" || !ACTIVITY_KINDS.has(item.kind as ProjectActivityKind)) {
        return null;
      }

      return {
        kind: item.kind as ProjectActivityKind,
        field: cleanString(item.field),
        from: cleanString(item.from),
        to: cleanString(item.to),
        at: cleanDate(item.at, new Date().toISOString()),
        by: cleanString(item.by),
        note: cleanString(item.note),
      };
    })
    .filter((entry): entry is ProjectActivityEntry => entry !== null);
}

function cleanStageTargets(value: unknown): ProjectStageTargets {
  if (!value || typeof value !== "object") return {};

  const out: ProjectStageTargets = {};

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!(STAGE_KEYS as readonly string[]).includes(key)) continue;
    out[key as ProjectStageKey] = cleanNullableDate(raw);
  }

  return out;
}

function normalizeProject(value: unknown, index: number): Project | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<Project>;
  const now = new Date().toISOString();

  const id = cleanString(item.id) || makeId(`project-${index}`);
  const createdAt = cleanDate(item.createdAt, now);
  const updatedAt = cleanDate(item.updatedAt, createdAt);

  return {
    id,
    projectRef: cleanString(item.projectRef),
    customerName: cleanString(item.customerName),
    location: cleanString(item.location),
    description: cleanString(item.description),
    department: cleanDepartment(item.department),
    value: cleanString(item.value),
    valueAmount: cleanValueAmount(item.valueAmount) ?? parseMoney(cleanString(item.value)),
    stage: cleanStage(item.stage),
    gates: cleanGates(item.gates),
    trades: cleanTrades(item.trades),
    blocked: item.blocked === true,
    blockedReason: cleanString(item.blockedReason),
    targetDate: cleanNullableDate(item.targetDate),
    deliveryDate: cleanNullableDate(item.deliveryDate),
    stageTargets: cleanStageTargets(item.stageTargets),
    dateLog: cleanDateLog(item.dateLog),
    activityLog: cleanActivityLog(item.activityLog),
    isArchived: item.isArchived === true ? true : undefined,
    createdAt,
    updatedAt,
  };
}

async function loadLocalProjects(): Promise<Project[]> {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
  const parsed = parseJson<unknown[]>(raw);

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map(normalizeProject)
    .filter((project): project is Project => project !== null)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function loadProjects(): Promise<Project[]> {
  const localProjects = await loadLocalProjects();

  if (!shouldUseAwsProjects()) {
    return localProjects;
  }

  try {
    const cloudProjects = await listCloudProjectsWithGuard();
    const normalized = cloudProjects
      .map(normalizeProject)
      .filter((project): project is Project => project !== null);

    await saveProjects(normalized, { notify: false });

    return normalized;
  } catch (error) {
    console.warn("Could not load AWS projects. Using local project cache.", error);
    return localProjects;
  }
}

type SaveProjectsOptions = {
  notify?: boolean;
};

export async function saveProjects(
  projects: Project[],
  options: SaveProjectsOptions = {},
): Promise<void> {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));

  if (options.notify === false) return;

  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const projects = await loadProjects();
  const now = new Date().toISOString();

  const project: Project = {
    id: makeId("project"),
    projectRef: input.projectRef.trim(),
    customerName: input.customerName.trim(),
    location: input.location?.trim() ?? "",
    description: input.description?.trim() ?? "",
    department: input.department ?? "install",
    value: input.value?.trim() ?? "",
    valueAmount:
      input.valueAmount !== undefined ? input.valueAmount : parseMoney(input.value ?? ""),
    stage: input.stage ?? DEFAULT_STAGE,
    gates: input.gates ?? {},
    trades: input.trades ?? makeInitialTrades(),
    blocked: input.blocked === true,
    blockedReason: input.blockedReason?.trim() ?? "",
    targetDate: input.targetDate ?? null,
    deliveryDate: input.deliveryDate ?? null,
    stageTargets: input.stageTargets ?? {},
    dateLog: input.dateLog ?? [],
    activityLog: input.activityLog ?? [],
    createdAt: now,
    updatedAt: now,
  };

  if (shouldUseAwsProjects()) {
    const result = await getCloud().projects.create(project);

    if (!result.ok) {
      throw new Error(result.message || "Could not create project in AWS.");
    }

    if (result.cloudId) {
      project.id = result.cloudId;
    }

    clearCloudProjectsCache();
  }

  await saveProjects([project, ...projects.filter((item) => item.id !== project.id)]);

  return project;
}

export async function updateProject(
  id: string,
  updates: UpdateProjectInput,
): Promise<Project | null> {
  const projects = await loadProjects();
  const existingProject = projects.find((project) => project.id === id);

  if (!existingProject) return null;

  const updatedProject: Project = {
    ...existingProject,
    projectRef: updates.projectRef?.trim() ?? existingProject.projectRef,
    customerName: updates.customerName?.trim() ?? existingProject.customerName,
    location: updates.location?.trim() ?? existingProject.location,
    description: updates.description?.trim() ?? existingProject.description,
    department: updates.department ?? existingProject.department,
    value: updates.value?.trim() ?? existingProject.value,
    valueAmount:
      updates.valueAmount !== undefined
        ? updates.valueAmount
        : updates.value !== undefined
          ? parseMoney(updates.value)
          : existingProject.valueAmount,
    stage: updates.stage ?? existingProject.stage,
    gates: updates.gates ?? existingProject.gates,
    trades: updates.trades ?? existingProject.trades,
    blocked: updates.blocked !== undefined ? updates.blocked : existingProject.blocked,
    blockedReason:
      updates.blockedReason !== undefined
        ? updates.blockedReason.trim()
        : existingProject.blockedReason,
    targetDate: updates.targetDate !== undefined ? updates.targetDate : existingProject.targetDate,
    deliveryDate:
      updates.deliveryDate !== undefined ? updates.deliveryDate : existingProject.deliveryDate,
    stageTargets: updates.stageTargets ?? existingProject.stageTargets,
    dateLog: updates.dateLog ?? existingProject.dateLog,
    activityLog: updates.activityLog ?? existingProject.activityLog,
    updatedAt: new Date().toISOString(),
  };

  if (shouldUseAwsProjects()) {
    const result = await getCloud().projects.update(updatedProject);

    if (!result.ok) {
      throw new Error(result.message || "Could not update project in AWS.");
    }

    clearCloudProjectsCache();
  }

  await saveProjects(projects.map((project) => (project.id === id ? updatedProject : project)));

  return updatedProject;
}

export async function deleteProject(id: string): Promise<void> {
  const projects = await loadProjects();

  if (shouldUseAwsProjects()) {
    const result = await getCloud().projects.delete(id);

    if (!result.ok) {
      throw new Error(result.message || "Could not delete project in AWS.");
    }

    clearCloudProjectsCache();
  }

  await saveProjects(projects.filter((project) => project.id !== id));
}
