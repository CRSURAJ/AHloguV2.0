"use client";

import { useEffect, useMemo, useState } from "react";
import { getCloudProvider } from "@/lib/cloud/client";
import { formatMelbourneDateTime } from "@/lib/melbourneTime";
import type { AdminWorkLog } from "@/types/work";
import styles from "./AdminWorkLogsPanel.module.css";

const PAGE_SIZE = 50;

type AdminWorkLogsPanelProps = {
  onClose: () => void;
};

type EditableField =
  | "startedAt"
  | "stoppedAt"
  | "jobId"
  | "description"
  | "location"
  | "breakMinutes"
  | "stickyNote";

function formatDateTime(value: string): string {
  return formatMelbourneDateTime(value);
}

function toDateTimeLocalInput(value: string): string {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}`;
}

function fromDateTimeLocalInput(value: string): string {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toISOString();
}

function calculateWorkedMinutes(
  startedAt: string,
  stoppedAt: string,
  breakMinutes: number
): number {
  const startMs = Date.parse(startedAt);
  const stopMs = Date.parse(stoppedAt);

  if (!Number.isFinite(startMs) || !Number.isFinite(stopMs)) return 0;

  const grossMinutes = Math.max(0, Math.round((stopMs - startMs) / 60_000));

  return Math.max(0, grossMinutes - Math.max(0, Number(breakMinutes || 0)));
}


function matchesDateRange(log: AdminWorkLog, fromDate: string, toDate: string) {
  if (!fromDate && !toDate) return true;

  const candidate = log.startedAt || log.stoppedAt || log.syncedAt;
  const candidateMs = Date.parse(candidate);

  if (!Number.isFinite(candidateMs)) return false;

  if (fromDate) {
    const fromMs = new Date(`${fromDate}T00:00:00`).getTime();
    if (candidateMs < fromMs) return false;
  }

  if (toDate) {
    const toMs = new Date(`${toDate}T23:59:59`).getTime();
    if (candidateMs > toMs) return false;
  }

  return true;
}

function searchableText(log: AdminWorkLog): string {
  return [
    log.syncedAt,
    log.startedAt,
    log.stoppedAt,
    log.jobId,
    log.fullname,
    log.role,
    log.description,
    log.location,
    log.workedMinutes,
    log.breakMinutes,
    log.stickyNote,
  ]
    .join(" ")
    .toLowerCase();
}

function getEditableValue(log: AdminWorkLog, field: EditableField): string {
  const value = log[field];

  if (typeof value === "number") return String(value);
  return value ?? "";
}

export default function AdminWorkLogsPanel({ onClose }: AdminWorkLogsPanelProps) {
  const [logs, setLogs] = useState<AdminWorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [jobIdFilter, setJobIdFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminWorkLog | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function loadWorkLogs() {
    try {
      setIsLoading(true);
      setMessage("");

      const data = await getCloudProvider().workLogs.list();
      setLogs(data);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Could not load work logs.";

      setMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkLogs();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [jobIdFilter, nameFilter, searchFilter, fromDate, toDate]);

  const filteredLogs = useMemo(() => {
    const jobNeedle = jobIdFilter.trim().toLowerCase();
    const nameNeedle = nameFilter.trim().toLowerCase();
    const searchNeedle = searchFilter.trim().toLowerCase();

    return logs.filter((log) => {
      if (jobNeedle && !log.jobId.toLowerCase().includes(jobNeedle)) {
        return false;
      }

      if (nameNeedle && !log.fullname.toLowerCase().includes(nameNeedle)) {
        return false;
      }

      if (searchNeedle && !searchableText(log).includes(searchNeedle)) {
        return false;
      }

      return matchesDateRange(log, fromDate, toDate);
    });
  }, [fromDate, jobIdFilter, logs, nameFilter, searchFilter, toDate]);

  const totalWorkedMinutes = useMemo(
    () =>
      filteredLogs.reduce(
        (total, log) => total + Number(log.workedMinutes || 0),
        0
      ),
    [filteredLogs]
  );

  const totalWorkedHours = totalWorkedMinutes / 60;
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));

  const pagedLogs = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * PAGE_SIZE;

    return filteredLogs.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredLogs, page, totalPages]);

  function startEdit(log: AdminWorkLog) {
    setEditingId(log.id);
    setDraft({ ...log });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function updateDraft(field: EditableField, value: string) {
    setDraft((current) => {
      if (!current) return current;

      const next: AdminWorkLog = {
        ...current,
        [field]:
          field === "breakMinutes"
            ? Number(value || 0)
            : field === "startedAt" || field === "stoppedAt"
              ? fromDateTimeLocalInput(value)
              : value,
      };

      next.workedMinutes = calculateWorkedMinutes(
        next.startedAt,
        next.stoppedAt,
        next.breakMinutes
      );

      return next;
    });
  }

  async function saveEdit() {
    if (!draft) return;

    try {
      setSavingId(draft.id);
      setMessage("");

      const result = await getCloudProvider().workLogs.update(draft);

      if (!result.ok) {
        throw new Error(result.message || "Could not update work log.");
      }

      setLogs((current) =>
        current.map((item) => (item.id === draft.id ? { ...draft } : item))
      );
      cancelEdit();
      setMessage("Work log updated.");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Could not update work log.";

      setMessage(errorMessage);
    } finally {
      setSavingId(null);
    }
  }

  async function exportXlsx() {
    const XLSX = await import("xlsx");

    const rows = filteredLogs.map((log) => ({
      "Synced time": formatDateTime(log.syncedAt),
      "Job start time": formatDateTime(log.startedAt),
      "Job stopped time": formatDateTime(log.stoppedAt),
      "Job ID": log.jobId,
      "Full name": log.fullname,
      Role: log.role,
      "Work description": log.description,
      Location: log.location,
      "Worked minutes": log.workedMinutes,
      "Break minutes": log.breakMinutes,
      "Sticky note": log.stickyNote,
    }));

    rows.push({
      "Synced time": "",
      "Job start time": "",
      "Job stopped time": "",
      "Job ID": "",
      "Full name": "",
      Role: "",
      "Work description": "",
      Location: "",
      "Worked minutes": totalWorkedMinutes,
      "Break minutes": 0,
      "Sticky note": `Displayed total worked hours: ${totalWorkedHours.toFixed(2)}`,
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Work Logs");
    XLSX.writeFile(workbook, "AHlogu-work-logs.xlsx");
  }

  function renderEditableCell(log: AdminWorkLog, field: EditableField) {
    const isEditing = editingId === log.id && draft;

    if (!isEditing) {
      if (field === "startedAt" || field === "stoppedAt") {
        return formatDateTime(String(log[field] || ""));
      }

      return String(log[field] ?? "");
    }

    const value = getEditableValue(draft, field);

    if (field === "startedAt" || field === "stoppedAt") {
      return (
        <input
          className={styles.dateTimeInput}
          type="datetime-local"
          value={toDateTimeLocalInput(value)}
          onChange={(event) => updateDraft(field, event.target.value)}
        />
      );
    }

    if (field === "description" || field === "stickyNote") {
      return (
        <textarea
          className={styles.textarea}
          value={value}
          onChange={(event) => updateDraft(field, event.target.value)}
        />
      );
    }

    if (field === "breakMinutes") {
      return (
        <input
          className={styles.input}
          type="number"
          min="0"
          value={value}
          onChange={(event) => updateDraft(field, event.target.value)}
        />
      );
    }

    return (
      <input
        className={styles.input}
        value={value}
        onChange={(event) => updateDraft(field, event.target.value)}
      />
    );
  }

  return (
    <div className={styles.backdrop}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Work Logs</h2>
            <p className={styles.subtitle}>
              Review, filter, edit, and export synced worker logs.
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void loadWorkLogs()}
            >
              Refresh
            </button>

            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => void exportXlsx()}
              disabled={filteredLogs.length === 0}
            >
              Export .xlsx
            </button>

            <button className={styles.closeButton} type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className={styles.filters}>
          <label>
            <span>Job ID</span>
            <input
              value={jobIdFilter}
              onChange={(event) => setJobIdFilter(event.target.value)}
              placeholder="Filter job ID"
            />
          </label>

          <label>
            <span>Full name</span>
            <input
              value={nameFilter}
              onChange={(event) => setNameFilter(event.target.value)}
              placeholder="Filter name"
            />
          </label>

          <label>
            <span>Search all columns</span>
            <input
              value={searchFilter}
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder="Search..."
            />
          </label>

          <label>
            <span>From date</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>

          <label>
            <span>To date</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
        </div>

        {message ? <p className={styles.message}>{message}</p> : null}

        <div className={styles.metaBar}>
          <span>
            Showing {pagedLogs.length} of {filteredLogs.length} filtered logs
          </span>
          <strong>Displayed total worked hours: {totalWorkedHours.toFixed(2)}</strong>
        </div>

        {isLoading ? (
          <p className={styles.emptyText}>Loading work logs...</p>
        ) : filteredLogs.length === 0 ? (
          <p className={styles.emptyText}>No work logs match the filters.</p>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Synced time</th>
                    <th>Job start time</th>
                    <th>Job stopped time</th>
                    <th>Job ID</th>
                    <th>Full name</th>
                    <th>Role</th>
                    <th>Work description</th>
                    <th>Location</th>
                    <th>Worked minutes</th>
                    <th>Break minutes</th>
                    <th>Sticky note</th>
                    <th>Edit</th>
                  </tr>
                </thead>

                <tbody>
                  {pagedLogs.map((log) => {
                    const isEditing = editingId === log.id;

                    return (
                      <tr
                        key={log.id}
                        className={isEditing ? styles.editingRow : undefined}
                      >
                        <td>{formatDateTime(log.syncedAt)}</td>
                        <td>{renderEditableCell(log, "startedAt")}</td>
                        <td>{renderEditableCell(log, "stoppedAt")}</td>
                        <td>{renderEditableCell(log, "jobId")}</td>
                        <td>{log.fullname}</td>
                        <td>{log.role}</td>
                        <td>{renderEditableCell(log, "description")}</td>
                        <td>{renderEditableCell(log, "location")}</td>
                        <td>{isEditing && draft ? draft.workedMinutes : log.workedMinutes}</td>
                        <td>{renderEditableCell(log, "breakMinutes")}</td>
                        <td>{renderEditableCell(log, "stickyNote")}</td>
                        <td>
                          {isEditing ? (
                            <div className={styles.rowActions}>
                              <button
                                type="button"
                                onClick={() => void saveEdit()}
                                disabled={savingId === log.id}
                              >
                                Save
                              </button>
                              <button type="button" onClick={cancelEdit}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => startEdit(log)}>
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.pagination}>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                Previous
              </button>

              <span>
                Page {Math.min(page, totalPages)} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
