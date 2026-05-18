"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createJob,
  deleteJob,
  loadJobs,
  updateJob,
} from "@/lib/jobStorage";
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
  handleUpdateJob: (
    id: string,
    updates: UpdateJobInput
  ) => Promise<AuthActionResult>;
  handleDeleteJob: (id: string) => Promise<AuthActionResult>;
  handleToggleJobActive: (id: string) => Promise<AuthActionResult>;
  getJobById: (id: string) => Job | undefined;
  clearJobMessage: () => void;
};

function getJobLabel(job: Job): string {
  return job.jobName || job.jobId || job.caseNo || "job";
}

function validateCreateJob(input: CreateJobInput): string {
  if (input.jobId.trim() === "") return "Job ID is required.";
  if (input.jobName.trim() === "") return "Job name is required.";
  if (input.customerName.trim() === "") return "Customer / site is required.";
  if (input.location.trim() === "") return "Location is required.";
  if (input.assignedRoles.length === 0) {
    return "Assign this job to at least one worker role.";
  }

  return "";
}

function validateUpdateJob(updates: UpdateJobInput): string {
  if (updates.jobId !== undefined && updates.jobId.trim() === "") {
    return "Job ID is required.";
  }

  if (updates.jobName !== undefined && updates.jobName.trim() === "") {
    return "Job name is required.";
  }

  if (
    updates.customerName !== undefined &&
    updates.customerName.trim() === ""
  ) {
    return "Customer / site is required.";
  }

  if (updates.location !== undefined && updates.location.trim() === "") {
    return "Location is required.";
  }

  if (updates.assignedRoles !== undefined && updates.assignedRoles.length === 0) {
    return "Assign this job to at least one worker role.";
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
    () => jobs.filter((job) => job.isActive),
    [jobs]
  );

  const inactiveJobs = useMemo(
    () => jobs.filter((job) => !job.isActive),
    [jobs]
  );

  const refreshJobs = useCallback(async () => {
    setIsLoadingJobs(true);

    const loadedJobs = await loadJobs();

    setJobs(loadedJobs);
    setIsLoadingJobs(false);
  }, []);

  const handleCreateJob = useCallback(
    async (input: CreateJobInput): Promise<AuthActionResult> => {
      const validationError = validateCreateJob(input);

      if (validationError) {
        setJobMessage(validationError);
        return { ok: false, message: validationError };
      }

      const job = await createJob(input);
      await refreshJobs();

      const message = `Created ${getJobLabel(job)}.`;
      setJobMessage(message);

      return { ok: true, message };
    },
    [refreshJobs]
  );

  const handleUpdateJob = useCallback(
    async (
      id: string,
      updates: UpdateJobInput
    ): Promise<AuthActionResult> => {
      const validationError = validateUpdateJob(updates);

      if (validationError) {
        setJobMessage(validationError);
        return { ok: false, message: validationError };
      }

      const updatedJob = await updateJob(id, updates);

      if (!updatedJob) {
        const message = "Job could not be found.";
        setJobMessage(message);
        return { ok: false, message };
      }

      await refreshJobs();

      const message = `Updated ${getJobLabel(updatedJob)}.`;
      setJobMessage(message);

      return { ok: true, message };
    },
    [refreshJobs]
  );

  const handleDeleteJob = useCallback(
    async (id: string): Promise<AuthActionResult> => {
      const job = jobs.find((item) => item.id === id);

      if (!job) {
        const message = "Job could not be found.";
        setJobMessage(message);
        return { ok: false, message };
      }

      await deleteJob(id);
      await refreshJobs();

      const message = `Deleted ${getJobLabel(job)}.`;
      setJobMessage(message);

      return { ok: true, message };
    },
    [jobs, refreshJobs]
  );

  const handleToggleJobActive = useCallback(
    async (id: string): Promise<AuthActionResult> => {
      const job = jobs.find((item) => item.id === id);

      if (!job) {
        const message = "Job could not be found.";
        setJobMessage(message);
        return { ok: false, message };
      }

      const updatedJob = await updateJob(id, {
        isActive: !job.isActive,
      });

      if (!updatedJob) {
        const message = "Job could not be updated.";
        setJobMessage(message);
        return { ok: false, message };
      }

      await refreshJobs();

      const message = updatedJob.isActive
        ? `Activated ${getJobLabel(updatedJob)}.`
        : `Deactivated ${getJobLabel(updatedJob)}.`;

      setJobMessage(message);

      return { ok: true, message };
    },
    [jobs, refreshJobs]
  );

  const getJobById = useCallback(
    (id: string) => jobs.find((job) => job.id === id),
    [jobs]
  );

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
    handleToggleJobActive,
    getJobById,
    clearJobMessage,
  };
}
