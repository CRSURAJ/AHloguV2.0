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
    <div className={styles.formCard}>
      <h2 className={styles.sectionTitle}>Worker Details</h2>

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
            placeholder="Plumber / Technician / Apprentice"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Location *</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={isWorking}
            className={styles.input}
            placeholder="Site location"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          Description {isWorking ? "*" : ""}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!isWorking}
          placeholder={
            isWorking
              ? "Enter work description before stopping"
              : "Description becomes available after Start"
          }
          className={styles.textarea}
        />
      </div>
    </div>
  );
}
