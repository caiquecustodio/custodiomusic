import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { yieldToInput } from "./idle";

const memory = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let tail = Promise.resolve();
let sequence = 0;
let cleaned = false;
const MAX_THUMBNAILS = 128;

/** Only visible local artwork is resized. Remote artwork uses native downsampling/cache. */
export function thumbnail(source: string, revision = 0): Promise<string> {
  if (Platform.OS === "web" || !/^(file|content):/i.test(source)) return Promise.resolve(source);
  const key = `${source}:${revision}`;
  const saved = memory.get(key);
  if (saved && new File(saved).exists) {
    memory.delete(key); memory.set(key, saved);
    return Promise.resolve(saved);
  }
  const active = pending.get(key);
  if (active) return active;
  // Fast scrolling must not enqueue an entire library of obsolete transformations.
  if (pending.size >= 16) return Promise.resolve(source);
  const task = tail.then(async () => {
    await yieldToInput();
    const directory = new Directory(Paths.cache, "artwork-thumbnails-v1");
    directory.create({ idempotent: true, intermediates: true });
    if (!cleaned) {
      // Previous-session thumbnails are disposable; original covers remain untouched.
      for (const entry of directory.list()) { if (entry instanceof File) entry.delete(); }
      cleaned = true;
    }
    const context = ImageManipulator.manipulate(source, { maxWidth: 160, maxHeight: 160 });
    let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
    try {
      rendered = await context.renderAsync();
      const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      const generated = new File(result.uri);
      const target = new File(directory, `${Date.now()}-${sequence++}.jpg`);
      generated.move(target);
      memory.set(key, target.uri);
      while (memory.size > MAX_THUMBNAILS) {
        const oldest = memory.entries().next().value!;
        memory.delete(oldest[0]);
        try { const file = new File(oldest[1]); if (file.exists) file.delete(); } catch { /* Cache eviction is optional. */ }
      }
      return target.uri;
    } finally { rendered?.release(); context.release(); }
  });
  pending.set(key, task);
  tail = task.then(() => undefined, () => undefined);
  void task.finally(() => pending.delete(key)).catch(() => undefined);
  return task;
}

/** Warm only two likely remote covers, in the disk cache rather than decoded RAM. */
export async function prefetchArtwork(uris: string[]) {
  const remote = [...new Set(uris.filter((uri) => /^https:\/\//i.test(uri)))].slice(0, 2);
  if (remote.length) await Image.prefetch(remote, { cachePolicy: "disk" });
}
