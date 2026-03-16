"use client";

import { useTranslations } from "next-intl";
import { useProjectStore } from "@/stores/project-store";
import { apiFetch } from "@/lib/api-fetch";
import { Film, ImageIcon } from "lucide-react";
import { toast } from "sonner";

type GenerationMode = "keyframe" | "reference";

export function GenerationModeTab() {
  const t = useTranslations("project");
  const { project, setProject } = useProjectStore();

  if (!project) return null;

  const mode = (project.generationMode || "keyframe") as GenerationMode;

  async function switchMode(newMode: GenerationMode) {
    if (!project || newMode === mode) return;

    const previous = project;
    setProject({ ...project, generationMode: newMode });

    try {
      await apiFetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationMode: newMode }),
      });
    } catch (err) {
      setProject(previous);
      toast.error(err instanceof Error ? err.message : "Failed to switch mode");
    }
  }

  return (
    <div className="flex gap-1 rounded-lg border border-[--border-subtle] bg-[--surface] p-1">
      <button
        onClick={() => switchMode("keyframe")}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          mode === "keyframe"
            ? "bg-white text-[--text-primary] shadow-sm"
            : "text-[--text-muted] hover:text-[--text-secondary]"
        }`}
      >
        <Film className="h-3.5 w-3.5" />
        {t("generationModeKeyframe")}
      </button>
      <button
        onClick={() => switchMode("reference")}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          mode === "reference"
            ? "bg-white text-[--text-primary] shadow-sm"
            : "text-[--text-muted] hover:text-[--text-secondary]"
        }`}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        {t("generationModeReference")}
      </button>
    </div>
  );
}
