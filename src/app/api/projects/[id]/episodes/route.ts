import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, episodes } from "@/lib/db/schema";
import { eq, asc, and, max } from "drizzle-orm";
import { ulid } from "ulid";
import { getUserIdFromRequest } from "@/lib/get-user-id";

async function resolveProject(id: string, userId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return project ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = getUserIdFromRequest(request);
  const project = await resolveProject(id, userId);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allEpisodes = await db
    .select()
    .from(episodes)
    .where(eq(episodes.projectId, id))
    .orderBy(asc(episodes.sequence));

  return NextResponse.json(allEpisodes);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = getUserIdFromRequest(request);
  const project = await resolveProject(id, userId);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as { title: string };

  // Get the max sequence number for this project
  const [result] = await db
    .select({ maxSeq: max(episodes.sequence) })
    .from(episodes)
    .where(eq(episodes.projectId, id));

  const nextSequence = (result?.maxSeq ?? 0) + 1;

  const [episode] = await db
    .insert(episodes)
    .values({
      id: ulid(),
      projectId: id,
      title: body.title,
      sequence: nextSequence,
    })
    .returning();

  return NextResponse.json(episode, { status: 201 });
}
