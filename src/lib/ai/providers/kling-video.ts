import type { VideoProvider, VideoGenerateParams } from "../types";
import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";

interface KlingResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface KlingTaskData {
  task_id: string;
  task_status: "submitted" | "processing" | "succeed" | "failed";
  task_status_msg: string;
  task_result: {
    videos?: { url: string }[];
  };
}

const VALID_DURATIONS = [5, 10] as const;

function clampDuration(duration: number): number {
  return VALID_DURATIONS.reduce((prev, curr) =>
    Math.abs(curr - duration) < Math.abs(prev - duration) ? curr : prev
  );
}

function toDataUrl(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  const mime =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/png";
  let data: Buffer;
  try {
    data = fs.readFileSync(filePath);
  } catch {
    throw new Error(`Kling: frame file not found: ${filePath}`);
  }
  const base64 = data.toString("base64");
  return `data:${mime};base64,${base64}`;
}

export class KlingVideoProvider implements VideoProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private uploadDir: string;

  constructor(params?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    uploadDir?: string;
  }) {
    this.apiKey = params?.apiKey || process.env.KLING_API_KEY || "";
    this.baseUrl = (params?.baseUrl || "https://api.klingai.com").replace(/\/+$/, "");
    this.model = params?.model || "kling-v1";
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
  }

  async generateVideo(params: VideoGenerateParams): Promise<string> {
    const duration = clampDuration(params.duration);
    const aspectRatio = params.ratio ?? "16:9";
    const imageData = toDataUrl(params.firstFrame);
    const tailImageData = toDataUrl(params.lastFrame);

    console.log(
      `[Kling Video] Submitting: model=${this.model}, duration=${duration}s, ratio=${aspectRatio}`
    );

    const submitRes = await fetch(`${this.baseUrl}/v1/videos/image2video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        prompt: params.prompt,
        image: imageData,
        tail_image: tailImageData,
        duration,
        aspect_ratio: aspectRatio,
      }),
    });

    if (!submitRes.ok) {
      throw new Error(`Kling video submit failed: ${submitRes.status}`);
    }

    const submitJson = (await submitRes.json()) as KlingResponse<{ task_id: string }>;
    if (submitJson.code !== 0) {
      throw new Error(`Kling video error: ${submitJson.message}`);
    }

    const taskId = submitJson.data.task_id;
    console.log(`[Kling Video] Task submitted: ${taskId}`);

    const videoUrl = await this.pollForResult(taskId);

    // Download video
    const videoRes = await fetch(videoUrl);
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    const filename = `${ulid()}.mp4`;
    const dir = path.join(this.uploadDir, "videos");
    fs.mkdirSync(dir, { recursive: true });
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, buffer);

    console.log(`[Kling Video] Saved to ${filepath}`);
    return filepath;
  }

  private async pollForResult(taskId: string): Promise<string> {
    const maxAttempts = 120;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));

      const res = await fetch(`${this.baseUrl}/v1/videos/image2video/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!res.ok) {
        throw new Error(`Kling video poll failed: ${res.status}`);
      }

      const json = (await res.json()) as KlingResponse<KlingTaskData>;

      if (json.code !== 0) {
        throw new Error(`Kling video poll error: ${json.message}`);
      }

      const { task_status, task_status_msg, task_result } = json.data;
      console.log(`[Kling Video] Poll ${i + 1}: status=${task_status}`);

      if (task_status === "succeed") {
        const url = task_result.videos?.[0]?.url;
        if (!url) throw new Error("Kling video: no URL in result");
        return url;
      }

      if (task_status === "failed") {
        throw new Error(`Kling video generation failed: ${task_status_msg}`);
      }
    }

    throw new Error("Kling video generation timed out after 10 minutes");
  }
}
