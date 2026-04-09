import type { Dispatch, SetStateAction } from "react";
import styles from "./WorkLogger.module.css";

type WorkerFormProps = {
  fullNameOptions: string[];
  fullname: string;
  setFullname: Dispatch<SetStateAction<string>>;
  jobId: string;
  setJobId: Dispatch<SetStateAction<string>>;
  role: string;
  setRole: Dispatch<SetStateAction<string>>;
  location: string;
  setLocation: Dispatch<SetStateAction<string>>;
  description: string;
  setDescription: Dispatch<SetStateAction<string>>;
  isWorking: boolean;
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
}: WorkerFormProps) {
  return (
    <div className={styles.formFields}>
      <div className={styles.fieldGrid}>
        <div className={styles.field}>
          <label className={styles.label}>Full Name *</label>
          <select
            value={fullname}
            onChange={(e) => setFullname(e.target.value)}
            disabled={isWorking}
            className={styles.input}
          >
            <option value="">Select full name</option>
            {fullNameOptions
              .filter((name) => name !== "")
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Job ID *</label>
          <input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            disabled={isWorking}
            className={styles.input}
            placeholder="Enter job ID"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Role *</label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={isWorking}
            className={styles.input}
            placeholder="Engineer / Technician"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Location *</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={isWorking}
            className={styles.input}
            placeholder="Warehouse / Site"
          />
        </div>

        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label className={styles.label}>
            Description {isWorking ? "*" : "(Optional)"}
          </label>

          <div className={styles.textareaWrap}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!isWorking}
              maxLength={500}
              placeholder={
                isWorking
                  ? "Enter a description for this entry"
                  : "Description becomes available after Start"
              }
              className={styles.textarea}
            />
            <div className={styles.charCount}>{description.length} / 500</div>
          </div>
        </div>
      </div>
    </div>
  );
}
