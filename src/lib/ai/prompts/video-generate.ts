export function buildVideoPrompt(params: {
  sceneDescription: string;
  motionScript: string;
  cameraDirection: string;
  duration?: number;
  characterDescriptions?: string;
  dialogues?: Array<{ characterName: string; text: string }>;
}): string {
  // motionScript contains per-segment camera directions — no need to repeat overall cameraDirection.
  // Reformat segments onto separate lines for readability.
  const segments = params.motionScript
    .split(/(?=\d+[-–]\d+s[：:])/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const motionPart = segments.length > 1 ? segments.join("\n") : params.motionScript.trim();

  const dialoguePart = params.dialogues?.length
    ? "\nDialogue (spoken aloud by characters):\n" +
      params.dialogues
        .map((d) => `- ${d.characterName} says: "${d.text}"`)
        .join("\n")
    : "";

  return `${motionPart}\nCamera: ${params.cameraDirection}${dialoguePart}`;
}
