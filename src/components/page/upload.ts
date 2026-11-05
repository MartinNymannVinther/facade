export type StoredFile = { id: string; name: string; mime: string; size: number };

/** Null when the server refused it: too large, or the workspace is full. */
export async function uploadFile(file: File): Promise<StoredFile | null> {
  const form = new FormData();
  form.append("file", file);
  const answer = await fetch("/api/files", { method: "POST", body: form }).catch(() => null);
  return answer?.ok ? ((await answer.json()) as StoredFile) : null;
}
