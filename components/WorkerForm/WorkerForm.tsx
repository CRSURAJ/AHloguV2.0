"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./WorkerForm.module.css";

type WorkerFormProps = {
  fullNameOptions: string[];
  fullname: string;
  setFullname: (value: string) => void;
  jobId: string;
  setJobId: (value: string) => void;
  role: string;
  setRole: (value: string) => void;
  location: string;
  setLocation: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  isWorking: boolean;
  isOnBreak: boolean;
};

export default function WorkerForm({
  fullNameOptions,
  fullname,
  setFullname,
  jobId,
  setJobId,
  role,
  setRole,
  location,
  setLocation,
  description,
  setDescription,
  isWorking,
  isOnBreak,
}: WorkerFormProps) {
  const [isNameOpen, setIsNameOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const cleanedOptions = useMemo(() => {
    return fullNameOptions.filter((option) => option.trim() !== "");
  }, [fullNameOptions]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) {
        setIsNameOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsNameOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleSelectName = (value: string) => {
    setFullname(value);
    setIsNameOpen(false);
  };

  const descriptionDisabled = !isWorking || isOnBreak;

  return (
    <div className={styles.formWrap}>
      <div className={styles.fieldGrid}>
        <div className={styles.field}>
          <label className={styles.label}>Full Name *</label>

          <div
            ref={dropdownRef}
            className={`${styles.customSelectWrap} ${
              isNameOpen ? styles.customSelectWrapOpen : ""
            }`}
          >
            <button
              type="button"
              className={`${styles.customSelectButton} ${
                fullname ? styles.hasValue : styles.placeholderState
              }`}
              onClick={() => !isWorking && setIsNameOpen((prev) => !prev)}
              disabled={isWorking}
              aria-haspopup="listbox"
              aria-expanded={isNameOpen}
            >
              <span className={styles.customSelectText}>
                {fullname || "Select your name"}
              </span>
              <span
                className={`${styles.chevron} ${
                  isNameOpen ? styles.chevronOpen : ""
                }`}
                aria-hidden="true"
              >
                ▼
              </span>
            </button>

            {isNameOpen && !isWorking && (
              <div className={styles.optionsPanel} role="listbox">
                {cleanedOptions.length > 0 ? (
                  cleanedOptions.map((option) => {
                    const isSelected = option === fullname;

                    return (
                      <button
                        key={option}
                        type="button"
                        className={`${styles.optionItem} ${
                          isSelected ? styles.optionSelected : ""
                        }`}
                        onClick={() => handleSelectName(option)}
                      >
                        {option}
                      </button>
                    );
                  })
                ) : (
                  <div className={styles.optionEmpty}>No names available</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Job ID *</label>
          <input
            className={styles.input}
            type="text"
            placeholder="Enter job ID"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            disabled={isWorking}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Role *</label>
          <input
            className={styles.input}
            type="text"
            placeholder="Plumber / Electrician / Technician"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={isWorking}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Location *</label>
          <input
            className={styles.input}
            type="text"
            placeholder="Warehouse / Site Address"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={isWorking}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description *</label>
        <div className={styles.textareaWrap}>
          <textarea
            className={styles.textarea}
            placeholder={
              !isWorking
                ? "Description becomes available after you Start a job"
                : isOnBreak
                  ? "Resume work to continue description"
                  : "What did you work on today?"
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={descriptionDisabled}
            rows={5}
          />
          <div className={styles.charCount}>{description.length}</div>
        </div>
      </div>
    </div>
  );
}
