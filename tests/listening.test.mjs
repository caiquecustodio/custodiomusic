import assert from "node:assert/strict";
import { test } from "node:test";
import { markedLrc, moveQueue, queueNext, sortTracks } from "../src/lib/listening-model.ts";
import { matchBackupTracks, parseBackup } from "../src/lib/backup-model.ts";
import { parseLrc } from "../src/lib/metadata-model.ts";

const tracks = [
  { id: "1", title: "Zebra", artist: "Ana", album: "B", duration: 100 },
  { id: "2", title: "Amor", artist: "Zeca", album: "A", duration: 120 },
];
const backup = () => ({ format: "custodio-backup", version: 1, state: { favorites: ["1"], playlists: [{ id: "p", name: "Teste", trackIds: ["1", "2"] }], theme: "dark", shuffle: false, autoSync: true, repeat: "off", librarySort: "original" }, tracks, lyrics: [{ id: "1", data: { plain: "Frase", synced: "[00:10]Frase", instrumental: false, source: "Arquivo local" } }] });
test("queue dragging clamps endpoints and keeps a single occurrence without mutating the queue", () => {
  const original = ["a", "b", "c"];
  assert.deepEqual(moveQueue(original, "c", 0), ["c", "a", "b"]);
  assert.deepEqual(moveQueue(original, "a", 999), ["b", "c", "a"]);
  assert.deepEqual(moveQueue(original, "c", -10), ["c", "a", "b"]);
  assert.equal(moveQueue(original, "missing", 0), original);
  assert.deepEqual(original, ["a", "b", "c"]);
});
test("play-next inserts immediately after the current track and deduplicates", () => {
  assert.deepEqual(queueNext(["a", "b", "c"], "a", "c"), ["a", "c", "b"]);
  assert.deepEqual(queueNext(["a", "b"], "a", "d"), ["a", "d", "b"]);
  assert.deepEqual(queueNext(["a", "b"], null, "d"), ["d", "a", "b"]);
  assert.deepEqual(queueNext(["a", "b"], "a", "a"), ["a", "b"]);
});
test("sorting supports title, artist and album without changing playlist order in place", () => {
  assert.deepEqual(sortTracks(tracks, "title").map((track) => track.id), ["2", "1"]);
  assert.deepEqual(sortTracks(tracks, "artist").map((track) => track.id), ["1", "2"]);
  assert.deepEqual(sortTracks(tracks, "album").map((track) => track.id), ["2", "1"]);
  assert.equal(sortTracks(tracks, "original"), tracks);
  assert.equal(tracks[0].id, "1");
});
test("manual singing marks produce portable LRC including minute rollover", () => {
  const text = markedLrc(["Primeira", "Segunda", "Terceira"], [0, 9.25, 60.1]);
  assert.deepEqual(parseLrc(text), [{ time: 0, text: "Primeira" }, { time: 9.25, text: "Segunda" }, { time: 60.1, text: "Terceira" }]);
  assert.equal(markedLrc(["Fim"], [59.999]), "[01:00.00]Fim");
});
test("incomplete, backwards, duplicate or invalid singing marks cannot overwrite lyrics", () => {
  for (const times of [[0], [10, 5], [5, 5], [0, Infinity], [-1, 2]]) assert.throws(() => markedLrc(["A", "B"], times));
  assert.throws(() => markedLrc([], []));
});
test("backup validates portable preferences, lyrics and track timing", () => {
  assert.deepEqual(parseBackup(JSON.stringify(backup())), backup());
  const old = backup(); delete old.state.librarySort;
  assert.equal(parseBackup(JSON.stringify(old)).state.librarySort, "original");
  old.state.repeat = "single";
  assert.equal(parseBackup(JSON.stringify(old)).state.repeat, "off");
});
test("malformed and unsupported backup payloads are rejected before restoration", () => {
  for (const data of [{}, { ...backup(), version: 2 }, { ...backup(), state: { ...backup().state, favorites: [42] } }, { ...backup(), tracks: [{ ...tracks[0], lyricsOffset: 1000 }] }, { ...backup(), lyrics: [{ id: "1", data: { plain: 20 } }] }]) assert.throws(() => parseBackup(JSON.stringify(data)));
});
test("backup matches by stable id or unambiguous title/artist/duration and skips missing audio", () => {
  const mapping = matchBackupTracks(backup(), [{ ...tracks[0], id: "new" }, tracks[1]]);
  assert.equal(mapping.get("1"), "new");
  assert.equal(mapping.get("2"), "2");
  assert.equal(matchBackupTracks(backup(), [{ ...tracks[0], id: "x" }, { ...tracks[0], id: "y" }]).has("1"), false);
  assert.equal(matchBackupTracks(backup(), []).size, 0);
});
