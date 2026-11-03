import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedOnlineItems, excludedOnlineIds, onlineId, selectOnlineBatch } from "../src/lib/online-queue.ts";
const item = (id, provider = "youtube") => ({ id, provider, title: id, artist: "Artista", duration: 120, thumbnail: null, url: "", downloadable: true });
test("streaming session queues ten unique next tracks without repeating the selected song", () => {
  const selected = item("selected");
  const candidates = [selected, ...Array.from({ length: 20 }, (_, i) => item(String(i))), item("1")];
  const batch = selectOnlineBatch(candidates, [onlineId(selected)]);
  assert.equal(batch.length, 10);
  assert.equal(new Set(batch.map(onlineId)).size, 10);
  assert.equal(batch.some((track) => track.id === "selected"), false);
});
test("loading more excludes the complete queue and preserves provider identity", () => {
  const batch = selectOnlineBatch([item("1"), item("1"), item("1", "jamendo"), item("2")], [onlineId(item("1"))]);
  assert.deepEqual(batch.map(onlineId), ["online:jamendo:1", "online:youtube:2"]);
});
test("exhausted sources return a partial or empty batch without replaying old songs", () => {
  assert.deepEqual(selectOnlineBatch([item("1")], [onlineId(item("1"))]), []);
  assert.equal(selectOnlineBatch([item("1"), item("2")], []).length, 2);
});
test("a downloaded queue entry excludes its online identity from refill", () => {
  const downloaded = { id: "download:local", uri: "file:///song.mp3", origin: { provider: "audius", sourceId: "abc" } };
  const excluded = excludedOnlineIds([downloaded], [downloaded.id]);
  assert.deepEqual(selectOnlineBatch([item("abc", "audius"), item("other", "audius")], excluded).map(onlineId), ["online:audius:other"]);
  assert.deepEqual(selectOnlineBatch([item("abc")], [], 0), []);
});
test("automatic suggestions respect blocked artists and downloaded track identities", () => {
  const downloaded = { id: "download:local", uri: "file:///song.mp3", origin: { provider: "audius", sourceId: "blocked" } };
  const candidates = [{ ...item("artist", "audius"), artist: "  Artista Bloqueado " }, item("blocked", "audius"), item("allowed", "audius")];
  assert.deepEqual(allowedOnlineItems(candidates, [downloaded], { blockedArtists: ["artista bloqueado"], blockedTracks: [downloaded.id] }).map(onlineId), ["online:audius:allowed"]);
});
