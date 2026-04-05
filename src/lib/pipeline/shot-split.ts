import { db } from "@/lib/db";
import { shots, dialogues, characters, characterRelations, scenes, projects, episodes } from "@/lib/db/schema";
import { resolveAIProvider } from "@/lib/ai/provider-factory";
import type { ModelConfigPayload } from "@/lib/ai/provider-factory";
import { buildShotSplitPrompt } from "@/lib/ai/prompts/shot-split";
import { resolvePrompt } from "@/lib/ai/prompts/resolver";
import { eq, and, or, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import type { Task } from "@/lib/task-queue";

export async function handleShotSplit(task: Task) {
  const payload = task.payload as {
    projectId: string;
    screenplay: string;
    modelConfig?: ModelConfigPayload;
    episodeId?: string;
    userId?: string;
  };

  // Get characters for this project (include main + episode-scoped)
  const projectCharacters = await db
    .select()
    .from(characters)
    .where(
      payload.episodeId
        ? and(eq(characters.projectId, payload.projectId), or(isNull(characters.episodeId), eq(characters.episodeId, payload.episodeId)))
        : eq(characters.projectId, payload.projectId)
    );

  const characterDescriptions = projectCharacters
    .map((c) => `${c.name}: ${c.description}`)
    .join("\n");

  // Load character relations
  const relations = await db
    .select()
    .from(characterRelations)
    .where(eq(characterRelations.projectId, payload.projectId));

  let relationsText = "";
  if (relations.length > 0) {
    relationsText = "\n\n## CHARACTER RELATIONSHIPS\n";
    for (const rel of relations) {
      const charA = projectCharacters.find(c => c.id === rel.characterAId);
      const charB = projectCharacters.find(c => c.id === rel.characterBId);
      if (charA && charB) {
        relationsText += `- ${charA.name} \u2194 ${charB.name}: ${rel.relationType}${rel.description ? ` (${rel.description})` : ""}\n`;
      }
    }
    relationsText += "\nUse these relationships to inform framing, character proximity, and eye direction in compositions.\n";
  }

  // Fetch color palette from project or episode
  let colorPalette = "";
  if (payload.episodeId) {
    const [episode] = await db.select().from(episodes).where(eq(episodes.id, payload.episodeId));
    if (episode?.colorPalette) colorPalette = episode.colorPalette;
  }
  if (!colorPalette) {
    const [project] = await db.select().from(projects).where(eq(projects.id, payload.projectId));
    if (project?.colorPalette) colorPalette = project.colorPalette;
  }

  const systemPrompt = await resolvePrompt("shot_split", {
    userId: payload.userId ?? "",
    projectId: payload.projectId,
  });

  const ai = resolveAIProvider(payload.modelConfig);
  const userPrompt = buildShotSplitPrompt(payload.screenplay, characterDescriptions, undefined, colorPalette || undefined) + relationsText;
  const result = await ai.generateText(
    userPrompt,
    { systemPrompt, temperature: 0.5 }
  );

  const parsed = JSON.parse(result) as Array<Record<string, unknown>>;

  // Handle both formats: scene-grouped array or flat shot array (backwards compat)
  const isSceneGrouped = parsed.length > 0 && Array.isArray((parsed[0] as Record<string, unknown>).shots);

  const created = [];

  const insertShot = async (
    shotData: Record<string, unknown>,
    sceneId?: string
  ) => {
    const shotId = ulid();
    const [record] = await db
      .insert(shots)
      .values({
        id: shotId,
        projectId: payload.projectId,
        sequence: (shotData.sequence as number) || 0,
        prompt: (shotData.prompt as string) || "",
        startFrameDesc: (shotData.startFrame as string) || "",
        endFrameDesc: (shotData.endFrame as string) || "",
        motionScript: (shotData.motionScript as string) || "",
        videoScript: (shotData.videoScript as string) || "",
        cameraDirection: (shotData.cameraDirection as string) || "static",
        duration: (shotData.duration as number) || 10,
        transitionIn: (shotData.transitionIn as string) || "cut",
        transitionOut: (shotData.transitionOut as string) || "cut",
        compositionGuide: (shotData.compositionGuide as string) || "",
        episodeId: payload.episodeId ?? null,
        sceneId: sceneId ?? null,
      })
      .returning();

    // Create dialogues for this shot
    const shotDialogues = (shotData.dialogues as Array<{ character: string; text: string }>) || [];
    for (let i = 0; i < shotDialogues.length; i++) {
      const dialogue = shotDialogues[i];
      const matchedChar = projectCharacters.find(
        (c) => c.name === dialogue.character
      );
      if (matchedChar) {
        await db.insert(dialogues).values({
          id: ulid(),
          shotId,
          characterId: matchedChar.id,
          text: dialogue.text,
          sequence: i,
        });
      }
    }

    return record;
  };

  if (isSceneGrouped) {
    let globalSequence = 1;
    for (let sceneIdx = 0; sceneIdx < parsed.length; sceneIdx++) {
      const scene = parsed[sceneIdx] as Record<string, unknown>;
      const sceneId = ulid();
      await db.insert(scenes).values({
        id: sceneId,
        episodeId: payload.episodeId || "",
        projectId: payload.projectId,
        title: (scene.sceneTitle as string) || "",
        description: (scene.sceneDescription as string) || "",
        lighting: (scene.lighting as string) || "",
        colorPalette: (scene.colorPalette as string) || "",
        sequence: sceneIdx + 1,
      });

      const sceneShots = (scene.shots as Array<Record<string, unknown>>) || [];
      for (const shotData of sceneShots) {
        shotData.sequence = globalSequence++;
        const record = await insertShot(shotData, sceneId);
        created.push(record);
      }
    }
  } else {
    // Flat shot array (backwards compat)
    for (const shotData of parsed) {
      const record = await insertShot(shotData);
      created.push(record);
    }
  }

  return { shots: created };
}
