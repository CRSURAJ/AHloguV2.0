"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { archiveJob, createJob, deleteJob, loadJobs, updateJob } from "@/lib/jobStorage";
import type { CreateJobInput, UpdateJobInput } from "@/lib/jobStorage";
import type { AuthActionResult, Job } from "@/types/work";

export type UseJobsReturn = {
  jobs: Job[];
  activeJobs: Job[];
  inactiveJobs: Job[];
  isLoadingJobs: boolean;
  jobMessage: string;
  refreshJobs: () => Promise<void>;
  handleCreateJob: (input: CreateJobInput) => Promise<AuthActionResult>;
  handleUpdateJob: (id: string, updates: UpdateJobInput) => Promise<AuthActionResult>;
  handleDeleteJob: (id: string) => Promise<AuthActionResult>;
  handleArchiveJob: (id: string) => Promise<AuthActionResult>;
  handleToggleJobActive: (id: string) => Promise<AuthActionResult>;
  getJobById: (id: string) => Job | undefined;
  clearJobMessage: () => void;
};

function getJobLabel(job: Job): string {
  return job.jobName || job.jobId || job.caseNo || "job";
}

function normalizeJobIdForCompare(value: string): string {
  return value.trim().toLowerCase();
}

function findDuplicateJobId(
  jobs: Job[],
  jobId: string,
  ignoreJobRecordId?: string,
): Job | undefined {
  const normalizedJobId = normalizeJobIdForCompare(jobId);

  if (!normalizedJobId) {
    return undefined;
  }

  return jobs.find((job) => {
    if (ignoreJobRecordId && job.id === ignoreJobRecordId) {
      return false;
    }

    return normalizeJobIdForCompare(job.jobId) === normalizedJobId;
  });
}

function validateCreateJob(input: CreateJobInput, jobs: Job[]): string {
  if (input.jobId.trim() === "") return "Job ID is required.";
  if (input.jobName.trim() === "") return "Job name is required.";
  if (input.customerName.trim() === "") return "Customer / site is required.";
  if (input.assignedRoles.length === 0) {
    return "Assign this job to at least one worker role.";
  }

  const duplicateJob = findDuplicateJobId(jobs, input.jobId);

  if (duplicateJob) {
    return `Job ID already exists on ${getJobLabel(duplicateJob)}. Use a unique Job ID.`;
  }

  return "";
}

function validateUpdateJob(id: string, updates: UpdateJobInput, jobs: Job[]): string {
  if (updates.jobId !== undefined && updates.jobId.trim() === "") {
    return "Job ID is required.";
  }

  if (updates.jobName !== undefined && updates.jobName.trim() === "") {
    return "Job name is required.";
  }

  if (updates.customerName !== undefined && updates.customerName.trim() === "") {
    return "Customer / site is required.";
  }

  if (updates.assignedRoles !== undefined && updates.assignedRoles.length === 0) {
    return "Assign this job to at least one worker role.";
  }

  if (updates.jobId !== undefined) {
    const duplicateJob = findDuplicateJobId(jobs, updates.jobId, id);

    if (duplicateJob) {
      return `Job ID already exists on ${getJobLabel(duplicateJob)}. Use a unique Job ID.`;
    }
  }

  return "";
}

export function useJobs(): UseJobsReturn {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [jobMessage, setJobMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function hydrateJobs() {
      setIsLoadingJobs(true);

      const loadedJobs = await loadJobs();

      if (cancelled) return;

      setJobs(loadedJobs);
      setIsLoadingJobs(false);
    }

    void hydrateJobs();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeJobs = useMemo(
    () => jobs.filter((job) => job.isActive && job.isArchived !== true),
    [jobs],
  );

  const inactiveJobs = useMemo(
    () => jobs.filter((job) => !job.isActive && job.isArchived !== true),
    [jobs],
  );

  const refreshJobs = useCallback(async () => {
    setIsLoadingJobs(true);

    const loadedJobs = await loadJobs();

    setJobs(loadedJobs);
    setIsLoadingJobs(false);
  }, []);

  const handleCreateJob = useCallback(
    async (input: CreateJobInput): Promise<AuthActionResult> => {
      const validationError = validateCreateJob(input, jobs);

      if (validationError) {
        setJobMessage(validationError);
        return { ok: false, message: validationError };
      }

      try {
        const job = await createJob(input);
        setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);

        const message = `Created ${getJobLabel(job)}.`;
        setJobMessage(message);

        return { ok: true, message };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not create job.";
        setJobMessage(message);

        return { ok: false, message };
      }
    },
    [jobs],
  );

  const handleUpdateJob = useCallback(
    async (id: string, updates: UpdateJobInput): Promise<AuthActionResult> => {
      const validationError = validateUpdateJob(id, updates, jobs);

      if (validationError) {
        setJobMessage(validationError);
        return { ok: false, message: validationError };
      }

      try {
        const updatedJob = await updateJob(id, updates);

        if (!updatedJob) {
          const message = "Job could not be found.";
          setJobMessage(message);
          return { ok: false, message };
        }

        setJobs((prev) => prev.map((j) => (j.id === id ? updatedJob : j)));

        const message = `Updated ${getJobLabel(updatedJob)}.`;
        setJobMessage(message);

        return { ok: true, message };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not update job.";
        setJobMessage(message);

        return { ok: false, message };
      }
    },
    [jobs],
  );

  const handleDeleteJob = useCallback(
    async (id: string): Promise<AuthActionResult> => {
      const job = jobs.find((item) => item.id === id);

      if (!job) {
        const message = "Job could not be found.";
        setJobMessage(message);
        return { ok: false, message };
      }

      try {
        await deleteJob(id);
        setJobs((prev) => prev.filter((j) => j.id !== id));

        const message = `Deleted ${getJobLabel(job)}.`;
        setJobMessage(message);

        return { ok: true, message };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not delete job.";
        setJobMessage(message);

        return { ok: false, message };
      }
    },
    [jobs],
  );

  const handleArchiveJob = useCallback(
    async (id: string): Promise<AuthActionResult> => {
      const job = jobs.find((item) => item.id === id);

      if (!job) {
        const message = "Job could not be found.";
        setJobMessage(message);
        return { ok: false, message };
      }

      try {
        const archivedJob = await archiveJob(id);

        if (!archivedJob) {
          const message = "Job could not be archived.";
          setJobMessage(message);
          return { ok: false, message };
        }

        setJobs((prev) => prev.map((j) => (j.id === id ? archivedJob : j)));

        const message = `${getJobLabel(job)} archived successfully.`;
        setJobMessage(message);
        return { ok: true, message };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not archive job.";
        setJobMessage(message);
        return { ok: false, message };
      }
    },
    [jobs],
  );

  const handleToggleJobActive = useCallback(
    async (id: string): Promise<AuthActionResult> => {
      const job = jobs.find((item) => item.id === id);

      if (!job) {
        const message = "Job could not be found.";
        setJobMessage(message);
        return { ok: false, message };
      }

      try {
        const updatedJob = await updateJob(id, {
          isActive: !job.isActive,
        });

        if (!updatedJob) {
          const message = "Job could not be updated.";
          setJobMessage(message);
          return { ok: false, message };
        }

        setJobs((prev) => prev.map((j) => (j.id === id ? updatedJob : j)));

        const message = updatedJob.isActive
          ? `Activated ${getJobLabel(updatedJob)}.`
          : `Deactivated ${getJobLabel(updatedJob)}.`;

        setJobMessage(message);

        return { ok: true, message };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not update job.";
        setJobMessage(message);

        return { ok: false, message };
      }
    },
    [jobs],
  );

  const getJobById = useCallback((id: string) => jobs.find((job) => job.id === id), [jobs]);

  const clearJobMessage = useCallback(() => {
    setJobMessage("");
  }, []);

  return {
    jobs,
    activeJobs,
    inactiveJobs,
    isLoadingJobs,
    jobMessage,
    refreshJobs,
    handleCreateJob,
    handleUpdateJob,
    handleDeleteJob,
    handleArchiveJob,
    handleToggleJobActive,
    getJobById,
    clearJobMessage,
  };
}
