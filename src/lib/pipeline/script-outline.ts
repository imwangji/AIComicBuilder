import { db } from "@/lib/db";
import { projects, episodes } from "@/lib/db/schema";
import { resolveAIProvider } from "@/lib/ai/provider-factory";
import type { ModelConfigPayload } from "@/lib/ai/provider-factory";
import { eq } from "drizzle-orm";
import type { Task } from "@/lib/task-queue";

const OUTLINE_SYSTEM = `You are an award-winning screenwriter. Generate a story outline from the user's creative concept.

Outline structure:
1. Premise (one-sentence core conflict)
2. 3-5 key beats, each containing:
   - Beat name
   - Core action/event
   - Emotional shift
   - Estimated proportion (e.g., 20%)
3. Climax description
4. Ending direction

CRITICAL LANGUAGE RULE: Output in the SAME language as the user's input. Chinese input = Chinese output. English input = English output.

Output as JSON:
{
  "premise": "one-line premise",
  "beats": [
    { "name": "...", "action": "...", "emotion": "...", "ratio": "20%" }
  ],
  "climax": "...",
  "ending": "..."
}`;

export async function handleScriptOutline(task: Task) {
  const payload = task.payload as {
    projectId: string;
    episodeId?: string;
    idea: string;
    modelConfig?: ModelConfigPayload;
    userId?: string;
  };

  const { projectId, episodeId, idea } = payload;

  const ai = resolveAIProvider(payload.modelConfig);
  const result = await ai.generateText(`Creative concept: ${idea}`, {
    systemPrompt: OUTLINE_SYSTEM,
    temperature: 0.7,
  });

  // Save outline
  if (episodeId) {
    await db
      .update(episodes)
      .set({ outline: result, updatedAt: new Date() })
      .where(eq(episodes.id, episodeId));
  } else {
    await db
      .update(projects)
      .set({ outline: result, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }

  return { outline: result };
}
