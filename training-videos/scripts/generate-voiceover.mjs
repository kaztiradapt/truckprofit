import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const voiceoverDir = path.join(root, "public", "voiceover");
const scenes = ["01-intro", "02-fleet", "03-trip", "04-telegram", "05-expense", "06-live", "07-reports", "08-outro"];

const instructions = [
  "Speak in fluent, natural Russian.",
  "Use a warm, confident female product-trainer voice.",
  "Sound conversational and engaged, as if calmly showing a useful tool to a colleague.",
  "Vary the intonation, emphasize the practical benefit in each sentence, and make short meaningful pauses.",
  "Keep a medium tempo and avoid an advertising, robotic, theatrical, or overly formal delivery.",
  "Pronounce «Трак Профит» and «Телеграм» naturally in Russian.",
].join(" ");

for (const scene of scenes) {
  const input = (await readFile(path.join(voiceoverDir, `${scene}.txt`), "utf8")).trim();
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "marin",
      input,
      instructions,
      response_format: "wav",
    }),
  });

  if (!response.ok) {
    throw new Error(`${scene}: аудио не создано (HTTP ${response.status})`);
  }

  await writeFile(path.join(voiceoverDir, `${scene}.wav`), Buffer.from(await response.arrayBuffer()));
  console.log(`Generated ${scene}.wav`);
}
