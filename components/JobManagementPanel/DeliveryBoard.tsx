"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Briefcase, Calendar, Lock, Plus, ShieldCheck, Truck } from "lucide-react";

import { getCloudProvider } from "@/lib/cloud/client";
import {
  canDropOn,
  deliveryStatus,
  DEPARTMENT_OPTIONS,
  diffProjectFields,
  dueStatus,
  formatDate,
  formatMinutes,
  fromDateInputValue,
  gateProgress,
  getStage,
  getStageTarget,
  getStageTargets,
  getTrades,
  isProjectBlocked,
  makeActivityEntry,
  stageComplete,
  stageIndex,
  STAGES,
  toDateInputValue,
  TRADES,
} from "@/lib/projectManagement";
import type { CreateProjectInput, UpdateProjectInput } from "@/lib/projectStorage";
import type {
  AuthActionResult,
  Job,
  Project,
  ProjectDateField,
  ProjectDepartment,
  ProjectSignOff,
  ProjectStageKey,
  ProjectTrades,
  TradeState,
} from "@/types/work";

import ProjectDrawer from "./ProjectDrawer";
import styles from "./deliveryBoard.module.css";

type DeliveryBoardProps = {
  projects: Project[];
  jobs: Job[];
  isLoadingProjects: boolean;
  currentUserName: string;
  canDeleteProjects: boolean;
  /** Opens this project's drawer on mount (jump-in from BaajBoard). */
  initialSelectedProjectId?: string | null;
  /** History section to expand in that drawer ("activity" | "dates"). */
  initialDrawerFocus?: "activity" | "dates" | null;
  onCreateProject: (input: CreateProjectInput) => Promise<AuthActionResult>;
  onUpdateProject: (id: string, updates: UpdateProjectInput) => Promise<AuthActionResult>;
  onDeleteProject: (id: string) => Promise<AuthActionResult>;
  onCreateJobForProject: (project: Project) => void;
  onEditJob: (job: Job) => void;
};

type DeptFilter = "all" | ProjectDepartment;

type ProjectFormState = {
  projectRef: string;
  customerName: string;
  location: string;
  department: ProjectDepartment;
  value: string;
  targetDate: string;
};

const EMPTY_PROJECT_FORM: ProjectFormState = {
  projectRef: "",
  customerName: "",
  location: "",
  department: "install",
  value: "",
  targetDate: "",
};

/** How many stage columns are visible at once — Handover → QA/FAT by default. */
const VISIBLE_STAGE_COUNT = 5;
const MAX_STAGE_OFFSET = STAGES.length - VISIBLE_STAGE_COUNT;

const STATE_COLORS: Record<TradeState, { bg: string; fg: string; label: string }> = {
  not_started: { bg: "var(--col)", fg: "var(--muted)", label: "Not started" },
  in_progress: { bg: "var(--warn-soft)", fg: "var(--warn)", label: "In progress" },
  complete: { bg: "var(--ok-soft)", fg: "var(--ok)", label: "Complete" },
  signed_off: { bg: "var(--ok-soft)", fg: "var(--ok)", label: "Signed off" },
};

function toneClass(tone: string): string {
  switch (tone) {
    case "good":
      return styles.toneGood;
    case "warn":
      return styles.toneWarn;
    case "bad":
      return styles.toneBad;
    default:
      return styles.toneMute;
  }
}

/**
 * Brand "jet arrow" — swept arrowhead with a notched back and an echo
 * chevron, drawn in the AHlogu greens. Mirrored for the left direction.
 */
function JetArrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 120 64"
      width={62}
      height={33}
      aria-hidden
      style={direction === "left" ? { transform: "scaleX(-1)" } : undefined}
    >
      {/* echo chevron */}
      <path d="M38 8 L70 32 L38 56 L52 32 Z" fill="#3ea978" opacity="0.55" />
      {/* tail spike */}
      <path
        d="M2 32 L78 25 L78 39 Z"
        fill="#53bc7b"
        stroke="#072c29"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* arrowhead with notched back */}
      <path
        d="M118 32 L56 5 L76 32 L56 59 Z"
        fill="#53bc7b"
        stroke="#072c29"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BoardCard({
  project,
  jobCount,
  loggedMinutes,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  project: Project;
  jobCount: number;
  loggedMinutes: number;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const stage = getStage(project);
  const stageIdx = stageIndex(stage);
  const isBuild = stage === "build";
  const trades = getTrades(project);
  const anyBlocked = TRADES.some((t) => trades[t.key]?.blocked);
  const projectBlocked = isProjectBlocked(project);
  const stageTarget = getStageTarget(project, stage);
  const [gd, gt] = gateProgress(project);
  const ready = gt > 0 && gd === gt;
  const status = dueStatus(project);
  const delivery = deliveryStatus(project);

  return (
    <div
      className={`${styles.card} ${dragging ? styles.dragging : ""}`}
      draggable
      onClick={onOpen}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", project.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className={styles.cardTop}>
        <div style={{ minWidth: 0 }}>
          <div className={styles.cust}>{project.customerName || "Untitled project"}</div>
          <div className={`${styles.ref} ${styles.mono}`}>{project.projectRef || "—"}</div>
        </div>
        {/* Delivery is the #1 date on every project until dispatch is done —
            it headlines the card, days countdown right underneath. */}
        <div className={styles.deliveryBlock}>
          <span className={styles.deliveryLabel}>
            <Truck size={10} /> Delivery
          </span>
          <span className={`${styles.deliveryDate} ${toneClass(delivery.tone)}`}>
            {project.deliveryDate ? formatDate(project.deliveryDate) : "—"}
          </span>
          <span className={`${styles.dchip} ${toneClass(delivery.tone)}`}>{delivery.label}</span>
        </div>
      </div>

      {isBuild ? (
        <div className={styles.gauge}>
          {TRADES.map((t) => {
            const trade = trades[t.key];
            const color = trade.blocked
              ? { bg: "var(--danger-soft)", fg: "var(--danger)" }
              : STATE_COLORS[trade.state];
            const title = `${t.label}: ${trade.blocked ? "Blocked" : STATE_COLORS[trade.state].label}`;
            return (
              <div
                className={styles.g}
                key={t.key}
                style={{ background: color.bg, color: color.fg }}
                title={title}
              >
                {t.short}
              </div>
            );
          })}
        </div>
      ) : null}

      {projectBlocked ? (
        <div className={styles.blockflag} title={project.blockedReason || undefined}>
          <AlertTriangle size={12} /> Blocked
          {project.blockedReason ? ` — ${project.blockedReason}` : ""}
        </div>
      ) : null}

      {isBuild && anyBlocked ? (
        <div className={styles.blockflag}>
          <AlertTriangle size={12} /> Trade blocked
        </div>
      ) : null}

      {gt > 0 ? (
        <div className={`${styles.cardgate} ${ready ? styles.ok : ""}`}>
          {ready ? <ShieldCheck size={12} /> : <Lock size={12} />} Progress {gd}/{gt}
          {ready ? " · ready" : ""}
        </div>
      ) : null}

      {jobCount > 0 ? (
        <div className={`${styles.cardgate}`}>
          <Briefcase size={12} /> {jobCount} job{jobCount === 1 ? "" : "s"}
          {loggedMinutes > 0 ? ` · ${formatMinutes(loggedMinutes)} logged` : ""}
        </div>
      ) : null}

      <div className={`${styles.due} ${toneClass(status.tone)}`}>
        <Calendar size={12} /> Stage due {stageTarget ? formatDate(stageTarget) : "—"}
        {status.days !== null ? (
          <span className={`${styles.dchip} ${toneClass(status.tone)}`}>{status.label}</span>
        ) : null}
      </div>

      <div className={styles.foot}>
        <span className={`${styles.val} ${styles.mono}`}>{project.value || "—"}</span>
        <span className={`${styles.dept} ${styles[project.department]}`}>{project.department}</span>
      </div>
      {/* Segmented stage indicator — one tick per pipeline stage, matching
          the drawer's stepper. Reads clearly even at stage 1 of 8. */}
      <div className={styles.cardSteps} title={`Stage: ${STAGES[stageIdx].label}`}>
        {STAGES.map((s, i) => (
          <span
            key={s.key}
            className={`${styles.cs} ${i < stageIdx ? styles.csDone : i === stageIdx ? styles.csCur : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

function ProjectDialog({
  title,
  submitLabel,
  initial,
  canDelete,
  onSubmit,
  onDelete,
  onClose,
}: {
  title: string;
  submitLabel: string;
  initial: ProjectFormState;
  canDelete: boolean;
  onSubmit: (form: ProjectFormState) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ProjectFormState>(initial);
  const canSubmit = form.projectRef.trim() !== "" && form.customerName.trim() !== "";

  const set = <K extends keyof ProjectFormState>(key: K, value: ProjectFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className={styles.dialogBackdrop}>
      <form
        className={styles.dialog}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit(form);
        }}
      >
        <h3 className={styles.dialogTitle}>{title}</h3>

        <label className={styles.dialogField}>
          <span>Customer / Site</span>
          <input
            autoFocus
            value={form.customerName}
            onChange={(event) => set("customerName", event.target.value)}
            placeholder="e.g. Brunswick Baths"
          />
        </label>

        <label className={styles.dialogField}>
          <span>Project Reference</span>
          <input
            value={form.projectRef}
            onChange={(event) => set("projectRef", event.target.value)}
            placeholder="e.g. AH-1088"
          />
        </label>

        <label className={styles.dialogField}>
          <span>Location</span>
          <input
            value={form.location}
            onChange={(event) => set("location", event.target.value)}
            placeholder="Site address / suburb"
          />
        </label>

        <div className={styles.dialogRow}>
          <label className={styles.dialogField}>
            <span>Department</span>
            <select
              value={form.department}
              onChange={(event) => set("department", event.target.value as ProjectDepartment)}
            >
              {DEPARTMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.dialogField}>
            <span>Contract Value</span>
            <input
              value={form.value}
              onChange={(event) => set("value", event.target.value)}
              placeholder="e.g. $186k"
            />
          </label>
        </div>

        <label className={styles.dialogField}>
          <span>Stage Due Date (current stage completion)</span>
          <input
            type="date"
            value={form.targetDate}
            onChange={(event) => set("targetDate", event.target.value)}
          />
        </label>

        <div className={styles.dialogActions}>
          {canDelete && onDelete ? (
            <button type="button" className={`${styles.b} ${styles.warn}`} onClick={onDelete}>
              Delete project
            </button>
          ) : null}
          <div style={{ flex: 1 }} />
          <button type="button" className={styles.ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.primary} disabled={!canSubmit}>
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function DeliveryBoard({
  projects,
  jobs,
  isLoadingProjects,
  currentUserName,
  canDeleteProjects,
  initialSelectedProjectId = null,
  initialDrawerFocus = null,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onCreateJobForProject,
  onEditJob,
}: DeliveryBoardProps) {
  const [filter, setFilter] = useState<DeptFilter>("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(initialSelectedProjectId);
  // Applies only to the jump-in selection; cleared when a card is opened by hand.
  const [drawerFocus, setDrawerFocus] = useState<"activity" | "dates" | null>(initialDrawerFocus);
  const [openTrade, setOpenTrade] = useState("plumbing");
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const [minutesByJobId, setMinutesByJobId] = useState<Record<string, number>>({});
  const [stageOffset, setStageOffset] = useState(0);
  // Throttles auto-paging while a card is dragged over a nav arrow.
  const lastAutoPageAtRef = useRef(0);

  const visibleStages = STAGES.slice(stageOffset, stageOffset + VISIBLE_STAGE_COUNT);
  const atStart = stageOffset === 0;
  const atEnd = stageOffset === MAX_STAGE_OFFSET;

  // One press jumps the window: right → show the remaining stages up to
  // Closed; left → back to the start (Handover → QA/FAT).
  const jumpStages = (dir: -1 | 1) => {
    setStageOffset(dir === 1 ? MAX_STAGE_OFFSET : 0);
  };

  const autoJumpStages = (dir: -1 | 1) => {
    const now = Date.now();
    if (now - lastAutoPageAtRef.current < 600) return;
    lastAutoPageAtRef.current = now;
    jumpStages(dir);
  };

  // Pull synced work logs once so projects can show real labour hours from
  // the time-tracking side of the app. Failure is fine (offline) — hours
  // simply show as 0m until the next successful load.
  useEffect(() => {
    let cancelled = false;

    getCloudProvider()
      .workLogs.list()
      .then((logs) => {
        if (cancelled) return;

        const totals: Record<string, number> = {};
        for (const log of logs) {
          if (!log.jobId) continue;
          totals[log.jobId] = (totals[log.jobId] ?? 0) + (log.workedMinutes || 0);
        }
        setMinutesByJobId(totals);
      })
      .catch(() => {
        /* offline or unauthorized — hours stay empty */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(
    () => projects.filter((project) => filter === "all" || project.department === filter),
    [projects, filter],
  );

  const jobsByProjectId = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of jobs) {
      if (!job.projectId) continue;
      const list = map.get(job.projectId) ?? [];
      list.push(job);
      map.set(job.projectId, list);
    }
    return map;
  }, [jobs]);

  const sel = projects.find((project) => project.id === selId) ?? null;
  const dragging = projects.find((project) => project.id === dragId) ?? null;

  const flash = (message: string) => {
    setFlashMsg(message);
    window.setTimeout(() => setFlashMsg(null), 3200);
  };

  const persist = async (id: string, updates: UpdateProjectInput) => {
    const result = await onUpdateProject(id, updates);
    if (!result.ok) flash(result.message || "Could not save change.");
  };

  const updateGates = (project: Project, mutate: (gates: Project["gates"]) => void) => {
    const gates = structuredClone(project.gates ?? {});
    mutate(gates);
    void persist(project.id, { gates });
  };

  const updateTrades = (project: Project, mutate: (trades: ProjectTrades) => void) => {
    const trades = getTrades(project);
    mutate(trades);
    void persist(project.id, { trades });
  };

  const signCriterion = (
    project: Project,
    stage: ProjectStageKey,
    criterionId: string,
    signoff: ProjectSignOff,
  ) => {
    updateGates(project, (gates) => {
      (gates[stage] ??= {})[criterionId] = signoff;
    });
  };

  const unsignCriterion = (project: Project, stage: ProjectStageKey, criterionId: string) => {
    updateGates(project, (gates) => {
      (gates[stage] ??= {})[criterionId] = null;
    });
  };

  const signSub = (project: Project, tradeKey: string, index: number, signoff: ProjectSignOff) => {
    updateTrades(project, (trades) => {
      const trade = trades[tradeKey];
      if (!trade?.checklist[index]) return;
      trade.checklist[index].signoff = signoff;
      if (trade.state === "not_started") trade.state = "in_progress";
    });
  };

  const unsignSub = (project: Project, tradeKey: string, index: number) => {
    updateTrades(project, (trades) => {
      const trade = trades[tradeKey];
      if (trade?.checklist[index]) trade.checklist[index].signoff = null;
    });
  };

  const setTradeState = (project: Project, tradeKey: string, state: TradeState) => {
    updateTrades(project, (trades) => {
      if (trades[tradeKey]) trades[tradeKey].state = state;
    });
  };

  const setBlocked = (project: Project, tradeKey: string, blocked: boolean) => {
    updateTrades(project, (trades) => {
      const trade = trades[tradeKey];
      if (!trade) return;
      trade.blocked = blocked;
      if (!blocked) trade.reason = "";
    });
  };

  const setReason = (project: Project, tradeKey: string, reason: string) => {
    updateTrades(project, (trades) => {
      if (trades[tradeKey]) trades[tradeKey].reason = reason;
    });
  };

  const withActivity = (project: Project, entry: ReturnType<typeof makeActivityEntry>) => [
    ...(project.activityLog ?? []),
    entry,
  ];

  /**
   * Moves the project and rolls `targetDate` to the destination stage's
   * target, preserving the outgoing stage's target in `stageTargets`.
   */
  const applyStageMove = (project: Project, targetKey: ProjectStageKey) => {
    const fromStage = getStage(project);
    const stageTargets = {
      ...getStageTargets(project),
      [fromStage]: getStageTarget(project, fromStage),
    };

    void persist(project.id, {
      stage: targetKey,
      stageTargets,
      targetDate: stageTargets[targetKey] ?? null,
      activityLog: withActivity(
        project,
        makeActivityEntry("stage", currentUserName, {
          from: STAGES[stageIndex(fromStage)].label,
          to: STAGES[stageIndex(targetKey)].label,
        }),
      ),
    });
  };

  const moveStage = (project: Project, dir: -1 | 1) => {
    const current = stageIndex(getStage(project));
    const next = current + dir;
    if (next < 0 || next >= STAGES.length) return;
    if (dir > 0 && isProjectBlocked(project)) {
      flash("Project is blocked — unblock it before advancing.");
      return;
    }
    if (dir > 0 && !stageComplete(project)) return;
    applyStageMove(project, STAGES[next].key);
  };

  const setProjectBlocked = (project: Project, blocked: boolean, reason: string) => {
    void persist(project.id, {
      blocked,
      blockedReason: blocked ? reason : "",
      activityLog: withActivity(
        project,
        makeActivityEntry("blocked", currentUserName, {
          from: isProjectBlocked(project) ? "blocked" : "active",
          to: blocked ? "blocked" : "active",
          note: blocked ? reason : "",
        }),
      ),
    });
  };

  const commitDate = (
    project: Project,
    field: ProjectDateField,
    toIso: string | null,
    reason: string,
    stage?: ProjectStageKey,
  ) => {
    const targetStage = stage ?? getStage(project);
    const from = field === "target" ? getStageTarget(project, targetStage) : project.deliveryDate;
    const dateLog = toIso
      ? [
          ...(project.dateLog ?? []),
          {
            field,
            ...(field === "target" ? { stage: targetStage } : {}),
            from,
            to: toIso,
            at: new Date().toISOString(),
            by: currentUserName,
            reason,
          },
        ]
      : (project.dateLog ?? []);

    const dateUpdate: UpdateProjectInput =
      field === "target"
        ? {
            stageTargets: { ...getStageTargets(project), [targetStage]: toIso },
            ...(targetStage === getStage(project) ? { targetDate: toIso } : {}),
          }
        : { deliveryDate: toIso };

    void persist(project.id, { ...dateUpdate, dateLog });
  };

  const handleDrop = (targetKey: ProjectStageKey) => {
    const project = projects.find((item) => item.id === dragId) ?? null;
    setDragId(null);
    if (!project) return;

    const current = stageIndex(getStage(project));
    const target = stageIndex(targetKey);
    if (target === current) return;

    if (target > current) {
      if (target !== current + 1) {
        flash("Projects move one stage at a time — you can't skip a step.");
        return;
      }
      if (isProjectBlocked(project)) {
        flash("Project is blocked — unblock it before advancing.");
        return;
      }
      if (!stageComplete(project)) {
        flash(`Not complete — sign off all ${STAGES[current].label} steps first.`);
        return;
      }
    }

    applyStageMove(project, targetKey);
  };

  const submitCreate = async (form: ProjectFormState) => {
    const result = await onCreateProject({
      projectRef: form.projectRef,
      customerName: form.customerName,
      location: form.location,
      department: form.department,
      value: form.value,
      targetDate: fromDateInputValue(form.targetDate),
    });

    if (!result.ok) {
      flash(result.message || "Could not create project.");
      return;
    }

    setDialog(null);
  };

  const submitEdit = async (form: ProjectFormState) => {
    if (!sel) return;

    const details = {
      projectRef: form.projectRef,
      customerName: form.customerName,
      location: form.location,
      department: form.department,
      value: form.value,
    };
    const activityEntries = diffProjectFields(sel, details, currentUserName);
    const targetIso = fromDateInputValue(form.targetDate);

    const result = await onUpdateProject(sel.id, {
      ...details,
      targetDate: targetIso,
      stageTargets: { ...getStageTargets(sel), [getStage(sel)]: targetIso },
      ...(activityEntries.length > 0
        ? { activityLog: [...(sel.activityLog ?? []), ...activityEntries] }
        : {}),
    });

    if (!result.ok) {
      flash(result.message || "Could not update project.");
      return;
    }

    setDialog(null);
  };

  const submitDelete = async () => {
    if (!sel) return;

    const linked = jobsByProjectId.get(sel.id)?.length ?? 0;
    const confirmed = window.confirm(
      `Delete project "${sel.customerName || sel.projectRef}"?` +
        (linked > 0 ? ` ${linked} linked job(s) will be kept but unlinked.` : ""),
    );

    if (!confirmed) return;

    const result = await onDeleteProject(sel.id);

    if (!result.ok) {
      flash(result.message || "Could not delete project.");
      return;
    }

    setDialog(null);
    setSelId(null);
  };

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.seg}>
          {(["all", "install", "service"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? styles.on : ""}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <div className={styles.spacer} />
        <span className={styles.stageRange}>
          {visibleStages[0].label} → {visibleStages[visibleStages.length - 1].label}
        </span>
        <button type="button" className={styles.primary} onClick={() => setDialog("create")}>
          <Plus size={15} /> New project
        </button>
      </div>

      <div className={styles.boardWrap}>
        {!atStart ? (
          <button
            type="button"
            className={`${styles.navArrow} ${styles.navArrowLeft}`}
            aria-label="Back to earlier stages"
            title="Back to earlier stages"
            onClick={() => jumpStages(-1)}
            onDragOver={(event) => {
              event.preventDefault();
              autoJumpStages(-1);
            }}
          >
            <JetArrow direction="left" />
          </button>
        ) : null}

        <div className={styles.board}>
          {visibleStages.map((stageDef) => {
            const list = shown.filter((project) => getStage(project) === stageDef.key);
            const droppable = dragging ? canDropOn(dragging, stageDef.key) : false;
            const columnClass = [
              styles.column,
              dragging
                ? droppable
                  ? styles.dropOk
                  : getStage(dragging) === stageDef.key
                    ? ""
                    : styles.dropNo
                : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                className={columnClass}
                key={stageDef.key}
                onDragOver={(event) => {
                  if (droppable) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDrop(stageDef.key);
                }}
              >
                <div className={styles.colhead}>
                  <span className={styles.lbl}>{stageDef.label}</span>
                  <span className={styles.cnt}>{list.length}</span>
                </div>
                <div className={styles.cards}>
                  {list.length === 0 ? (
                    <div className={styles.emptyCol}>
                      {isLoadingProjects ? "Loading…" : "No projects"}
                    </div>
                  ) : (
                    list.map((project) => {
                      const linked = jobsByProjectId.get(project.id) ?? [];
                      const loggedMinutes = linked.reduce(
                        (sum, job) => sum + (minutesByJobId[job.jobId] ?? 0),
                        0,
                      );
                      return (
                        <BoardCard
                          key={project.id}
                          project={project}
                          jobCount={linked.length}
                          loggedMinutes={loggedMinutes}
                          dragging={project.id === dragId}
                          onOpen={() => {
                            setSelId(project.id);
                            setDrawerFocus(null);
                            setOpenTrade("plumbing");
                          }}
                          onDragStart={() => setDragId(project.id)}
                          onDragEnd={() => setDragId(null)}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!atEnd ? (
          <button
            type="button"
            className={`${styles.navArrow} ${styles.navArrowRight}`}
            aria-label="Show remaining stages"
            title="Show remaining stages"
            onClick={() => jumpStages(1)}
            onDragOver={(event) => {
              event.preventDefault();
              autoJumpStages(1);
            }}
          >
            <JetArrow direction="right" />
          </button>
        ) : null}
      </div>

      {sel ? (
        <ProjectDrawer
          key={`${sel.id}-${getStage(sel)}`}
          project={sel}
          linkedJobs={jobsByProjectId.get(sel.id) ?? []}
          minutesByJobId={minutesByJobId}
          currentUserName={currentUserName}
          initialFocus={drawerFocus}
          openTrade={openTrade}
          setOpenTrade={setOpenTrade}
          onClose={() => setSelId(null)}
          onEditDetails={() => setDialog("edit")}
          onCreateJob={() => onCreateJobForProject(sel)}
          onEditJob={onEditJob}
          onMoveStage={(dir) => moveStage(sel, dir)}
          onSignCriterion={(stage, criterionId, signoff) =>
            signCriterion(sel, stage, criterionId, signoff)
          }
          onUnsignCriterion={(stage, criterionId) => unsignCriterion(sel, stage, criterionId)}
          onSignSub={(tradeKey, index, signoff) => signSub(sel, tradeKey, index, signoff)}
          onUnsignSub={(tradeKey, index) => unsignSub(sel, tradeKey, index)}
          onSetTradeState={(tradeKey, state) => setTradeState(sel, tradeKey, state)}
          onSetBlocked={(tradeKey, blocked) => setBlocked(sel, tradeKey, blocked)}
          onSetReason={(tradeKey, reason) => setReason(sel, tradeKey, reason)}
          onSetProjectBlocked={(blocked, reason) => setProjectBlocked(sel, blocked, reason)}
          onCommitDate={(field, toIso, reason, stage) =>
            commitDate(sel, field, toIso, reason, stage)
          }
        />
      ) : null}

      {dialog === "create" ? (
        <ProjectDialog
          title="New project"
          submitLabel="Create project"
          initial={EMPTY_PROJECT_FORM}
          canDelete={false}
          onSubmit={(form) => void submitCreate(form)}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === "edit" && sel ? (
        <ProjectDialog
          title="Edit project"
          submitLabel="Save project"
          initial={{
            projectRef: sel.projectRef,
            customerName: sel.customerName,
            location: sel.location,
            department: sel.department,
            value: sel.value,
            targetDate: toDateInputValue(getStageTarget(sel, getStage(sel))),
          }}
          canDelete={canDeleteProjects}
          onSubmit={(form) => void submitEdit(form)}
          onDelete={() => void submitDelete()}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {flashMsg ? (
        <div className={styles.flash}>
          <Lock size={14} /> {flashMsg}
        </div>
      ) : null}
    </div>
  );
}
