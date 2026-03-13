export function buildVideoPrompt(params: {
  sceneDescription: string;
  motionScript: string;
  cameraDirection: string;
  duration?: number;
  characterDescriptions?: string;
}): string {
  // motionScript already contains time-segmented narrative — no top-level scene prefix needed.
  // characterDescriptions omitted: first/last frames already carry visual character reference.
  return `${params.motionScript}，镜头${params.cameraDirection}。`;
}
