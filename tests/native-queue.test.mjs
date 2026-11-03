import assert from "node:assert/strict";
import { test } from "node:test";
import { nativeQueueTracks } from "../src/lib/native-queue.ts";

const local = (id) => ({ id, uri: `file:///${id}.mp3`, title: id, artist: "Artista", duration: 120 });
const remote = { ...local("online"), uri: "", online: { provider: "youtube", sourceId: "abcdefghijk", sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk", downloadable: true } };

test("native queue keeps visible order, deduplicates and skips unavailable references", () => {
  const a = local("a"), b = local("b");
  assert.deepEqual(nativeQueueTracks([a, b], ["b", "missing", "a", "b"], a).map((track) => track.id), ["b", "a"]);
});

test("a newly selected track can start before the library state catches up", () => {
  assert.deepEqual(nativeQueueTracks([], [remote.id], remote).map((track) => track.id), [remote.id]);
  assert.equal(nativeQueueTracks([], [], remote)[0].remote.sourceId, "abcdefghijk");
});

test("editing away the current row leaves preservation to the native engine", () => {
  const a = local("a"), b = local("b"), c = local("c");
  assert.deepEqual(nativeQueueTracks([a, b, c], ["a", "c"], b, false, false).map((track) => track.id), ["a", "c"]);
  assert.deepEqual(nativeQueueTracks([a, b, c], [], b, false, false), []);
});

test("offline radio never enqueues a remote resolver", () => {
  const a = local("a");
  const queue = nativeQueueTracks([a, remote], [remote.id, a.id], a, true);
  assert.deepEqual(queue.map((track) => track.id), [a.id]);
  assert.equal(queue[0].remote, undefined);
});

test("downloaded tracks retain an online fallback without discarding their local URI", () => {
  const track = { ...local("downloaded"), origin: { ...remote.online, format: "m4a" }, artwork: "file:///cover.jpg", album: "Álbum" };
  const [item] = nativeQueueTracks([track], [track.id], track);
  assert.equal(item.uri, track.uri);
  assert.equal(item.remote, undefined);
  assert.equal(item.fallback.sourceId, remote.online.sourceId);
  assert.equal(item.artwork, track.artwork);
  assert.equal(item.album, "Álbum");
  assert.equal(nativeQueueTracks([track], [track.id], track, true)[0].fallback, undefined);
});


test("a fresh online selection supplies every upcoming track before React state commits", () => {
  const second = { ...remote, id: "online:second", online: { ...remote.online, sourceId: "second" } };
  const third = { ...remote, id: "online:third", online: { ...remote.online, sourceId: "third" } };
  const fresh = [remote, second, third];
  assert.deepEqual(nativeQueueTracks([], fresh.map((track) => track.id), remote, false, true, fresh).map((track) => track.id), fresh.map((track) => track.id));
});
