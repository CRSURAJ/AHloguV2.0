import styles from "./JobManagementPanel.module.css";

type JobStatsCardsProps = {
  totalJobs: number;
  activeJobs: number;
  inactiveJobs: number;
};

export default function JobStatsCards({ totalJobs, activeJobs, inactiveJobs }: JobStatsCardsProps) {
  return (
    <div className={styles.statsGrid}>
      <div className={styles.statCard}>
        <span>Total Jobs</span>
        <strong>{totalJobs}</strong>
      </div>

      <div className={styles.statCard}>
        <span>Active</span>
        <strong>{activeJobs}</strong>
      </div>

      <div className={styles.statCard}>
        <span>Inactive</span>
        <strong>{inactiveJobs}</strong>
      </div>
    </div>
  );
}
