"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createProject, deleteProject, loadProjects, updateProject } from "@/lib/projectStorage";
import type { CreateProjectInput, UpdateProjectInput } from "@/lib/projectStorage";
import type { AuthActionResult, Project } from "@/types/work";

export type UseProjectsReturn = {
  projects: Project[];
  isLoadingProjects: boolean;
  projectMessage: string;
  refreshProjects: () => Promise<void>;
  handleCreateProject: (input: CreateProjectInput) => Promise<AuthActionResult>;
  handleUpdateProject: (id: string, updates: UpdateProjectInput) => Promise<AuthActionResult>;
  handleDeleteProject: (id: string) => Promise<AuthActionResult>;
  getProjectById: (id: string) => Project | undefined;
  clearProjectMessage: () => void;
};

function getProjectLabel(project: Project): string {
  return project.customerName || project.projectRef || "project";
}

function normalizeRefForCompare(value: string): string {
  return value.trim().toLowerCase();
}

function findDuplicateRef(
  projects: Project[],
  projectRef: string,
  ignoreRecordId?: string,
): Project | undefined {
  const normalizedRef = normalizeRefForCompare(projectRef);

  if (!normalizedRef) {
    return undefined;
  }

  return projects.find((project) => {
    if (ignoreRecordId && project.id === ignoreRecordId) {
      return false;
    }

    return normalizeRefForCompare(project.projectRef) === normalizedRef;
  });
}

function validateCreateProject(input: CreateProjectInput, projects: Project[]): string {
  if (input.projectRef.trim() === "") return "Project reference is required.";
  if (input.customerName.trim() === "") return "Customer / site is required.";

  const duplicate = findDuplicateRef(projects, input.projectRef);

  if (duplicate) {
    return `Project reference already exists on ${getProjectLabel(duplicate)}. Use a unique reference.`;
  }

  return "";
}

function validateUpdateProject(
  id: string,
  updates: UpdateProjectInput,
  projects: Project[],
): string {
  if (updates.projectRef !== undefined && updates.projectRef.trim() === "") {
    return "Project reference is required.";
  }

  if (updates.customerName !== undefined && updates.customerName.trim() === "") {
    return "Customer / site is required.";
  }

  if (updates.projectRef !== undefined) {
    const duplicate = findDuplicateRef(projects, updates.projectRef, id);

    if (duplicate) {
      return `Project reference already exists on ${getProjectLabel(duplicate)}. Use a unique reference.`;
    }
  }

  return "";
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectMessage, setProjectMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function hydrateProjects() {
      setIsLoadingProjects(true);

      const loadedProjects = await loadProjects();

      if (cancelled) return;

      setProjects(loadedProjects);
      setIsLoadingProjects(false);
    }

    void hydrateProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleProjects = useMemo(
    () => projects.filter((project) => project.isArchived !== true),
    [projects],
  );

  const refreshProjects = useCallback(async () => {
    setIsLoadingProjects(true);

    const loadedProjects = await loadProjects();

    setProjects(loadedProjects);
    setIsLoadingProjects(false);
  }, []);

  const handleCreateProject = useCallback(
    async (input: CreateProjectInput): Promise<AuthActionResult> => {
      const validationError = validateCreateProject(input, projects);

      if (validationError) {
        setProjectMessage(validationError);
        return { ok: false, message: validationError };
      }

      try {
        const project = await createProject(input);
        setProjects((prev) => [project, ...prev.filter((p) => p.id !== project.id)]);

        const message = `Created ${getProjectLabel(project)}.`;
        setProjectMessage(message);

        return { ok: true, message };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not create project.";
        setProjectMessage(message);

        return { ok: false, message };
      }
    },
    [projects],
  );

  const handleUpdateProject = useCallback(
    async (id: string, updates: UpdateProjectInput): Promise<AuthActionResult> => {
      const validationError = validateUpdateProject(id, updates, projects);

      if (validationError) {
        setProjectMessage(validationError);
        return { ok: false, message: validationError };
      }

      try {
        const updatedProject = await updateProject(id, updates);

        if (!updatedProject) {
          const message = "Project could not be found.";
          setProjectMessage(message);
          return { ok: false, message };
        }

        setProjects((prev) => prev.map((p) => (p.id === id ? updatedProject : p)));

        return { ok: true, message: `Updated ${getProjectLabel(updatedProject)}.` };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not update project.";
        setProjectMessage(message);

        return { ok: false, message };
      }
    },
    [projects],
  );

  const handleDeleteProject = useCallback(
    async (id: string): Promise<AuthActionResult> => {
      const project = projects.find((item) => item.id === id);

      if (!project) {
        const message = "Project could not be found.";
        setProjectMessage(message);
        return { ok: false, message };
      }

      try {
        await deleteProject(id);
        setProjects((prev) => prev.filter((p) => p.id !== id));

        const message = `Deleted ${getProjectLabel(project)}.`;
        setProjectMessage(message);

        return { ok: true, message };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not delete project.";
        setProjectMessage(message);

        return { ok: false, message };
      }
    },
    [projects],
  );

  const getProjectById = useCallback(
    (id: string) => projects.find((project) => project.id === id),
    [projects],
  );

  const clearProjectMessage = useCallback(() => {
    setProjectMessage("");
  }, []);

  return {
    projects: visibleProjects,
    isLoadingProjects,
    projectMessage,
    refreshProjects,
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    getProjectById,
    clearProjectMessage,
  };
}
