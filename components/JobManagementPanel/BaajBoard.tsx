"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  Calendar,
  DollarSign,
  History,
  Hourglass,
  Layers,
  Repeat,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";

import {
  deliveryStatus,
  describeActivity,
  dueStatus,
  formatDate,
  formatDateTime,
  formatMoney,
  getStage,
  getTrades,
  getValueAmount,
  isProjectBlocked,
  stageAgeDays,
  stageComplete,
  stageIndex,
  STAGES,
  TRADES,
} from "@/lib/projectManagement";
import type { DueTone } from "@/lib/projectManagement";
import type { Project } from "@/types/work";

import styles from "./baajBoard.module.css";

export type DrawerFocus = "activity" | "dates";

type BaajBoardProps = {
  projects: Project[];
  isLoadingProjects: boolean;
  /** Jump to the kanban with this project's drawer open — optionally with the related history section expanded. */
  onOpenProject: (project: Project, focus?: DrawerFocus) => void;
};

function chipClass(tone: DueTone): string {
  switch (tone) {
    case "good":
      return styles.chipGood;
    case "warn":
      return styles.chipWarn;
    case "bad":
      return styles.chipBad;
    default:
      return styles.chipMute;
  }
}

function projectTitle(project: Project): string {
  return project.customerName || project.projectRef || "Untitled project";
}

/** When the project was last flagged blocked, from the activity log. */
function blockedSince(project: Project): string | null {
  const log = project.activityLog ?? [];

  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i].kind === "blocked" && log[i].to === "blocked") return log[i].at;
  }

  return null;
}

function Tile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "warn" | "danger";
}) {
  const toneClass = tone === "danger" ? styles.dangerTile : tone === "warn" ? styles.warnTile : "";

  return (
    <div className={`${styles.tile} ${toneClass}`}>
      <div className={styles.k}>
        {icon} {label}
      </div>
      <div className={styles.v}>{value}</div>
      {sub ? <div className={styles.sub}>{sub}</div> : null}
    </div>
  );
}

/**
 * Single-hue horizontal bar chart. Each row: label · count (left edge) ·
 * bar · figure (right column).
 */
function BarChart({
  rows,
}: {
  rows: Array<{
    key: string;
    label: string;
    value: number;
    /** Number shown on the chart's left edge (defaults to the bar value). */
    edge?: string;
    display: string;
    current?: boolean;
  }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div className={styles.chart}>
      {rows.map((row) => (
        <div
          key={row.key}
          className={`${styles.brow} ${row.current ? styles.cur : ""}`}
          title={`${row.label}: ${row.edge ?? row.value} · ${row.display}`}
        >
          <span className={styles.blabel}>{row.label}</span>
          <span className={styles.bcount}>{row.edge ?? String(row.value)}</span>
          <span className={styles.btrack}>
            <span
              className={`${styles.bfill} ${row.value === 0 ? styles.zero : ""}`}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </span>
          <span className={`${styles.bval} ${row.display === "—" ? styles.dim : ""}`}>
            {row.display}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function BaajBoard({ projects, isLoadingProjects, onOpenProject }: BaajBoardProps) {
  const open = useMemo(() => projects.filter((p) => getStage(p) !== "closed"), [projects]);
  const closedCount = projects.length - open.length;

  const blockedProjects = useMemo(() => open.filter(isProjectBlocked), [open]);

  const overdue = useMemo(
    () =>
      open
        .map((project) => ({ project, status: dueStatus(project) }))
        .filter((item) => item.status.days !== null && item.status.days < 0)
        .sort((a, b) => (a.status.days ?? 0) - (b.status.days ?? 0)),
    [open],
  );

  const upcomingDeliveries = useMemo(
    () =>
      open
        .filter((p) => stageIndex(getStage(p)) < stageIndex("commissioning") && p.deliveryDate)
        .map((project) => ({ project, status: deliveryStatus(project) }))
        .sort(
          (a, b) =>
            Date.parse(a.project.deliveryDate ?? "") - Date.parse(b.project.deliveryDate ?? ""),
        ),
    [open],
  );

  const deliveriesSoon = upcomingDeliveries.filter(
    (item) => item.status.days !== null && item.status.days <= 14,
  ).length;

  // Bar length is the project count; the label adds the stage's contract
  // value ("3 · $420k") — one chart carries both.
  const stageRows = useMemo(
    () =>
      STAGES.map((stage) => {
        const inStage = projects.filter((p) => getStage(p) === stage.key);
        const total = inStage.reduce((sum, p) => sum + (getValueAmount(p) ?? 0), 0);
        return {
          key: stage.key,
          label: stage.label,
          value: inStage.length,
          edge: String(inStage.length),
          display: total > 0 ? formatMoney(total) : "—",
        };
      }),
    [projects],
  );

  // Every gate signed off but the card hasn't been moved — finished work
  // sitting invisible on the board.
  const readyToAdvance = useMemo(
    () => open.filter((p) => stageComplete(p) && !isProjectBlocked(p)),
    [open],
  );

  const stuck = useMemo(
    () =>
      open
        .map((project) => ({ project, days: stageAgeDays(project) }))
        .filter((item): item is { project: Project; days: number } => (item.days ?? 0) >= 7)
        .sort((a, b) => b.days - a.days),
    [open],
  );

  const activityFeed = useMemo(
    () =>
      projects
        .flatMap((project) =>
          (project.activityLog ?? []).map((entry) => ({ project, entry }) as const),
        )
        .sort((a, b) => Date.parse(b.entry.at) - Date.parse(a.entry.at))
        .slice(0, 8),
    [projects],
  );

  const blockedTrades = useMemo(
    () =>
      open
        .filter((project) => getStage(project) === "build")
        .flatMap((project) => {
          const trades = getTrades(project);
          return TRADES.filter((def) => trades[def.key]?.blocked).map((def) => ({
            project,
            def,
            reason: trades[def.key].reason,
          }));
        }),
    [open],
  );

  // Delivery dates that moved after being set — chronic slippage that a
  // single countdown chip hides.
  const slips = useMemo(
    () =>
      open
        .map((project) => {
          const changes = (project.dateLog ?? []).filter(
            (entry) => entry.field === "delivery" && entry.from !== null,
          );
          return { project, count: changes.length, latest: changes[changes.length - 1] };
        })
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count),
    [open],
  );

  const totalValue = useMemo(
    () => open.reduce((sum, p) => sum + (getValueAmount(p) ?? 0), 0),
    [open],
  );
  const unvaluedCount = useMemo(
    () => open.filter((p) => getValueAmount(p) === null).length,
    [open],
  );

  if (isLoadingProjects && projects.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>Loading projects…</div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.kpis}>
        <Tile
          icon={<Layers size={13} />}
          label="Open projects"
          value={String(open.length)}
          sub={closedCount > 0 ? `${closedCount} closed` : "none closed yet"}
        />
        <Tile
          icon={<AlertTriangle size={13} />}
          label="Blocked"
          value={String(blockedProjects.length)}
          sub={blockedProjects.length > 0 ? "needs unblocking" : "nothing on hold"}
          tone={blockedProjects.length > 0 ? "danger" : undefined}
        />
        <Tile
          icon={<Calendar size={13} />}
          label="Overdue stages"
          value={String(overdue.length)}
          sub={overdue.length > 0 ? "past stage target" : "all on track"}
          tone={overdue.length > 0 ? "warn" : undefined}
        />
        <Tile
          icon={<Truck size={13} />}
          label="Deliveries ≤ 14 days"
          value={String(deliveriesSoon)}
          sub={`${upcomingDeliveries.length} scheduled in total`}
        />
        <Tile
          icon={<DollarSign size={13} />}
          label="Value in pipeline"
          value={totalValue > 0 ? formatMoney(totalValue) : "—"}
          sub={unvaluedCount > 0 ? `${unvaluedCount} without a value set` : "all projects valued"}
        />
      </div>

      <div className={styles.grid}>
        <div className={styles.gridcol}>
          <div className={styles.card}>
            <h3>
              <BarChart3 size={14} /> Pipeline
            </h3>
            <div className={styles.hint}>
              Projects and contract value in each delivery stage
              {unvaluedCount > 0 ? ` — ${unvaluedCount} project(s) have no value set` : ""}
            </div>
            {projects.length === 0 ? (
              <div className={styles.empty}>No projects yet.</div>
            ) : (
              <BarChart rows={stageRows} />
            )}
          </div>

          <div className={styles.card}>
            <h3>
              <Calendar size={14} /> Needs attention
            </h3>
            <div className={styles.hint}>Stage target has passed</div>
            {overdue.length === 0 ? (
              <div className={styles.empty}>Nothing overdue.</div>
            ) : (
              <div className={styles.rows}>
                {overdue.slice(0, 6).map(({ project, status }) => (
                  <div
                    className={`${styles.row} ${styles.rowClick}`}
                    key={project.id}
                    onClick={() => onOpenProject(project)}
                  >
                    <Calendar size={14} style={{ color: "var(--warn)", flex: "0 0 auto" }} />
                    <div className={styles.who}>
                      <div className={styles.nm}>{projectTitle(project)}</div>
                      <div className={styles.meta}>
                        {project.projectRef || "—"} · {STAGES[stageIndex(getStage(project))].label}
                      </div>
                    </div>
                    <span className={`${styles.chip} ${styles.chipBad}`}>{status.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h3>
              <History size={14} /> Recent activity
            </h3>
            <div className={styles.hint}>Stage moves, edits, and blocks across all projects</div>
            {activityFeed.length === 0 ? (
              <div className={styles.empty}>No activity recorded yet.</div>
            ) : (
              <div className={styles.rows}>
                {activityFeed.map(({ project, entry }, index) => (
                  <div
                    className={`${styles.row} ${styles.rowClick}`}
                    key={`${project.id}-${index}`}
                    onClick={() => onOpenProject(project, "activity")}
                  >
                    <History size={14} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
                    <div className={styles.who}>
                      <div className={styles.nm}>{describeActivity(entry)}</div>
                      <div className={styles.meta}>
                        {project.projectRef || projectTitle(project)} · {entry.by || "unknown"} ·{" "}
                        {formatDateTime(entry.at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.gridcol}>
          <div className={styles.card}>
            <h3>
              <ShieldCheck size={14} /> Ready to advance
            </h3>
            <div className={styles.hint}>All steps signed off — move the card</div>
            {readyToAdvance.length === 0 ? (
              <div className={styles.empty}>Nothing waiting on a stage move.</div>
            ) : (
              <div className={styles.rows}>
                {readyToAdvance.map((project) => {
                  const idx = stageIndex(getStage(project));
                  return (
                    <div
                      className={`${styles.row} ${styles.rowClick}`}
                      key={project.id}
                      onClick={() => onOpenProject(project)}
                    >
                      <ShieldCheck size={14} style={{ color: "var(--ok)", flex: "0 0 auto" }} />
                      <div className={styles.who}>
                        <div className={styles.nm}>{projectTitle(project)}</div>
                        <div className={styles.meta}>
                          {project.projectRef || "—"} · {STAGES[idx].label}
                        </div>
                      </div>
                      <span className={`${styles.chip} ${styles.chipGood}`}>
                        <ArrowRight size={11} /> {STAGES[idx + 1]?.label ?? "Done"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h3>
              <Hourglass size={14} /> Stuck in stage
            </h3>
            <div className={styles.hint}>A week or more without a stage move</div>
            {stuck.length === 0 ? (
              <div className={styles.empty}>Nothing sitting longer than a week.</div>
            ) : (
              <div className={styles.rows}>
                {stuck.slice(0, 6).map(({ project, days }) => (
                  <div
                    className={`${styles.row} ${styles.rowClick}`}
                    key={project.id}
                    onClick={() => onOpenProject(project)}
                  >
                    <Hourglass size={14} style={{ color: "var(--warn)", flex: "0 0 auto" }} />
                    <div className={styles.who}>
                      <div className={styles.nm}>{projectTitle(project)}</div>
                      <div className={styles.meta}>
                        {project.projectRef || "—"} · {STAGES[stageIndex(getStage(project))].label}
                      </div>
                    </div>
                    <span
                      className={`${styles.chip} ${days >= 14 ? styles.chipBad : styles.chipWarn}`}
                    >
                      {days}d in stage
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={styles.card}>
            <h3>
              <Truck size={14} /> Upcoming deliveries
            </h3>
            <div className={styles.hint}>Sorted by delivery date</div>
            {upcomingDeliveries.length === 0 ? (
              <div className={styles.empty}>No deliveries scheduled.</div>
            ) : (
              <div className={styles.rows}>
                {upcomingDeliveries.slice(0, 6).map(({ project, status }) => (
                  <div
                    className={`${styles.row} ${styles.rowClick}`}
                    key={project.id}
                    onClick={() => onOpenProject(project)}
                  >
                    <Briefcase size={14} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
                    <div className={styles.who}>
                      <div className={styles.nm}>{projectTitle(project)}</div>
                      <div className={styles.meta}>
                        {project.projectRef || "—"} · {STAGES[stageIndex(getStage(project))].label}
                      </div>
                    </div>
                    <span className={`${styles.chip} ${chipClass(status.tone)}`}>
                      {formatDate(project.deliveryDate)} · {status.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h3>
              <Repeat size={14} /> Delivery reschedules
            </h3>
            <div className={styles.hint}>Delivery dates that moved after being set</div>
            {slips.length === 0 ? (
              <div className={styles.empty}>No delivery dates have slipped.</div>
            ) : (
              <div className={styles.rows}>
                {slips.slice(0, 6).map(({ project, count, latest }) => (
                  <div
                    className={`${styles.row} ${styles.rowClick}`}
                    key={project.id}
                    onClick={() => onOpenProject(project, "dates")}
                  >
                    <Repeat size={14} style={{ color: "var(--warn)", flex: "0 0 auto" }} />
                    <div className={styles.who}>
                      <div className={styles.nm}>{projectTitle(project)}</div>
                      <div className={styles.meta}>
                        {project.projectRef || "—"} · now{" "}
                        {project.deliveryDate ? formatDate(project.deliveryDate) : "—"}
                        {latest?.reason ? ` · “${latest.reason}”` : ""}
                      </div>
                    </div>
                    <span
                      className={`${styles.chip} ${count >= 2 ? styles.chipBad : styles.chipWarn}`}
                    >
                      moved {count}×
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h3>
              <AlertTriangle size={14} /> Blocked projects
            </h3>
            <div className={styles.hint}>On hold — forward moves are refused</div>
            {blockedProjects.length === 0 ? (
              <div className={styles.empty}>No blocked projects.</div>
            ) : (
              <div className={styles.rows}>
                {blockedProjects.map((project) => {
                  const since = blockedSince(project);
                  return (
                    <div
                      className={`${styles.row} ${styles.rowClick}`}
                      key={project.id}
                      onClick={() => onOpenProject(project)}
                    >
                      <AlertTriangle
                        size={14}
                        style={{ color: "var(--danger)", flex: "0 0 auto" }}
                      />
                      <div className={styles.who}>
                        <div className={styles.nm}>{projectTitle(project)}</div>
                        <div className={styles.reasonline}>
                          {project.blockedReason || "no reason recorded"}
                        </div>
                        <div className={styles.meta}>
                          {project.projectRef || "—"} ·{" "}
                          {STAGES[stageIndex(getStage(project))].label}
                          {since ? ` · since ${formatDate(since)}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h3>
              <Wrench size={14} /> Blocked trades in Build
            </h3>
            <div className={styles.hint}>Trade-level holds on Build-stage projects</div>
            {blockedTrades.length === 0 ? (
              <div className={styles.empty}>No blocked trades.</div>
            ) : (
              <div className={styles.rows}>
                {blockedTrades.map(({ project, def, reason }) => (
                  <div
                    className={`${styles.row} ${styles.rowClick}`}
                    key={`${project.id}-${def.key}`}
                    onClick={() => onOpenProject(project)}
                  >
                    <Wrench size={14} style={{ color: "var(--danger)", flex: "0 0 auto" }} />
                    <div className={styles.who}>
                      <div className={styles.nm}>
                        {projectTitle(project)} — {def.label}
                      </div>
                      <div className={styles.reasonline}>{reason || "no reason recorded"}</div>
                      <div className={styles.meta}>{project.projectRef || "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
