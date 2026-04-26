export async function transcribeAudio({
  apiKey,
  audioBuffer,
  mimeType,
  fileName = "recording.webm",
  language = "en",
}) {
  if (!apiKey) {
    throw new Error("openai_key_missing");
  }

  const blob = new Blob([audioBuffer], { type: mimeType || "audio/webm" });
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", language);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`transcription_failed_${res.status}:${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  if (!text) throw new Error("transcription_empty");
  return text;
}
