"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Calendar,
  Check,
  Circle,
  Clock,
  Cpu,
  Droplets,
  ExternalLink,
  FileText,
  History,
  Lock,
  MessageSquare,
  Pencil,
  Plus,
  ShieldCheck,
  Truck,
  Unlock,
  User,
  Wrench,
  X,
  Zap,
} from "lucide-react";

import {
  checklistDone,
  checklistPct,
  criteriaForProject,
  criterionMet,
  deliveryStatus,
  describeActivity,
  dueStatus,
  formatDate,
  formatDateTime,
  formatMinutes,
  fromDateInputValue,
  gateProgress,
  getGates,
  getStage,
  getStageTarget,
  getTrades,
  hasControlPanel,
  isProjectBlocked,
  projectTypeLabel,
  stageComplete,
  stageIndex,
  STAGES,
  toDateInputValue,
  tradesForProject,
} from "@/lib/projectManagement";
import type { ExitCriterion, TradeDef } from "@/lib/projectManagement";
import type {
  Job,
  Project,
  ProjectActivityEntry,
  ProjectDateField,
  ProjectSalesOrder,
  ProjectSignOff,
  ProjectStageKey,
  ProjectTrade,
  ProjectTradeChecklistItem,
  TradeState,
} from "@/types/work";

import styles from "./deliveryBoard.module.css";

const TRADE_ICONS: Record<string, typeof Droplets> = {
  plumbing: Droplets,
  electrical: Zap,
  prefab: Wrench,
  controller: Cpu,
};

const STATE_META: Record<
  TradeState,
  { label: string; Icon: typeof Circle; bg: string; fg: string }
> = {
  not_started: { label: "Not started", Icon: Circle, bg: "var(--col)", fg: "var(--muted)" },
  in_progress: { label: "In progress", Icon: Clock, bg: "var(--warn-soft)", fg: "var(--warn)" },
  complete: { label: "Complete", Icon: Check, bg: "var(--ok-soft)", fg: "var(--ok)" },
  signed_off: { label: "Signed off", Icon: ShieldCheck, bg: "var(--ok-soft)", fg: "var(--ok)" },
};

export type ProjectDrawerProps = {
  project: Project;
  /** Jobs created under this project (job.projectId === project.id). */
  linkedJobs: Job[];
  /** Total logged minutes per human job code (AdminWorkLog.jobId). */
  minutesByJobId: Record<string, number>;
  currentUserName: string;
  /** History section to expand on open (jump-in from BaajBoard). */
  initialFocus?: "activity" | "dates" | null;
  openTrade: string;
  setOpenTrade: (key: string) => void;
  onClose: () => void;
  onEditDetails: () => void;
  onCreateJob: (salesOrder?: ProjectSalesOrder) => void;
  onEditJob: (job: Job) => void;
  /** `change` carries display strings for the "Sales orders" activity entry. */
  onSalesOrdersChange: (next: ProjectSalesOrder[], change: { from: string; to: string }) => void;
  onMoveStage: (dir: -1 | 1) => void;
  onSignCriterion: (stage: ProjectStageKey, criterionId: string, signoff: ProjectSignOff) => void;
  onUnsignCriterion: (stage: ProjectStageKey, criterionId: string) => void;
  onSignSub: (tradeKey: string, index: number, signoff: ProjectSignOff) => void;
  onUnsignSub: (tradeKey: string, index: number) => void;
  onSetTradeState: (tradeKey: string, state: TradeState) => void;
  onSetBlocked: (tradeKey: string, blocked: boolean) => void;
  onSetReason: (tradeKey: string, reason: string) => void;
  onSetProjectBlocked: (blocked: boolean, reason: string) => void;
  onCommitDate: (
    field: ProjectDateField,
    toIso: string | null,
    reason: string,
    stage?: ProjectStageKey,
  ) => void;
};

const stageLabel = (key: ProjectStageKey): string =>
  STAGES.find((stage) => stage.key === key)?.label ?? key;

function makeSignOff(by: string, comment: string, url: string, title: string): ProjectSignOff {
  const signoff: ProjectSignOff = {
    by: by.trim(),
    at: new Date().toISOString(),
    comment: comment.trim(),
  };

  if (url.trim()) signoff.documentUrl = url.trim();
  if (title.trim()) signoff.documentTitle = title.trim();

  return signoff;
}

function SignForm({
  defaultBy,
  onSubmit,
  onCancel,
}: {
  defaultBy: string;
  onSubmit: (signoff: ProjectSignOff) => void;
  onCancel: () => void;
}) {
  const [by, setBy] = useState(defaultBy);
  const [comment, setComment] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const canSubmit = by.trim() !== "" && (url.trim() !== "" || comment.trim() !== "");

  return (
    <div className={styles.signform}>
      <label>Signed by</label>
      <input type="text" value={by} onChange={(event) => setBy(event.target.value)} />

      <label style={{ marginTop: 8 }}>Document link (optional)</label>
      <input
        type="url"
        value={url}
        placeholder="https://... (OneDrive / SharePoint)"
        onChange={(event) => setUrl(event.target.value)}
      />
      {url.trim() ? (
        <input
          type="text"
          style={{ marginTop: 6 }}
          value={title}
          placeholder="Document title"
          onChange={(event) => setTitle(event.target.value)}
        />
      ) : null}

      <label style={{ marginTop: 8 }}>
        Comment {url.trim() ? "(optional)" : "(required — no document attached)"}
      </label>
      <textarea
        value={comment}
        placeholder="What was checked / how it was verified"
        onChange={(event) => setComment(event.target.value)}
      />

      <div className={styles.formacts}>
        <button
          type="button"
          className={styles.primary}
          disabled={!canSubmit}
          onClick={() => onSubmit(makeSignOff(by, comment, url, title))}
        >
          <Check size={14} /> Sign off
        </button>
        <button type="button" className={styles.ghost} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function EvChips({ rec, onClick }: { rec: ProjectSignOff; onClick: () => void }) {
  return (
    <span style={{ display: "inline-flex", gap: 6 }} onClick={onClick}>
      {rec.documentUrl ? (
        <span className={styles.evchip}>
          <ExternalLink size={11} /> doc
        </span>
      ) : null}
      {rec.comment ? (
        <span className={styles.evchip}>
          <MessageSquare size={11} /> note
        </span>
      ) : null}
    </span>
  );
}

function EvidenceLine({
  rec,
  onUndo,
  readOnly,
}: {
  rec: ProjectSignOff;
  onUndo: () => void;
  readOnly: boolean;
}) {
  return (
    <div className={styles.detailev}>
      <div style={{ flex: 1 }}>
        {rec.documentUrl ? (
          <div
            style={{
              display: "flex",
              gap: 7,
              alignItems: "flex-start",
              marginBottom: rec.comment ? 6 : 0,
            }}
          >
            <FileText size={14} style={{ flex: "0 0 auto", marginTop: 1 }} />
            <a href={rec.documentUrl} target="_blank" rel="noreferrer" className={styles.undo}>
              {rec.documentTitle || "Open document"}
            </a>
          </div>
        ) : null}
        {rec.comment ? (
          <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
            <MessageSquare size={14} style={{ flex: "0 0 auto", marginTop: 1 }} />
            <span>{rec.comment}</span>
          </div>
        ) : null}
        <div className={styles.signline} style={{ marginTop: 6 }}>
          {rec.by} · {formatDateTime(rec.at)}
        </div>
      </div>
      {!readOnly ? (
        <button type="button" className={styles.undo} onClick={onUndo}>
          <History size={12} /> Undo
        </button>
      ) : null}
    </div>
  );
}

function CriterionRow({
  criterion,
  rec,
  defaultBy,
  onSign,
  onUnsign,
  readOnly,
}: {
  criterion: ExitCriterion;
  rec: ProjectSignOff | null;
  defaultBy: string;
  onSign: (signoff: ProjectSignOff) => void;
  onUnsign: () => void;
  readOnly: boolean;
}) {
  const [form, setForm] = useState(false);
  const [showEv, setShowEv] = useState(false);

  if (criterion.auto) {
    const met = Boolean(rec);
    return (
      <div className={`${styles.crit} ${styles.locked} ${met ? styles.done : ""}`}>
        <div className={styles.crithead}>
          <span className={`${styles.cbox} ${styles.auto} ${met ? styles.on : ""}`}>
            {met ? <Check size={12} /> : null}
          </span>
          <span className={styles.clabel}>
            {criterion.label}
            <span className={styles.autohint}>auto · cleared by trades below</span>
          </span>
          <span className={styles.owner}>
            <User size={11} /> {criterion.owner}
          </span>
        </div>
      </div>
    );
  }

  if (rec) {
    return (
      <div className={`${styles.crit} ${styles.done}`}>
        <div className={styles.crithead}>
          <span className={`${styles.cbox} ${styles.on}`}>
            <Check size={12} />
          </span>
          <div className={styles.clabel}>
            {criterion.label}
            <span className={styles.signline}>
              Signed by {rec.by} · {formatDateTime(rec.at)}
            </span>
          </div>
          <EvChips rec={rec} onClick={() => setShowEv((value) => !value)} />
        </div>
        {showEv ? <EvidenceLine rec={rec} onUndo={onUnsign} readOnly={readOnly} /> : null}
      </div>
    );
  }

  return (
    <div className={styles.crit}>
      <div className={styles.crithead}>
        <span className={styles.cbox} onClick={() => !readOnly && setForm(true)} />
        <span className={styles.clabel}>{criterion.label}</span>
        <span className={styles.owner}>
          <User size={11} /> {criterion.owner}
        </span>
        {!readOnly && !form ? (
          <button type="button" className={styles.signbtn} onClick={() => setForm(true)}>
            Sign off
          </button>
        ) : null}
      </div>
      {form && !readOnly ? (
        <SignForm
          defaultBy={defaultBy}
          onSubmit={(signoff) => {
            onSign(signoff);
            setForm(false);
          }}
          onCancel={() => setForm(false)}
        />
      ) : null}
    </div>
  );
}

function SubRow({
  item,
  defaultBy,
  onSign,
  onUnsign,
  readOnly,
}: {
  item: ProjectTradeChecklistItem;
  defaultBy: string;
  onSign: (signoff: ProjectSignOff) => void;
  onUnsign: () => void;
  readOnly: boolean;
}) {
  const [form, setForm] = useState(false);
  const [showEv, setShowEv] = useState(false);
  const rec = item.signoff;

  return (
    <div className={`${styles.substep} ${rec ? styles.done : ""}`}>
      <div className={styles.subhead}>
        <span
          className={`${styles.box} ${rec ? styles.on : ""}`}
          onClick={() => {
            if (readOnly) return;
            if (rec) setShowEv((value) => !value);
            else setForm(true);
          }}
        >
          {rec ? <Check size={12} /> : null}
        </span>
        <span className={styles.sublbl}>{item.label}</span>
        {rec ? (
          <EvChips rec={rec} onClick={() => setShowEv((value) => !value)} />
        ) : !readOnly && !form ? (
          <button type="button" className={styles.signbtn} onClick={() => setForm(true)}>
            Verify
          </button>
        ) : null}
      </div>
      {rec && showEv ? <EvidenceLine rec={rec} onUndo={onUnsign} readOnly={readOnly} /> : null}
      {form && !readOnly ? (
        <SignForm
          defaultBy={defaultBy}
          onSubmit={(signoff) => {
            onSign(signoff);
            setForm(false);
          }}
          onCancel={() => setForm(false)}
        />
      ) : null}
    </div>
  );
}

function TradeRow({
  def,
  trade,
  open,
  readOnly,
  defaultBy,
  onToggle,
  onSignSub,
  onUnsignSub,
  onState,
  onBlock,
  onReason,
}: {
  def: TradeDef;
  trade: ProjectTrade;
  open: boolean;
  readOnly: boolean;
  defaultBy: string;
  onToggle: () => void;
  onSignSub: (index: number, signoff: ProjectSignOff) => void;
  onUnsignSub: (index: number) => void;
  onState: (state: TradeState) => void;
  onBlock: (blocked: boolean) => void;
  onReason: (reason: string) => void;
}) {
  const [reasonDraft, setReasonDraft] = useState(trade.reason);
  const meta = trade.blocked
    ? { label: "Blocked", Icon: AlertTriangle, bg: "var(--danger-soft)", fg: "var(--danger)" }
    : STATE_META[trade.state];
  const StateIcon = meta.Icon;
  const TradeIcon = TRADE_ICONS[def.key] ?? Wrench;
  const allChecked = checklistDone(trade) === trade.checklist.length;

  return (
    <div className={`${styles.trade} ${open ? styles.open : ""}`}>
      <div className={styles.trhead} onClick={onToggle}>
        <TradeIcon size={18} style={{ color: "var(--muted)" }} />
        <span className={styles.nm}>{def.label}</span>
        <div style={{ flex: 1 }} />
        <span className={styles.pill} style={{ background: meta.bg, color: meta.fg }}>
          <StateIcon size={12} /> {meta.label}
        </span>
      </div>
      {open ? (
        <div className={styles.trbody}>
          <div className={styles.trmeta}>
            <span>
              <User size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
              Responsible: {def.owner}
            </span>
            <span>
              {checklistDone(trade)}/{trade.checklist.length} · {checklistPct(trade)}%
            </span>
          </div>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${checklistPct(trade)}%` }} />
          </div>
          {trade.checklist.map((item, index) => (
            <SubRow
              key={`${def.key}-${index}`}
              item={item}
              defaultBy={defaultBy}
              readOnly={readOnly}
              onSign={(signoff) => onSignSub(index, signoff)}
              onUnsign={() => onUnsignSub(index)}
            />
          ))}
          {trade.blocked ? (
            <div className={styles.reason}>
              <AlertTriangle size={14} style={{ flex: "0 0 auto", marginTop: 2 }} />
              <input
                value={reasonDraft}
                placeholder="Reason it's blocked"
                disabled={readOnly}
                onChange={(event) => setReasonDraft(event.target.value)}
                onBlur={() => {
                  if (reasonDraft !== trade.reason) onReason(reasonDraft);
                }}
              />
            </div>
          ) : null}
          {!readOnly ? (
            <div className={styles.acts}>
              {trade.blocked ? (
                <button type="button" className={styles.b} onClick={() => onBlock(false)}>
                  <Unlock size={13} /> Unblock
                </button>
              ) : (
                <>
                  {trade.state === "not_started" ? (
                    <button
                      type="button"
                      className={styles.b}
                      onClick={() => onState("in_progress")}
                    >
                      Start work
                    </button>
                  ) : null}
                  {trade.state === "in_progress" ? (
                    <button
                      type="button"
                      className={styles.b}
                      disabled={!allChecked}
                      onClick={() => onState("complete")}
                    >
                      <Check size={13} /> Mark complete
                    </button>
                  ) : null}
                  {trade.state === "complete" ? (
                    <button
                      type="button"
                      className={styles.b}
                      onClick={() => onState("signed_off")}
                    >
                      <ShieldCheck size={13} /> Sign off
                    </button>
                  ) : null}
                  {trade.state === "signed_off" ? (
                    <span style={{ fontSize: 12, color: "var(--faint)" }}>
                      Signed off — no further action
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={`${styles.b} ${styles.warn}`}
                    onClick={() => onBlock(true)}
                  >
                    <Lock size={13} /> Flag blocked
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DatesPanel({
  project,
  defaultShowLog = false,
  onCommitDate,
}: {
  project: Project;
  defaultShowLog?: boolean;
  onCommitDate: (
    field: ProjectDateField,
    toIso: string | null,
    reason: string,
    stage?: ProjectStageKey,
  ) => void;
}) {
  const [pendingField, setPendingField] = useState<ProjectDateField | null>(null);
  const [pendingStage, setPendingStage] = useState<ProjectStageKey | null>(null);
  const [pendingIso, setPendingIso] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showLog, setShowLog] = useState(defaultShowLog);
  const [showTargets, setShowTargets] = useState(false);
  const stage = getStage(project);
  const status = dueStatus(project);
  const delivery = deliveryStatus(project);
  const log = project.dateLog ?? [];

  const start = (
    field: ProjectDateField,
    iso: string | null,
    stageKey: ProjectStageKey | null = null,
  ) => {
    setPendingField(field);
    setPendingStage(field === "target" ? (stageKey ?? stage) : null);
    setPendingIso(iso);
    setReason("");
  };

  const cancel = () => {
    setPendingField(null);
    setPendingStage(null);
    setPendingIso(null);
    setReason("");
  };

  const save = () => {
    if (!pendingField) return;
    onCommitDate(pendingField, pendingIso, reason.trim(), pendingStage ?? undefined);
    cancel();
  };

  const inputValue = (
    field: ProjectDateField,
    current: string | null | undefined,
    stageKey: ProjectStageKey | null = null,
  ) =>
    pendingField === field && (field !== "target" || pendingStage === (stageKey ?? stage))
      ? toDateInputValue(pendingIso)
      : toDateInputValue(current);

  const pendingLabel =
    pendingField === "delivery"
      ? "delivery"
      : pendingStage
        ? `${stageLabel(pendingStage)} target`
        : "stage due";

  return (
    <div className={styles.dates}>
      {/* Delivery first — it's the #1 date until dispatch is complete. */}
      <div className={styles.drow}>
        <span className={styles.dk}>
          <Truck size={13} /> Delivery
        </span>
        <input
          type="date"
          value={inputValue("delivery", project.deliveryDate)}
          onChange={(event) => start("delivery", fromDateInputValue(event.target.value))}
        />
        {project.deliveryDate ? (
          <span className={`${styles.dchip} ${toneClass(delivery.tone)}`}>{delivery.label}</span>
        ) : pendingField !== "delivery" ? (
          <span className={styles.mutedHint}>not set</span>
        ) : null}
      </div>
      <div className={styles.drow}>
        <span className={styles.dk}>
          <Calendar size={13} /> Stage due
        </span>
        <input
          type="date"
          value={inputValue("target", getStageTarget(project, stage))}
          onChange={(event) => start("target", fromDateInputValue(event.target.value), stage)}
        />
        <span className={`${styles.dchip} ${toneClass(status.tone)}`}>{status.label}</span>
      </div>
      <div>
        <button type="button" className={styles.undo} onClick={() => setShowTargets((v) => !v)}>
          <Calendar size={12} /> Stage targets
        </button>
        {showTargets
          ? STAGES.filter((s) => s.key !== "closed").map((s) => (
              <div className={styles.drow} key={s.key}>
                <span className={styles.dk} style={s.key === stage ? undefined : { opacity: 0.7 }}>
                  {s.label}
                </span>
                <input
                  type="date"
                  value={inputValue("target", getStageTarget(project, s.key), s.key)}
                  onChange={(event) =>
                    start("target", fromDateInputValue(event.target.value), s.key)
                  }
                />
                {s.key === stage ? (
                  <span className={`${styles.dchip} ${toneClass(status.tone)}`}>current</span>
                ) : null}
              </div>
            ))
          : null}
      </div>
      {pendingField ? (
        <div className={styles.datereason}>
          <label>Reason for changing the {pendingLabel} date — this is recorded</label>
          <input
            type="text"
            autoFocus
            value={reason}
            placeholder="e.g. customer pushed install week / supplier delay"
            onChange={(event) => setReason(event.target.value)}
          />
          <div className={styles.formacts}>
            <button
              type="button"
              className={styles.primary}
              disabled={!reason.trim()}
              onClick={save}
            >
              <Check size={14} /> Save change
            </button>
            <button type="button" className={styles.ghost} onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {log.length > 0 ? (
        <div className={styles.datelog}>
          <button type="button" className={styles.undo} onClick={() => setShowLog((v) => !v)}>
            <History size={12} /> Date history ({log.length})
          </button>
          {showLog
            ? log
                .slice()
                .reverse()
                .map((entry, index) => (
                  <div className={styles.logrow} key={index}>
                    <span className={styles.lf}>
                      {entry.field === "target"
                        ? entry.stage
                          ? `${stageLabel(entry.stage)} target`
                          : "Stage due"
                        : "Delivery"}
                    </span>{" "}
                    {entry.from ? formatDate(entry.from) : "—"} → {formatDate(entry.to)}
                    <div className={styles.lr}>
                      “{entry.reason || "no reason given"}” · {entry.by} ·{" "}
                      {formatDateTime(entry.at)}
                    </div>
                  </div>
                ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

function BlockPanel({
  project,
  onSetProjectBlocked,
}: {
  project: Project;
  onSetProjectBlocked: (blocked: boolean, reason: string) => void;
}) {
  const [form, setForm] = useState(false);
  const [reason, setReason] = useState("");

  if (isProjectBlocked(project)) {
    return (
      <div className={styles.projblock}>
        <AlertTriangle size={14} style={{ flex: "0 0 auto" }} />
        <span style={{ flex: 1 }}>
          Project blocked{project.blockedReason ? ` — ${project.blockedReason}` : ""}
        </span>
        <button type="button" className={styles.b} onClick={() => onSetProjectBlocked(false, "")}>
          <Unlock size={13} /> Unblock
        </button>
      </div>
    );
  }

  if (!form) {
    return (
      <button
        type="button"
        className={`${styles.b} ${styles.warn}`}
        style={{ marginTop: 9 }}
        onClick={() => setForm(true)}
      >
        <Lock size={13} /> Flag project blocked
      </button>
    );
  }

  return (
    <div className={styles.datereason} style={{ marginTop: 9 }}>
      <label>Reason the project is blocked — this is recorded</label>
      <input
        type="text"
        autoFocus
        value={reason}
        placeholder="e.g. waiting on customer approval / site not ready"
        onChange={(event) => setReason(event.target.value)}
      />
      <div className={styles.formacts}>
        <button
          type="button"
          className={styles.primary}
          disabled={!reason.trim()}
          onClick={() => {
            onSetProjectBlocked(true, reason.trim());
            setForm(false);
            setReason("");
          }}
        >
          <Lock size={14} /> Flag blocked
        </button>
        <button type="button" className={styles.ghost} onClick={() => setForm(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ActivityPanel({
  entries,
  defaultOpen = false,
}: {
  entries: ProjectActivityEntry[];
  defaultOpen?: boolean;
}) {
  const [show, setShow] = useState(defaultOpen);
  const panelRef = useRef<HTMLDivElement>(null);

  // Jump-ins from BaajBoard land with this section open — bring it into view.
  useEffect(() => {
    if (defaultOpen) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (entries.length === 0) return null;

  return (
    <div ref={panelRef} className={styles.datelog} style={{ marginTop: 18 }}>
      <button type="button" className={styles.undo} onClick={() => setShow((v) => !v)}>
        <History size={12} /> Activity ({entries.length})
      </button>
      {show
        ? entries
            .slice()
            .reverse()
            .map((entry, index) => (
              <div className={styles.logrow} key={index}>
                {describeActivity(entry)}
                <div className={styles.lr}>
                  {entry.by || "unknown"} · {formatDateTime(entry.at)}
                </div>
              </div>
            ))
        : null}
    </div>
  );
}

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

function LinkedJobsSection({
  jobs,
  minutesByJobId,
  readOnly,
  onCreateJob,
  onEditJob,
}: {
  jobs: Job[];
  minutesByJobId: Record<string, number>;
  readOnly: boolean;
  onCreateJob: () => void;
  onEditJob: (job: Job) => void;
}) {
  return (
    <>
      <div className={styles.sectitle} style={{ marginTop: 18 }}>
        <span>Jobs under this project</span>
        <span style={{ color: "var(--faint)" }}>{jobs.length}</span>
      </div>
      <div className={styles.sectip}>
        Jobs are worker work orders — workers log their time against them. Hours below come straight
        from synced work logs.
      </div>
      {jobs.length === 0 ? (
        <div className={styles.mutedHint} style={{ marginBottom: 8 }}>
          No jobs created for this project yet.
        </div>
      ) : (
        jobs.map((job) => {
          const minutes = minutesByJobId[job.jobId] ?? 0;
          return (
            <div key={job.id} className={styles.jobrow} onClick={() => onEditJob(job)}>
              <Briefcase size={15} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={styles.jobname}>{job.jobName || job.jobId}</div>
                <div className={styles.jobmeta}>
                  <span className={styles.mono}>{job.jobId}</span>
                  {" · "}
                  {job.isActive ? "active" : "inactive"}
                </div>
              </div>
              <span
                className={styles.pill}
                style={{
                  background: minutes > 0 ? "var(--ok-soft)" : "var(--col)",
                  color: minutes > 0 ? "var(--ok)" : "var(--faint)",
                }}
              >
                <Clock size={11} /> {formatMinutes(minutes)}
              </span>
            </div>
          );
        })
      )}
      {!readOnly ? (
        <button
          type="button"
          className={styles.b}
          style={{ marginTop: 4 }}
          onClick={() => onCreateJob()}
        >
          <Plus size={13} /> New job for this project
        </button>
      ) : null}
    </>
  );
}

const describeSalesOrder = (so: Pick<ProjectSalesOrder, "soNumber" | "label">): string =>
  so.label ? `${so.soNumber} — ${so.label}` : so.soNumber;

function makeSalesOrderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `so-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function SalesOrdersSection({
  salesOrders,
  linkedJobs,
  readOnly,
  allowNewJob,
  showBuildWarning,
  onChange,
  onCreateJob,
}: {
  salesOrders: ProjectSalesOrder[];
  linkedJobs: Job[];
  readOnly: boolean;
  /** Jobs are created from Build onward. */
  allowNewJob: boolean;
  /** Current stage is Build — nudge about sales orders still missing a job. */
  showBuildWarning: boolean;
  onChange: (next: ProjectSalesOrder[], change: { from: string; to: string }) => void;
  onCreateJob: (salesOrder: ProjectSalesOrder) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [soNumber, setSoNumber] = useState("");
  const [label, setLabel] = useState("");

  // One sales order can have several jobs (e.g. split across crews).
  const jobsFor = (so: ProjectSalesOrder) => linkedJobs.filter((job) => job.salesOrderId === so.id);

  const openForm = (so?: ProjectSalesOrder) => {
    setAdding(!so);
    setEditingId(so?.id ?? null);
    setSoNumber(so?.soNumber ?? "");
    setLabel(so?.label ?? "");
  };

  const closeForm = () => {
    setAdding(false);
    setEditingId(null);
  };

  const submit = () => {
    const number = soNumber.trim();
    if (!number) return;

    if (editingId) {
      const prev = salesOrders.find((so) => so.id === editingId);
      if (prev) {
        const next = { ...prev, soNumber: number, label: label.trim() };
        onChange(
          salesOrders.map((so) => (so.id === editingId ? next : so)),
          { from: describeSalesOrder(prev), to: describeSalesOrder(next) },
        );
      }
    } else {
      const so: ProjectSalesOrder = {
        id: makeSalesOrderId(),
        soNumber: number,
        label: label.trim(),
      };
      onChange([...salesOrders, so], { from: "", to: describeSalesOrder(so) });
    }

    closeForm();
  };

  const remove = (so: ProjectSalesOrder) => {
    const linked = jobsFor(so);
    const confirmed = window.confirm(
      linked.length > 0
        ? `${linked.length} job${linked.length === 1 ? " is" : "s are"} linked to ${so.soNumber} — the jobs keep their link but will show as unmatched. Remove the sales order?`
        : `Remove sales order ${so.soNumber}?`,
    );
    if (!confirmed) return;

    onChange(
      salesOrders.filter((item) => item.id !== so.id),
      { from: describeSalesOrder(so), to: "" },
    );
  };

  const missingJobs = salesOrders.filter((so) => jobsFor(so).length === 0).length;

  return (
    <>
      <div className={styles.sectitle} style={{ marginTop: 18 }}>
        <span>Sales orders</span>
        <span style={{ color: "var(--faint)" }}>{salesOrders.length}</span>
      </div>
      <div className={styles.sectip}>
        One per building / plant, recorded at Handover. From Build, each sales order gets its own
        job for workers to log time against.
      </div>

      {showBuildWarning && missingJobs > 0 ? (
        <div className={styles.mutedHint} style={{ color: "var(--warn)", marginBottom: 8 }}>
          <AlertTriangle size={12} /> {missingJobs} sales order{missingJobs === 1 ? "" : "s"} have
          no job yet.
        </div>
      ) : null}

      {salesOrders.length === 0 ? (
        <div className={styles.mutedHint} style={{ marginBottom: 8 }}>
          No sales orders recorded yet.
        </div>
      ) : (
        salesOrders.map((so) => {
          const linked = jobsFor(so);

          if (editingId === so.id) {
            return (
              <div key={so.id} className={styles.signform}>
                <label>Sales order no.</label>
                <input
                  type="text"
                  value={soNumber}
                  onChange={(event) => setSoNumber(event.target.value)}
                />
                <label style={{ marginTop: 8 }}>Building / plant (optional)</label>
                <input
                  type="text"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
                <div className={styles.formacts}>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={soNumber.trim() === ""}
                    onClick={submit}
                  >
                    <Check size={14} /> Save
                  </button>
                  <button type="button" className={styles.ghost} onClick={closeForm}>
                    Cancel
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={so.id} className={styles.jobrow} style={{ cursor: "default" }}>
              <FileText size={15} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={`${styles.jobname} ${styles.mono}`}>{so.soNumber}</div>
                {so.label ? <div className={styles.jobmeta}>{so.label}</div> : null}
              </div>
              <span
                className={styles.pill}
                style={{
                  background: linked.length > 0 ? "var(--ok-soft)" : "var(--col)",
                  color: linked.length > 0 ? "var(--ok)" : "var(--faint)",
                }}
                title={linked.map((job) => job.jobId).join(", ") || undefined}
              >
                <Briefcase size={11} />{" "}
                {linked.length === 0
                  ? "no job"
                  : linked.length === 1
                    ? linked[0].jobId
                    : `${linked.length} jobs`}
              </span>
              {!readOnly ? (
                <>
                  {allowNewJob ? (
                    <button type="button" className={styles.undo} onClick={() => onCreateJob(so)}>
                      <Plus size={12} /> New job
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.undo}
                    aria-label={`Edit sales order ${so.soNumber}`}
                    onClick={() => openForm(so)}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className={styles.undo}
                    aria-label={`Remove sales order ${so.soNumber}`}
                    onClick={() => remove(so)}
                  >
                    <X size={12} />
                  </button>
                </>
              ) : null}
            </div>
          );
        })
      )}

      {!readOnly ? (
        adding ? (
          <div className={styles.signform}>
            <label>Sales order no.</label>
            <input
              type="text"
              autoFocus
              value={soNumber}
              placeholder="e.g. 84121"
              onChange={(event) => setSoNumber(event.target.value)}
            />
            <label style={{ marginTop: 8 }}>Building / plant (optional)</label>
            <input
              type="text"
              value={label}
              placeholder="e.g. Plant room B"
              onChange={(event) => setLabel(event.target.value)}
            />
            <div className={styles.formacts}>
              <button
                type="button"
                className={styles.primary}
                disabled={soNumber.trim() === ""}
                onClick={submit}
              >
                <Check size={14} /> Add sales order
              </button>
              <button type="button" className={styles.ghost} onClick={closeForm}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={styles.b}
            style={{ marginTop: 4 }}
            onClick={() => openForm()}
          >
            <Plus size={13} /> Add sales order
          </button>
        )
      ) : null}
    </>
  );
}

export default function ProjectDrawer({
  project,
  linkedJobs,
  minutesByJobId,
  currentUserName,
  initialFocus = null,
  openTrade,
  setOpenTrade,
  onClose,
  onEditDetails,
  onCreateJob,
  onEditJob,
  onSalesOrdersChange,
  onMoveStage,
  onSignCriterion,
  onUnsignCriterion,
  onSignSub,
  onUnsignSub,
  onSetTradeState,
  onSetBlocked,
  onSetReason,
  onSetProjectBlocked,
  onCommitDate,
}: ProjectDrawerProps) {
  const stage = getStage(project);
  const idx = stageIndex(stage);
  const [viewKey, setViewKey] = useState<ProjectStageKey>(stage);
  const viewIdx = stageIndex(viewKey);
  const isCurrent = viewKey === stage;
  const readOnly = !isCurrent;
  const isBuild = viewKey === "build";
  const showJobs = viewIdx >= stageIndex("build");
  const terminal = idx === STAGES.length - 1;
  const criteria = criteriaForProject(project, viewKey);
  const [gd, gt] = gateProgress(project, viewKey);
  const ready = stageComplete(project);
  const nextLabel = STAGES[idx + 1]?.label ?? null;
  const gates = getGates(project);
  const trades = getTrades(project);
  const applicableTrades = tradesForProject(project);
  const blocked = isProjectBlocked(project);
  const totalMinutes = linkedJobs.reduce((sum, job) => sum + (minutesByJobId[job.jobId] ?? 0), 0);

  // Portal to <body>: the panel backdrop's `backdrop-filter` creates a
  // containing block that would re-anchor position:fixed to its scrolled
  // content instead of the viewport. The `styles.root` wrapper re-scopes the
  // board's CSS variables and control styles, which don't reach <body>.
  return createPortal(
    <div className={styles.root}>
      <div className={styles.scrim} onClick={onClose} />
      <div className={styles.drawer}>
        <div className={styles.dhead}>
          <div className={styles.dtop}>
            <div>
              <h2>{project.customerName || "Untitled project"}</h2>
              <div className={`${styles.ref} ${styles.mono}`} style={{ marginTop: 3 }}>
                {project.projectRef || "—"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className={styles.close}
                onClick={onEditDetails}
                aria-label="Edit project details"
                title="Edit project details"
              >
                <Pencil size={16} />
              </button>
              <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className={styles.facts}>
            <div className={styles.fact}>
              <div className={styles.k}>Value</div>
              <div className={`${styles.v} ${styles.mono}`}>{project.value || "—"}</div>
            </div>
            <div className={styles.fact}>
              <div className={styles.k}>Type</div>
              <div className={styles.v}>
                {projectTypeLabel(project.projectType)}
                {hasControlPanel(project) ? " · panel" : ""}
              </div>
            </div>
            <div className={styles.fact}>
              <div className={styles.k}>Stage</div>
              <div className={styles.v}>{STAGES[idx].label}</div>
            </div>
            {linkedJobs.length > 0 ? (
              <div className={styles.fact}>
                <div className={styles.k}>Logged</div>
                <div className={`${styles.v} ${styles.mono}`}>{formatMinutes(totalMinutes)}</div>
              </div>
            ) : null}
          </div>
          <DatesPanel
            project={project}
            defaultShowLog={initialFocus === "dates"}
            onCommitDate={onCommitDate}
          />
          <BlockPanel project={project} onSetProjectBlocked={onSetProjectBlocked} />
        </div>

        <div className={styles.stepwrap}>
          <div className={styles.stepline}>Tap a completed stage to review its sign-offs</div>
          <div className={styles.steps}>
            {STAGES.map((s, i) => (
              <div
                key={s.key}
                title={s.label}
                onClick={() => i <= idx && setViewKey(s.key)}
                className={[
                  styles.s,
                  i < idx ? styles.done : i === idx ? styles.cur : "",
                  i <= idx ? styles.clk : "",
                  s.key === viewKey ? styles.view : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            ))}
          </div>
        </div>

        <div className={styles.body}>
          {readOnly ? (
            <div className={styles.auditbanner}>
              <FileText size={14} /> Audit view · {STAGES[viewIdx].label} — read only.
              <button
                type="button"
                className={styles.undo}
                style={{ marginLeft: "auto" }}
                onClick={() => setViewKey(stage)}
              >
                Back to current
              </button>
            </div>
          ) : null}

          {criteria.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
              {viewKey === "closed"
                ? "Project closed. All stage gates cleared and signed off."
                : "No sign-offs required at this stage for this project type — advance when ready."}
            </div>
          ) : (
            <>
              <div className={styles.sectitle}>
                <span>Exit criteria · {STAGES[viewIdx].label}</span>
                <span style={{ color: gd === gt ? "var(--ok)" : "var(--faint)" }}>
                  {gd}/{gt} signed off
                </span>
              </div>
              <div className={styles.sectip}>
                Each item has a responsible owner. Attach a document link, add a comment, or both —
                a comment is required when no document is attached. The record is kept for audit.
              </div>
              {criteria.map((criterion) => (
                <CriterionRow
                  key={criterion.id}
                  criterion={criterion}
                  defaultBy={currentUserName}
                  rec={
                    criterion.auto
                      ? criterionMet(project, viewKey, criterion)
                        ? ({ by: "", at: "", comment: "" } as ProjectSignOff)
                        : null
                      : (gates[viewKey]?.[criterion.id] ?? null)
                  }
                  onSign={(signoff) => onSignCriterion(viewKey, criterion.id, signoff)}
                  onUnsign={() => onUnsignCriterion(viewKey, criterion.id)}
                  readOnly={readOnly}
                />
              ))}

              {isBuild ? (
                <>
                  <div className={styles.sectitle} style={{ marginTop: 18 }}>
                    <span>Trades &amp; sub-steps</span>
                  </div>
                  <div className={styles.sectip}>
                    Trades shown match this project&apos;s type and control-panel scope. Each
                    sub-step is verified and signed by the trade&apos;s responsible person.
                  </div>
                  {applicableTrades.length === 0 ? (
                    <div className={styles.mutedHint} style={{ marginBottom: 8 }}>
                      No workshop trades apply to this project type — the trades gate clears
                      automatically.
                    </div>
                  ) : (
                    applicableTrades.map((def) => (
                      <TradeRow
                        key={def.key}
                        def={def}
                        trade={trades[def.key]}
                        defaultBy={currentUserName}
                        readOnly={readOnly}
                        open={openTrade === def.key}
                        onToggle={() => setOpenTrade(openTrade === def.key ? "" : def.key)}
                        onSignSub={(index, signoff) => onSignSub(def.key, index, signoff)}
                        onUnsignSub={(index) => onUnsignSub(def.key, index)}
                        onState={(state) => onSetTradeState(def.key, state)}
                        onBlock={(blocked) => onSetBlocked(def.key, blocked)}
                        onReason={(reason) => onSetReason(def.key, reason)}
                      />
                    ))
                  )}
                </>
              ) : null}
            </>
          )}

          <SalesOrdersSection
            salesOrders={project.salesOrders ?? []}
            linkedJobs={linkedJobs}
            readOnly={readOnly}
            allowNewJob={showJobs}
            showBuildWarning={stage === "build"}
            onChange={onSalesOrdersChange}
            onCreateJob={onCreateJob}
          />

          {showJobs ? (
            <LinkedJobsSection
              jobs={linkedJobs}
              minutesByJobId={minutesByJobId}
              readOnly={readOnly}
              onCreateJob={onCreateJob}
              onEditJob={onEditJob}
            />
          ) : null}

          <ActivityPanel
            entries={project.activityLog ?? []}
            defaultOpen={initialFocus === "activity"}
          />
        </div>

        <div className={styles.foota}>
          {isCurrent ? (
            <>
              <button
                type="button"
                className={styles.ghost}
                disabled={idx === 0}
                onClick={() => onMoveStage(-1)}
              >
                <ArrowLeft size={15} /> Send back
              </button>
              <div style={{ flex: 1 }} />
              {blocked && !terminal ? (
                <span className={styles.lockmsg}>
                  <AlertTriangle size={12} /> Project blocked
                </span>
              ) : !ready && !terminal ? (
                <span className={styles.lockmsg}>
                  <Lock size={12} /> Steps not complete
                </span>
              ) : null}
              {!terminal ? (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!ready || blocked}
                  onClick={() => onMoveStage(1)}
                >
                  Advance to {nextLabel} <ArrowRight size={15} />
                </button>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              className={styles.ghost}
              style={{ marginLeft: "auto" }}
              onClick={() => setViewKey(stage)}
            >
              <ArrowRight size={15} /> Back to current stage
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
