import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_RADIO, dayKey, weekStart, recapPeriods, summarize, radioCandidates, parseListening, extendRadioQueue } from "../src/lib/discovery-model.ts";
import { onlineTrack, mergeDownloads, completedTracks, isOffline } from "../src/lib/downloads/model.ts";
import { importM3u, exportM3u, possibleDuplicates, groupName } from "../src/lib/organization-model.ts";

const item = { provider: "youtube", id: "abcdefghijk", title: "Canção", artist: "Artista", duration: 180, url: "https://youtu.be/abcdefghijk", thumbnail: null, downloadable: true };
const local = (id, artist = "Artista") => ({ id, uri: `file:///music/${id}.mp3`, title: id, artist, duration: 180 });
const day = (date, id, seconds = 100, plays = 1) => ({ day: date, trackId: id, title: id, artist: "Artista", seconds, plays, skips: 0, completions: 0 });

test("online identity becomes offline without changing references or corrected metadata", () => {
  const online = { ...onlineTrack(item, []), title: "Título corrigido", metadataEdited: true };
  const downloaded = completedTracks([{ id: "job", state: "completed", uri: "file:///saved.m4a", duration: 180, artwork: null, item, format: { id: "m4a" } }]);
  const library = mergeDownloads([online], downloaded);
  assert.equal(library.length, 1); assert.equal(library[0].id, online.id); assert.equal(library[0].title, "Título corrigido"); assert.ok(isOffline(library[0]));
  assert.equal(onlineTrack(item, library), library[0]);
  assert.equal(mergeDownloads(library, downloaded), library);
  // Existing installations retain their download IDs.
  assert.equal(onlineTrack(item, downloaded).id, "download:job");
});

test("recap crosses months and years using local calendar weeks and keeps old weeks", () => {
  const now = new Date(2027, 0, 4, 12); // Monday
  assert.equal(dayKey(weekStart(now)), "2027-01-04");
  const days = [day("2026-12-27", "old"), day("2026-12-28", "a", 60), day("2027-01-03", "a", 120, 2), day("2027-01-04", "b", 30, 0)];
  const periods = recapPeriods(days, now);
  assert.equal(periods[0].from, "2026-12-29"); assert.equal(periods[1].from, "2026-12-28"); assert.equal(periods[1].to, "2027-01-03");
  const recap = summarize(days, periods[0].from, periods[0].to);
  assert.equal(recap.seconds, 150); assert.equal(recap.distinct, 2); assert.equal(recap.tracks[0].trackId, "a"); assert.equal(recap.artists[0].seconds, 150);
  assert.equal(summarize([], "2027-01-01", "2027-01-07").seconds, 0);
});

test("radio respects blocks, offline mode, recent tracks and artist variety", () => {
  const tracks = [local("a"), local("b"), local("c", "Outro"), onlineTrack(item, [])];
  const preferences = { ...DEFAULT_RADIO, offline: true, blockedTracks: ["b"] };
  assert.deepEqual(radioCandidates(tracks, [], [], preferences, ["a"], "Artista", () => 0.5).map((c) => c.track.id), ["c"]);
  assert.equal(radioCandidates(tracks.slice(0, 3), [], [], DEFAULT_RADIO, [], "Artista", () => 0.5)[0].track.id, "c");
  assert.deepEqual(radioCandidates(tracks, [], [], { ...preferences, blockedArtists: ["artista", "outro"] }, [], ""), []);
  assert.equal(radioCandidates([local("a")], [], [], preferences, ["a"], "").length, 1);
});

test("favorites and positive listening outweigh frequent early skips with controlled randomness", () => {
  const tracks = [local("favorite"), local("skipped")];
  const days = [{ ...day("2026-10-26", "skipped", 10, 0), skips: 20 }];
  const candidates = radioCandidates(tracks, days, ["favorite"], DEFAULT_RADIO, [], "", () => 0.5);
  assert.equal(candidates[0].track.id, "favorite");
});
test("small-library radio moves old songs behind the cursor and keeps explicit upcoming entries first", () => {
  assert.deepEqual(extendRadioQueue(["a", "b"], "b", ["a"]), ["b", "a"]);
  assert.deepEqual(extendRadioQueue(["b", "a"], "a", ["b"]), ["a", "b"]);
  assert.deepEqual(extendRadioQueue(["a", "b", "priority"], "b", ["a", "c"]), ["b", "priority", "a", "c"]);
  const queue = ["a", "b"];
  assert.equal(extendRadioQueue(queue, "a", ["b"]), queue);
  assert.deepEqual(extendRadioQueue(queue, "missing", ["c"]), ["a", "b", "c"]);
});

test("M3U UTF-8 roundtrip, relative paths, ambiguous basenames and missing files", () => {
  const tracks = [local("Canção"), local("Outra")];
  const exported = exportM3u([...tracks, onlineTrack(item, [])]);
  assert.equal(exported.omitted, 1); assert.deepEqual(importM3u(exported.text, tracks).ids, tracks.map((t) => t.id));
  assert.deepEqual(importM3u("\uFEFF#EXTM3U\r\n./Canção.mp3\r\nmissing.mp3", tracks), { ids: ["Canção"], missing: ["missing.mp3"] });
  assert.equal(importM3u("Canção.mp3", [...tracks, { ...local("copy"), uri: "file:///other/Canção.mp3" }]).missing.length, 1);
});

test("duplicate suggestions tolerate duration differences but never equate unrelated artists", () => {
  const a = local("a"); const b = { ...a, id: "b", duration: 182 }; const c = { ...a, id: "c", duration: 200 }; const d = { ...a, id: "d", artist: "Outro" };
  assert.deepEqual(possibleDuplicates([a, b, c, d]).map((g) => g.map((t) => t.id)), [["a", "b"]]);
  assert.equal(groupName(a, "folder"), "Pasta desconhecida");
});

test("invalid listening backups cannot restore negative or nonnumeric totals", () => {
  const data = { version: 1, days: [day("2026-10-26", "a")], events: [] };
  assert.equal(parseListening(data), data);
  for (const seconds of [-1, NaN, Infinity, "100"]) assert.throws(() => parseListening({ ...data, days: [{ ...data.days[0], seconds }] }));
  assert.throws(() => parseListening({ ...data, version: 2 }));
});
