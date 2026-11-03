import assert from "node:assert/strict";
import { test } from "node:test";
import { samePlaybackSummary } from "../src/lib/playback-summary.ts";
import { mapConcurrent } from "../src/lib/concurrency.ts";
import { backupTrackId, matchBackupTracks } from "../src/lib/backup-model.ts";
import { mergeDownloads } from "../src/lib/downloads/model.ts";

const status = { id: "player", isLoaded: true, playing: true, duration: 300, didJustFinish: false, isBuffering: false, currentTime: 0 };
test("1200 position ticks do not invalidate the library's playback summary", () => {
  let invalidations = 0;
  for (let tick = 1; tick <= 1200; tick++) if (!samePlaybackSummary(status, { ...status, currentTime: tick / 4 })) invalidations++;
  assert.equal(invalidations, 0);
  for (const change of [{ playing: false }, { isLoaded: false }, { duration: 400 }, { didJustFinish: true }, { isBuffering: true }, { error: "failed" }]) assert.equal(samePlaybackSummary(status, { ...status, ...change }), false);
});
test("library scan limits concurrency, preserves input ordering and handles an empty library", async () => {
  let active = 0, peak = 0;
  const result = await mapConcurrent(Array.from({ length: 80 }, (_, index) => index), 8, async (index) => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, index % 3));
    active--; return index * 2;
  });
  assert.ok(peak <= 8);
  assert.equal(result[79], 158);
  assert.deepEqual(await mapConcurrent([], 8, async () => 1), []);
  await assert.rejects(() => mapConcurrent([1], 8, async () => { throw new Error("failure"); }), /failure/);
});
test("repeated download updates preserve the library reference after metadata enrichment", () => {
  const track = { id: "a", uri: "file:///a", title: "Corrected", artist: "Artist", duration: 90, artwork: "file:///cover.jpg", metadataEdited: true };
  const library = [track];
  const incoming = [{ ...track, title: "Old title", artwork: "https://example.test/cover.jpg" }];
  assert.equal(mergeDownloads(library, incoming), library);
});
test("backup identifiers never include legacy web audio data URLs", () => {
  const id = "document:data:audio/wav;base64," + "a".repeat(10000);
  const portable = backupTrackId(id);
  assert.ok(portable.length < 100);
  assert.ok(!portable.includes("base64"));
  const track = { id, title: "Demo", artist: "Local", duration: 30 };
  const mapping = matchBackupTracks({ tracks: [{ ...track, id: portable }] }, [track]);
  assert.equal(mapping.get(portable), id);
});

test("download reconciliation indexes sources and preserves online IDs and local edits", () => {
  const online = { id: "online:youtube:source", uri: "", title: "Editado", artist: "Artista", duration: 90,
    metadataEdited: true, online: { provider: "youtube", sourceId: "source" } };
  const completed = { id: "download:job", uri: "file:///audio.m4a", title: "Original", artist: "Fonte", duration: 90,
    origin: { provider: "youtube", sourceId: "source", format: "m4a" } };
  const other = { ...completed, id: "download:other", origin: { ...completed.origin, sourceId: "other" } };
  const result = mergeDownloads([online], [completed, other]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, online.id);
  assert.equal(result[0].uri, completed.uri);
  assert.equal(result[0].title, online.title);
  assert.equal(result[1], other);
  assert.equal(mergeDownloads(result, [completed, other]), result);
});
