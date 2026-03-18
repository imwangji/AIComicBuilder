export function buildSceneFramePrompt(params: {
  sceneDescription: string;
  charRefMapping: string;
  characterDescriptions: string;
}): string {
  const lines: string[] = [];

  lines.push(`Generate a scene reference frame for this shot as a single high-quality image.`);
  lines.push(``);
  lines.push(`=== SCENE DESCRIPTION ===`);
  lines.push(params.sceneDescription);
  lines.push(``);
  lines.push(`=== CHARACTER DESCRIPTIONS ===`);
  lines.push(params.characterDescriptions);
  lines.push(``);
  lines.push(`=== CHARACTER REFERENCE IMAGES ===`);
  lines.push(`Character reference images are attached. Correspondence: ${params.charRefMapping}`);
  lines.push(`You MUST reproduce each character EXACTLY as shown in their reference image — same face, clothing, hair, body type, and colors. Do NOT alter any character's appearance.`);
  lines.push(``);
  lines.push(`=== CRITICAL RULES ===`);
  lines.push(`1. Characters must match their reference images exactly`);
  lines.push(`2. The visual style is determined by the reference images — match it exactly`);
  lines.push(`3. Render a complete, stable composition suitable as a video starting frame`);
  lines.push(`4. Fully rendered background — no blank or abstract backgrounds`);
  lines.push(`5. Cinematic framing with clear composition and depth`);

  return lines.join("\n");
}
