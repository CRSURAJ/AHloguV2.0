"use client";

import { useMemo, useState } from "react";

import {
  formatDate,
  getStage,
  getStageTarget,
  isProjectBlocked,
  stageAgeDays,
  stageIndex,
  STAGES,
} from "@/lib/projectManagement";
import type { Project, ProjectDepartment } from "@/types/work";

import styles from "./gantt.module.css";

type GanttViewProps = {
  projects: Project[];
  isLoadingProjects: boolean;
  /** Jump to the kanban with this project's drawer open. */
  onOpenProject: (project: Project) => void;
};

type DeptFilter = "all" | ProjectDepartment;

type SegmentState = "done" | "current" | "late" | "plan";

type Segment = {
  key: string;
  label: string;
  startMs: number;
  endMs: number;
  state: SegmentState;
};

const DAY_MS = 864e5;

/**
 * Planned bars from stage targets: each stage spans from the previous
 * stage's target (the project's creation for the first) to its own target.
 * Stages without a target are not drawn; a target on/before the previous
 * stage's target still gets a half-day sliver so the stage never vanishes.
 */
function buildSegments(project: Project, now: number): Segment[] {
  const currentIdx = stageIndex(getStage(project));
  const segments: Segment[] = [];
  let cursor = Date.parse(project.createdAt);

  if (Number.isNaN(cursor)) return segments;

  STAGES.forEach((stage, index) => {
    if (stage.key === "closed") return;

    const targetIso = getStageTarget(project, stage.key);
    if (!targetIso) return;

    let end = Date.parse(targetIso);
    if (Number.isNaN(end)) return;
    if (end <= cursor) end = cursor + DAY_MS / 2;

    const state: SegmentState =
      index < currentIdx
        ? "done"
        : index === currentIdx
          ? end < now
            ? "late"
            : "current"
          : "plan";

    segments.push({ key: stage.key, label: stage.label, startMs: cursor, endMs: end, state });
    cursor = end;
  });

  return segments;
}

type ActualSpan = {
  key: string;
  label: string;
  /** Drawing coordinates — clamped so every occupied stage is visible. */
  startMs: number;
  endMs: number;
  /** True occupancy, for the tooltip. */
  realStartMs: number;
  realEndMs: number;
  /** Still in this stage now. */
  open: boolean;
};

const labelToKey = (label: string): string =>
  STAGES.find((stage) => stage.label === label)?.key ?? label;

/**
 * What actually happened: stage-move timestamps from the activity log carve
 * the time since creation into one span per stage occupied. Projects with no
 * recorded moves get a single span for their current stage since creation.
 * A stage occupied for less than half a day still draws half a day wide
 * (pushing later spans right) so rapid moves never vanish; tooltips carry
 * the true times.
 */
function buildActualSpans(project: Project, now: number): ActualSpan[] {
  const created = Date.parse(project.createdAt);
  if (Number.isNaN(created)) return [];

  const moves = (project.activityLog ?? [])
    .filter((entry) => entry.kind === "stage")
    .map((entry) => ({ at: Date.parse(entry.at), from: entry.from, to: entry.to }))
    .filter((move) => !Number.isNaN(move.at))
    .sort((a, b) => a.at - b.at);

  const spans: ActualSpan[] = [];
  let drawCursor = created;

  const push = (label: string, realStart: number, realEnd: number, open: boolean) => {
    const startMs = Math.max(realStart, drawCursor);
    const endMs = Math.max(realEnd, startMs + DAY_MS / 2);
    spans.push({
      key: labelToKey(label),
      label,
      startMs,
      endMs,
      realStartMs: realStart,
      realEndMs: realEnd,
      open,
    });
    drawCursor = endMs;
  };

  let cursor = created;
  let label = moves.length > 0 ? moves[0].from : STAGES[stageIndex(getStage(project))].label;

  for (const move of moves) {
    if (label && move.at > cursor) {
      push(label, cursor, move.at, false);
      cursor = move.at;
    }
    label = move.to;
  }

  if (label) {
    push(label, cursor, Math.max(now, cursor), true);
  }

  return spans;
}

type Tick = { ms: number; label: string };

/** Week ticks (Mondays) for short ranges, month ticks for long ones. */
function makeTicks(startMs: number, endMs: number): Tick[] {
  const ticks: Tick[] = [];
  const date = new Date(startMs);

  if (endMs - startMs > 150 * DAY_MS) {
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    while (date.getTime() < endMs) {
      ticks.push({
        ms: date.getTime(),
        label: date.toLocaleDateString(undefined, { month: "short" }),
      });
      date.setMonth(date.getMonth() + 1);
    }
  } else {
    date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7));
    while (date.getTime() < endMs) {
      ticks.push({
        ms: date.getTime(),
        label: date.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      });
      date.setDate(date.getDate() + 7);
    }
  }

  // Thin crowded axes — every 2nd label past 14 ticks.
  return ticks.length > 14 ? ticks.filter((_, index) => index % 2 === 0) : ticks;
}

function projectTitle(project: Project): string {
  return project.customerName || project.projectRef || "Untitled project";
}

/**
 * Drill-in popup: one row per stage for a single project, planned bar vs
 * actual spans. Clicking the chart pushes on to the kanban drawer.
 */
function ProjectGanttDialog({
  project,
  now,
  onClose,
  onOpenBoard,
}: {
  project: Project;
  now: number;
  onClose: () => void;
  onOpenBoard: () => void;
}) {
  const segments = buildSegments(project, now);
  const actuals = buildActualSpans(project, now);
  const deliveryMs = project.deliveryDate ? Date.parse(project.deliveryDate) : NaN;
  const currentKey = getStage(project);

  let min = now - 3 * DAY_MS;
  let max = now + 7 * DAY_MS;
  const created = Date.parse(project.createdAt);
  if (!Number.isNaN(created)) min = Math.min(min, created);
  for (const seg of segments) {
    min = Math.min(min, seg.startMs);
    max = Math.max(max, seg.endMs);
  }
  for (const span of actuals) {
    min = Math.min(min, span.startMs);
    max = Math.max(max, span.endMs);
  }
  if (!Number.isNaN(deliveryMs)) max = Math.max(max, deliveryMs);
  const pad = Math.max(2 * DAY_MS, (max - min) * 0.04);
  min -= pad;
  max += pad;

  const pct = (ms: number) => ((ms - min) / (max - min)) * 100;
  const ticks = makeTicks(min, max).filter((tick) => pct(tick.ms) <= 97);

  const stageRows = STAGES.filter((stage) => stage.key !== "closed").map((stage) => ({
    def: stage,
    planned: segments.find((seg) => seg.key === stage.key) ?? null,
    actual: actuals.filter((span) => span.key === stage.key),
  }));

  return (
    <div className={styles.popScrim} onClick={onClose}>
      <div className={styles.pop} onClick={(event) => event.stopPropagation()}>
        <div className={styles.popHead}>
          <div>
            <h3>{projectTitle(project)}</h3>
            <div className={styles.sub}>
              {project.projectRef || "—"} · {STAGES[stageIndex(currentKey)].label}
              {isProjectBlocked(project) ? " · blocked" : ""}
              {project.deliveryDate ? ` · delivery ${formatDate(project.deliveryDate)}` : ""}
            </div>
          </div>
          <button type="button" className={styles.popClose} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.popChart} onClick={onOpenBoard} title="Open in KannBoard">
          <div className={styles.popLabels}>
            <div className={styles.axisSpacer} />
            {stageRows.map(({ def }) => (
              <div
                className={`${styles.popStage} ${def.key === currentKey ? styles.cur : ""}`}
                key={def.key}
              >
                {def.label}
              </div>
            ))}
          </div>

          <div className={styles.popTimeline}>
            <div className={styles.gaxis}>
              {ticks.map((tick) => (
                <span className={styles.tick} key={tick.ms} style={{ left: `${pct(tick.ms)}%` }}>
                  {tick.label}
                </span>
              ))}
            </div>
            {ticks.map((tick) => (
              <div
                className={styles.gridline}
                key={`l-${tick.ms}`}
                style={{ left: `${pct(tick.ms)}%` }}
              />
            ))}
            <div className={styles.todayline} style={{ left: `${pct(now)}%` }} />
            <span className={styles.todaytag} style={{ left: `${pct(now)}%` }}>
              today
            </span>
            {!Number.isNaN(deliveryMs) ? (
              <>
                <div className={styles.deliveryline} style={{ left: `${pct(deliveryMs)}%` }} />
                <span className={styles.deliverytag} style={{ left: `${pct(deliveryMs)}%` }}>
                  delivery
                </span>
              </>
            ) : null}

            {stageRows.map(({ def, planned, actual }) => (
              <div className={styles.popTrack} key={def.key}>
                {planned ? (
                  <div
                    className={`${styles.gseg} ${
                      planned.state === "done"
                        ? styles.gsegDone
                        : planned.state === "current"
                          ? styles.gsegCur
                          : planned.state === "late"
                            ? styles.gsegLate
                            : styles.gsegPlan
                    }`}
                    style={{
                      top: "22%",
                      height: "28%",
                      left: `${pct(planned.startMs)}%`,
                      width: `max(calc(${pct(planned.endMs) - pct(planned.startMs)}% - 2px), 4px)`,
                    }}
                    title={`${def.label} · target ${formatDate(new Date(planned.endMs).toISOString())}`}
                  />
                ) : null}
                {actual.map((span, index) => (
                  <div
                    className={`${styles.aseg} ${span.open ? styles.asegOpen : ""}`}
                    key={index}
                    style={{
                      top: "58%",
                      height: "20%",
                      left: `${pct(span.startMs)}%`,
                      width: `max(calc(${pct(span.endMs) - pct(span.startMs)}% - 2px), 4px)`,
                    }}
                    title={`Actual · ${span.label} · ${formatDate(
                      new Date(span.realStartMs).toISOString(),
                    )} → ${span.open ? "now" : formatDate(new Date(span.realEndMs).toISOString())}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.popFoot}>
          <span className={styles.popHint}>
            Top bar = target, bottom bar = actual. Click the chart to open the project in KannBoard.
          </span>
        </div>
      </div>
    </div>
  );
}

export default function GanttView({ projects, isLoadingProjects, onOpenProject }: GanttViewProps) {
  const [filter, setFilter] = useState<DeptFilter>("all");
  // First click opens the drill-in popup; from there on to the kanban drawer.
  const [selProject, setSelProject] = useState<Project | null>(null);
  // Captured once on mount — the "today" anchor for the whole chart.
  const [now] = useState(() => Date.now());

  const rows = useMemo(
    () =>
      projects
        .filter((p) => getStage(p) !== "closed")
        .filter((p) => filter === "all" || p.department === filter)
        .map((project) => ({
          project,
          segments: buildSegments(project, now),
          actuals: buildActualSpans(project, now),
          deliveryMs: project.deliveryDate ? Date.parse(project.deliveryDate) : NaN,
        }))
        .sort((a, b) => {
          const aEnd = Number.isNaN(a.deliveryMs) ? Infinity : a.deliveryMs;
          const bEnd = Number.isNaN(b.deliveryMs) ? Infinity : b.deliveryMs;
          return aEnd - bEnd;
        }),
    [projects, filter, now],
  );

  const [rangeStart, rangeEnd] = useMemo(() => {
    let min = now - 7 * DAY_MS;
    let max = now + 21 * DAY_MS;

    for (const row of rows) {
      for (const seg of row.segments) {
        min = Math.min(min, seg.startMs);
        max = Math.max(max, seg.endMs);
      }
      for (const span of row.actuals) {
        min = Math.min(min, span.startMs);
        max = Math.max(max, span.endMs);
      }
      if (!Number.isNaN(row.deliveryMs)) max = Math.max(max, row.deliveryMs);
    }

    const pad = Math.max(3 * DAY_MS, (max - min) * 0.03);
    return [min - pad, max + pad];
  }, [rows, now]);

  const pct = (ms: number) => ((ms - rangeStart) / (rangeEnd - rangeStart)) * 100;
  // Ticks too close to the right edge would clip mid-label — drop them.
  const ticks = useMemo(
    () =>
      makeTicks(rangeStart, rangeEnd).filter(
        (tick) => ((tick.ms - rangeStart) / (rangeEnd - rangeStart)) * 100 <= 97,
      ),
    [rangeStart, rangeEnd],
  );

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
        <div className={styles.legend}>
          <span className={styles.li}>
            <span className={`${styles.sw} ${styles.swDone}`} /> done
          </span>
          <span className={styles.li}>
            <span className={`${styles.sw} ${styles.swCur}`} /> current stage
          </span>
          <span className={styles.li}>
            <span className={`${styles.sw} ${styles.swLate}`} /> overdue
          </span>
          <span className={styles.li}>
            <span className={`${styles.sw} ${styles.swPlan}`} /> planned
          </span>
          <span className={styles.li}>
            <span className={`${styles.sw} ${styles.swActual}`} /> actual
          </span>
          <span className={styles.li}>
            <span className={styles.swDia} /> delivery
          </span>
        </div>
      </div>

      <div className={styles.card}>
        {rows.length === 0 ? (
          <div className={styles.empty}>
            {isLoadingProjects ? "Loading projects…" : "No open projects to plot."}
          </div>
        ) : (
          <div className={styles.grid}>
            <div className={styles.labels}>
              <div className={styles.axisSpacer} />
              {rows.map(({ project }) => (
                <div
                  className={styles.rowlabel}
                  key={project.id}
                  onClick={() => setSelProject(project)}
                  title={`${projectTitle(project)} — open timeline`}
                >
                  <span className={styles.nm}>{projectTitle(project)}</span>
                  <span className={styles.sub}>
                    {project.projectRef || "—"} · {STAGES[stageIndex(getStage(project))].label}
                    {isProjectBlocked(project) ? " · blocked" : ""}
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.timeline}>
              <div className={styles.gaxis}>
                {ticks.map((tick) => (
                  <span className={styles.tick} key={tick.ms} style={{ left: `${pct(tick.ms)}%` }}>
                    {tick.label}
                  </span>
                ))}
              </div>

              {ticks.map((tick) => (
                <div
                  className={styles.gridline}
                  key={`l-${tick.ms}`}
                  style={{ left: `${pct(tick.ms)}%` }}
                />
              ))}
              <div className={styles.todayline} style={{ left: `${pct(now)}%` }} />
              <span className={styles.todaytag} style={{ left: `${pct(now)}%` }}>
                today
              </span>

              {rows.map(({ project, segments, actuals, deliveryMs }) => (
                <div
                  className={styles.track}
                  key={project.id}
                  onClick={() => setSelProject(project)}
                >
                  {actuals.map((span, index) => (
                    <div
                      className={`${styles.aseg} ${span.open ? styles.asegOpen : ""}`}
                      key={`a-${index}`}
                      style={{
                        left: `${pct(span.startMs)}%`,
                        width: `max(calc(${pct(span.endMs) - pct(span.startMs)}% - 2px), 3px)`,
                      }}
                      title={`Actual · ${span.label} · ${formatDate(
                        new Date(span.realStartMs).toISOString(),
                      )} → ${
                        span.open ? "now" : formatDate(new Date(span.realEndMs).toISOString())
                      } (${
                        span.realEndMs - span.realStartMs < DAY_MS
                          ? "<1d"
                          : `${Math.round((span.realEndMs - span.realStartMs) / DAY_MS)}d`
                      })`}
                    />
                  ))}
                  {segments.length === 0 ? (
                    <span
                      className={styles.nodata}
                      style={{ left: `${Math.min(pct(now) + 1, 72)}%` }}
                    >
                      no stage targets set
                    </span>
                  ) : (
                    segments.map((seg) => {
                      const width = pct(seg.endMs) - pct(seg.startMs);
                      const stateClass =
                        seg.state === "done"
                          ? styles.gsegDone
                          : seg.state === "current"
                            ? styles.gsegCur
                            : seg.state === "late"
                              ? styles.gsegLate
                              : styles.gsegPlan;
                      const days =
                        seg.state === "current" || seg.state === "late"
                          ? stageAgeDays(project)
                          : null;

                      return (
                        <div
                          className={`${styles.gseg} ${stateClass}`}
                          key={seg.key}
                          style={{
                            left: `${pct(seg.startMs)}%`,
                            // 2px surface gap between touching segments; never
                            // thinner than 4px so slivers stay visible.
                            width: `max(calc(${width}% - 2px), 4px)`,
                          }}
                          title={`${seg.label} · target ${formatDate(new Date(seg.endMs).toISOString())}${
                            days !== null ? ` · ${days}d in stage` : ""
                          }${seg.state === "late" ? " · OVERDUE" : ""}`}
                        />
                      );
                    })
                  )}
                  {!Number.isNaN(deliveryMs) ? (
                    <div
                      className={`${styles.diamond} ${deliveryMs < now ? styles.diamondLate : ""}`}
                      style={{ left: `${pct(deliveryMs)}%` }}
                      title={`Delivery · ${formatDate(project.deliveryDate)}${
                        deliveryMs < now ? " · past" : ""
                      }`}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selProject ? (
        <ProjectGanttDialog
          project={selProject}
          now={now}
          onClose={() => setSelProject(null)}
          onOpenBoard={() => {
            setSelProject(null);
            onOpenProject(selProject);
          }}
        />
      ) : null}
    </div>
  );
}
