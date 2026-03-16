"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";
import { uploadUrl } from "@/lib/utils/upload-url";
import { useModelStore } from "@/stores/model-store";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { InlineModelPicker } from "@/components/editor/model-selector";
import { apiFetch } from "@/lib/api-fetch";
import { useModelGuard } from "@/hooks/use-model-guard";
import { toast } from "sonner";
import { buildCharacterTurnaroundPrompt } from "@/lib/ai/prompts/character-image";

interface CharacterCardProps {
  id: string;
  projectId: string;
  name: string;
  description: string;
  referenceImage: string | null;
  onUpdate: () => void;
  batchGenerating?: boolean;
}

export function CharacterCard({
  id,
  projectId,
  name,
  description,
  referenceImage,
  onUpdate,
  batchGenerating,
}: CharacterCardProps) {
  const t = useTranslations();
  const getModelConfig = useModelStore((s) => s.getModelConfig);
  const [editName, setEditName] = useState(name);
  const [editDesc, setEditDesc] = useState(description);
  const [generating, setGenerating] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [copied, setCopied] = useState(false);
  const imageGuard = useModelGuard("image");
  const isGenerating = generating || (!!batchGenerating && !referenceImage);

  async function handleSave() {
    await apiFetch(`/api/projects/${projectId}/characters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDesc }),
    });
    onUpdate();
  }

  async function handleGenerateImage() {
    if (!imageGuard()) return;
    setGenerating(true);
    try {
      const response = await apiFetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "single_character_image",
          payload: { characterId: id },
          modelConfig: getModelConfig(),
        }),
      });
      await response.json();
    } catch (err) {
      console.error("Character image error:", err);
      toast.error(t("common.generationFailed"));
    }
    setGenerating(false);
    onUpdate();
  }

  return (
    <div className="group overflow-hidden rounded-2xl border border-[--border-subtle] bg-white transition-all duration-300 hover:border-[--border-hover] hover:shadow-lg hover:shadow-black/5">
      {/* Avatar area */}
      <div className="relative flex items-center justify-center bg-gradient-to-b from-[--surface] to-white p-8">
        {referenceImage ? (
          <div className="w-full aspect-video overflow-hidden rounded-xl cursor-pointer" onClick={() => setLightbox(true)}>
            <img
              src={uploadUrl(referenceImage)}
              alt={name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : isGenerating ? (
          <div className="w-full aspect-video rounded-xl animate-shimmer" />
        ) : (
          <div className="flex w-full aspect-video items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/10 text-3xl font-bold text-primary">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-3 p-4">
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          className="h-9 font-display font-semibold text-base"
        />
        <Textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          onBlur={handleSave}
          placeholder={t("character.description")}
          className="h-32 resize-none text-sm"
        />
        <div className="space-y-2">
            <InlineModelPicker capability="image" />
            <div className="flex gap-2">
              <Button
                onClick={handleGenerateImage}
                disabled={isGenerating}
                className="flex-1"
                size="sm"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {isGenerating ? t("common.generating") : t("character.generateImage")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 px-2.5"
                title="Copy image prompt"
                onClick={async () => {
                  const prompt = buildCharacterTurnaroundPrompt(editDesc || editName, editName);
                  await navigator.clipboard.writeText(prompt);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
      </div>

      {referenceImage && (
        <Dialog open={lightbox} onOpenChange={setLightbox}>
          <DialogContent className="max-w-4xl border-0 bg-transparent p-0 shadow-none">
            <DialogTitle className="sr-only">{name}</DialogTitle>
            <img
              src={uploadUrl(referenceImage)}
              alt={name}
              className="w-full rounded-xl"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
