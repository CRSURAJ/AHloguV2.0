"use client";

import { useEffect, useMemo, useState } from "react";
import { getCloudProvider } from "@/lib/cloud/client";
import {
  formatMelbourneDateTime,
  melbourneDateTimeLocalToIso,
  melbourneDayBoundaryMs,
} from "@/lib/melbourneTime";
import type { AdminWorkLog, PermissionLevel, WorkerRole } from "@/types/work";
import styles from "./AdminWorkLogsPanel.module.css";

const PAGE_SIZE = 50;

type AdminWorkLogsPanelProps = {
  onClose: () => void;
  currentPermissionLevel: PermissionLevel;
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

function formatMinutes(value: number | string | null | undefined): string {
  const minutes = Number(value ?? 0);

  if (!Number.isFinite(minutes)) {
    return "0 min";
  }

  return `${Math.max(0, Math.round(minutes))} min`;
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

  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}`;
}

function fromDateTimeLocalInput(value: string): string {
  if (!value) return "";

  // The edit form shows Melbourne wall-clock time, so the edited value must
  // be parsed as Melbourne time too — new Date(value) would use the admin's
  // browser timezone and silently shift the timestamps.
  return melbourneDateTimeLocalToIso(value);
}

function calculateWorkedMinutes(
  startedAt: string,
  stoppedAt: string,
  breakMinutes: number,
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
    const fromMs = melbourneDayBoundaryMs(fromDate, "start");
    if (Number.isFinite(fromMs) && candidateMs < fromMs) return false;
  }

  if (toDate) {
    const toMs = melbourneDayBoundaryMs(toDate, "end");
    if (Number.isFinite(toMs) && candidateMs > toMs) return false;
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

export default function AdminWorkLogsPanel({
  onClose,
  currentPermissionLevel,
}: AdminWorkLogsPanelProps) {
  const canManageWorkLogs = currentPermissionLevel === "admin";
  const [logs, setLogs] = useState<AdminWorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [jobIdFilter, setJobIdFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showArchivedJobLogs, setShowArchivedJobLogs] = useState(false);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminWorkLog | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadWorkLogs() {
    try {
      setIsLoading(true);
      setMessage("");

      const data = await getCloudProvider().workLogs.list();
      setLogs(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Could not load work logs.";

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
  }, [jobIdFilter, nameFilter, searchFilter, fromDate, toDate, showArchivedJobLogs]);

  function clearFilters() {
    setJobIdFilter("");
    setNameFilter("");
    setSearchFilter("");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  const filteredLogs = useMemo(() => {
    const archiveModeLogs = logs.filter((log) =>
      canManageWorkLogs && showArchivedJobLogs
        ? log.isJobArchived === true
        : log.isJobArchived !== true,
    );
    const jobNeedle = jobIdFilter.trim().toLowerCase();
    const nameNeedle = nameFilter.trim().toLowerCase();
    const searchNeedle = searchFilter.trim().toLowerCase();

    return archiveModeLogs.filter((log) => {
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
  }, [
    fromDate,
    jobIdFilter,
    logs,
    nameFilter,
    searchFilter,
    toDate,
    showArchivedJobLogs,
    canManageWorkLogs,
  ]);

  const totalWorkedMinutes = useMemo(
    () => filteredLogs.reduce((total, log) => total + Number(log.workedMinutes || 0), 0),
    [filteredLogs],
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
        next.breakMinutes,
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

      setLogs((current) => current.map((item) => (item.id === draft.id ? { ...draft } : item)));
      cancelEdit();
      setMessage("Work log updated.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Could not update work log.";

      setMessage(errorMessage);
    } finally {
      setSavingId(null);
    }
  }
  async function deleteWorkLog(log: AdminWorkLog) {
    const confirmed = window.confirm(
      `Are you sure you want to delete this work log?\n\nUser: ${log.fullname}\nJob ID: ${log.jobId}\nStarted: ${formatDateTime(log.startedAt)}`,
    );

    if (!confirmed) return;

    try {
      setDeletingId(log.id);
      setMessage("");

      const result = await getCloudProvider().workLogs.delete(log.id);

      if (!result.ok) {
        throw new Error(result.message || "Could not delete work log.");
      }

      setLogs((current) => current.filter((item) => item.id !== log.id));

      if (editingId === log.id) {
        cancelEdit();
      }

      setMessage("Work log deleted.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Could not delete work log.";
      setMessage(errorMessage);
    } finally {
      setDeletingId(null);
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
      Role: "" as WorkerRole,
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

      if (field === "breakMinutes") {
        return formatMinutes(log.breakMinutes);
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
          <button className={styles.clearFiltersButton} type="button" onClick={clearFilters}>
            Clear Fields
          </button>

          {canManageWorkLogs ? (
            <label className={styles.archiveSearchToggle}>
              <input
                type="checkbox"
                checked={showArchivedJobLogs}
                onChange={(event) => setShowArchivedJobLogs(event.target.checked)}
              />
              <span>Search Archived Job Logs</span>
            </label>
          ) : null}
          <label>
            <input
              value={jobIdFilter}
              onChange={(event) => setJobIdFilter(event.target.value)}
              placeholder="Search by Job ID"
            />
          </label>

          <label>
            <input
              value={nameFilter}
              onChange={(event) => setNameFilter(event.target.value)}
              placeholder="Search By Name"
            />
          </label>

          <label>
            <input
              value={searchFilter}
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder="Search by Keyword"
            />
          </label>

          <label>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>

          <label>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>

        {message ? <p className={styles.message}>{message}</p> : null}

        {canManageWorkLogs && showArchivedJobLogs ? (
          <p className={styles.archiveModeMessage}>
            Archived Job Logs Mode — showing logs linked to archived jobs only.
          </p>
        ) : null}

        <div className={styles.metaBar}>
          <span>
            Showing {pagedLogs.length} of {filteredLogs.length} work logs
          </span>
          <strong>Total Worked Hours: {totalWorkedHours.toFixed(2)}</strong>
        </div>

        {isLoading ? (
          <p className={styles.emptyText}>Loading work logs...</p>
        ) : filteredLogs.length === 0 ? (
          <p className={styles.emptyText}>No work logs found.</p>
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
                    <th>Worked</th>
                    <th>Break</th>
                    <th>Sticky note</th>
                    {canManageWorkLogs ? <th>Actions</th> : null}
                  </tr>
                </thead>

                <tbody>
                  {pagedLogs.map((log) => {
                    const isEditing = editingId === log.id;

                    return (
                      <tr key={log.id} className={isEditing ? styles.editingRow : undefined}>
                        <td>{formatDateTime(log.syncedAt)}</td>
                        <td>{renderEditableCell(log, "startedAt")}</td>
                        <td>{renderEditableCell(log, "stoppedAt")}</td>
                        <td>{renderEditableCell(log, "jobId")}</td>
                        <td>{log.fullname}</td>
                        <td>{log.role}</td>
                        <td>{renderEditableCell(log, "description")}</td>
                        <td>{renderEditableCell(log, "location")}</td>
                        <td>
                          {formatMinutes(
                            isEditing && draft ? draft.workedMinutes : log.workedMinutes,
                          )}
                        </td>
                        <td>{renderEditableCell(log, "breakMinutes")}</td>
                        <td>{renderEditableCell(log, "stickyNote")}</td>
                        {canManageWorkLogs ? (
                          <td>
                            {isEditing ? (
                              <div className={styles.rowActions}>
                                <button
                                  type="button"
                                  onClick={() => void saveEdit()}
                                  disabled={savingId === log.id || deletingId === log.id}
                                >
                                  Save
                                </button>

                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={savingId === log.id || deletingId === log.id}
                                >
                                  Cancel
                                </button>

                                <button
                                  className={styles.dangerButton}
                                  type="button"
                                  onClick={() => void deleteWorkLog(log)}
                                  disabled={savingId === log.id || deletingId === log.id}
                                >
                                  {deletingId === log.id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            ) : (
                              <div className={styles.rowActions}>
                                <button
                                  type="button"
                                  onClick={() => startEdit(log)}
                                  disabled={deletingId === log.id}
                                >
                                  Edit
                                </button>

                                <button
                                  className={styles.dangerButton}
                                  type="button"
                                  onClick={() => void deleteWorkLog(log)}
                                  disabled={deletingId === log.id}
                                >
                                  {deletingId === log.id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            )}
                          </td>
                        ) : null}
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
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
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
