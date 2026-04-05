import { db } from "@/lib/db";
import { shots, projects, episodes, dialogues, characters } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { assembleVideo } from "@/lib/video/ffmpeg";
import type { Task } from "@/lib/task-queue";

type TransitionType = "cut" | "dissolve" | "fade_in" | "fade_out" | "wipeleft" | "slideright" | "circleopen";

export async function handleVideoAssemble(task: Task) {
  const payload = task.payload as { projectId: string };

  const projectShots = await db
    .select()
    .from(shots)
    .where(eq(shots.projectId, payload.projectId))
    .orderBy(asc(shots.sequence));

  const completedShots = projectShots.filter((s) => s.videoUrl);

  const videoPaths = completedShots
    .map((s) => s.videoUrl)
    .filter(Boolean) as string[];

  if (videoPaths.length === 0) {
    throw new Error("No video clips to assemble");
  }

  // Build transitions array from shot transitionOut / transitionIn fields
  const transitions: TransitionType[] = completedShots.slice(0, -1).map((shot, i) => {
    const nextShot = completedShots[i + 1];
    // Prefer current shot's transitionOut, fall back to next shot's transitionIn
    return ((shot.transitionOut && shot.transitionOut !== "cut")
      ? shot.transitionOut
      : (nextShot?.transitionIn || "cut")) as TransitionType;
  });

  // Get dialogues for subtitles
  const subtitles: {
    text: string;
    shotSequence: number;
    dialogueSequence: number;
    dialogueCount: number;
    startRatio?: number;
    endRatio?: number;
  }[] = [];

  for (const shot of completedShots) {
    const shotDialogues = await db
      .select({
        text: dialogues.text,
        characterName: characters.name,
        sequence: dialogues.sequence,
        shotSequence: shots.sequence,
        startRatio: dialogues.startRatio,
        endRatio: dialogues.endRatio,
      })
      .from(dialogues)
      .innerJoin(characters, eq(dialogues.characterId, characters.id))
      .innerJoin(shots, eq(dialogues.shotId, shots.id))
      .where(eq(dialogues.shotId, shot.id))
      .orderBy(asc(dialogues.sequence));

    const count = shotDialogues.length;
    shotDialogues.forEach((d, idx) => {
      const sr = d.startRatio ? parseFloat(String(d.startRatio)) : undefined;
      const er = d.endRatio ? parseFloat(String(d.endRatio)) : undefined;
      subtitles.push({
        text: `${d.characterName}: ${d.text}`,
        shotSequence: d.shotSequence,
        dialogueSequence: idx,
        dialogueCount: count,
        startRatio: sr,
        endRatio: er,
      });
    });
  }

  // Load project for title card and BGM
  const [project] = await db
    .select({ title: projects.title, bgmUrl: projects.bgmUrl })
    .from(projects)
    .where(eq(projects.id, payload.projectId));

  // Resolve BGM path: episode-level overrides project-level
  let bgmPath: string | undefined;
  if (project?.bgmUrl) {
    bgmPath = project.bgmUrl;
  }
  // Check if shots belong to an episode and if it has its own BGM
  const episodeId = completedShots[0]?.episodeId;
  if (episodeId) {
    const [ep] = await db
      .select({ bgmUrl: episodes.bgmUrl })
      .from(episodes)
      .where(eq(episodes.id, episodeId));
    if (ep?.bgmUrl) bgmPath = ep.bgmUrl;
  }

  // Title and credits cards
  const titleCard = project?.title
    ? { text: project.title, duration: 3 }
    : undefined;
  const creditsCard = { text: "Made with AIComicBuilder", duration: 2 };

  const result = await assembleVideo({
    videoPaths,
    subtitles,
    projectId: payload.projectId,
    shotDurations: completedShots.map((s) => s.duration ?? 10),
    transitions,
    bgmPath,
    titleCard,
    creditsCard,
  });

  await db
    .update(projects)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(projects.id, payload.projectId));

  return { outputPath: result.videoPath, srtPath: result.srtPath };
}
