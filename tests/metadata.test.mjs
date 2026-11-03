import assert from "node:assert/strict";
import { test } from "node:test";
import { activeLyric, lyricTimeline, parseLrc, rankLyrics, searchIdentity } from "../src/lib/metadata-model.ts";
import { mergeDownloads } from "../src/lib/downloads/model.ts";

const identity = { title: "Canção", artist: "Artista", album: "Disco" };
const match = (patch = {}) => ({ id: 1, trackName: "Canção", artistName: "Artista", albumName: "Disco", duration: 180, instrumental: false, plainLyrics: "Teste", syncedLyrics: null, ...patch });
const record = (patch = {}) => ({ plain: "Primeira frase\n\nSegunda frase\nTerceira frase", synced: "", instrumental: false, source: "Teste", ...patch });
test("plain lyric phrases divide the full duration equally and follow seeking", () => {
  const timeline = lyricTimeline(record(), 90);
  assert.equal(timeline.mode, "estimated");
  assert.deepEqual(timeline.lines.map((line) => line.time), [0, 30, 60]);
  assert.equal(activeLyric(timeline.lines, 29.99), 0);
  assert.equal(activeLyric(timeline.lines, 30), 1);
  assert.equal(activeLyric(timeline.lines, 89.9), 2);
  assert.equal(activeLyric(timeline.lines, 5), 0);
});
test("real timestamps win over estimates, even before duration loads", () => {
  const lyrics = record({ synced: "[00:10]Primeira\n[00:45]Segunda" });
  assert.deepEqual(lyricTimeline(lyrics, 0), { mode: "synced", lines: [{ time: 10, text: "Primeira" }, { time: 45, text: "Segunda" }] });
  assert.equal(lyricTimeline(record({ plain: "[00:05]Importada" }), 100).mode, "synced");
});
test("section headings and empty lines do not consume estimated singing time", () => {
  assert.deepEqual(lyricTimeline(record({ plain: "[Verso]\r\nPrimeira\r\n\r\n[Refrão]\r\nSegunda" }), 60).lines, [{ time: 0, text: "Primeira" }, { time: 30, text: "Segunda" }]);
  assert.deepEqual(lyricTimeline(record({ plain: "Uma frase. Outra frase! Última?" }), 60).lines.map((line) => line.time), [0, 20, 40]);
});
test("missing lyrics, instrumentals and invalid duration never fabricate timing", () => {
  for (const duration of [0, -10, NaN, Infinity]) assert.deepEqual(lyricTimeline(record(), duration), { lines: [], mode: "none" });
  for (const lyrics of [null, record({ plain: "\n [Refrão] \n" }), record({ instrumental: true })]) assert.equal(lyricTimeline(lyrics, 60).lines.length, 0);
});
test("estimated timing recalculates when duration becomes available and respects playback offset", () => {
  assert.equal(lyricTimeline(record(), 0).mode, "none");
  const { lines } = lyricTimeline(record(), 120);
  assert.deepEqual(lines.map((line) => line.time), [0, 40, 80]);
  assert.equal(activeLyric(lines, 40 - 2), 0);
  assert.equal(activeLyric(lines, 42 - 2), 1);
  assert.equal(activeLyric(lyricTimeline(record({ plain: "Uma frase" }), 80).lines, 79), 0);
});
test("LRC supports repeated stamps, decimal precision, offsets, metadata and blank instrumental lines", () => {
  assert.deepEqual(parseLrc("[ar:Artista]\n[offset:-500]\n[00:02.50][00:10.125]Teste\n[00:00.00]\n[01:02:5]Fim"), [
    { time: 0, text: "" }, { time: 2, text: "Teste" }, { time: 9.625, text: "Teste" }, { time: 62, text: "Fim" },
  ]);
  assert.deepEqual(parseLrc("[00:99.2]Inválida\nTexto comum"), []);
});
test("active line follows playback and seeks backwards, without highlighting before the first timestamp", () => {
  const lines = parseLrc("[00:05]A\n[00:10]B\n[00:20]C");
  assert.equal(activeLyric(lines, 0), -1);
  assert.equal(activeLyric(lines, 10), 1);
  assert.equal(activeLyric(lines, 6), 0);
  assert.equal(activeLyric(lines, 900), 2);
  assert.equal(activeLyric([], 10), -1);
});
test("filename fallback extracts artist and title without inventing an artist", () => {
  assert.deepEqual(searchIdentity({ title: "Artista - Canção (Official Video)", artist: "Arquivo local" }), { title: "Canção", artist: "Artista", album: "" });
  assert.equal(searchIdentity({ title: "Faixa 01", artist: "Pasta selecionada" }).artist, "");
  assert.equal(searchIdentity({ title: "Canção (Ao vivo)", artist: "Artista" }).title, "Canção (Ao vivo)");
});
test("matching prefers synced lyrics only when the recording is a confident match", () => {
  const ranked = rankLyrics([match(), match({ id: 2, syncedLyrics: "[00:01]Teste" }), match({ id: 3, artistName: "Outro", syncedLyrics: "[00:01]Teste" })], identity, 180);
  assert.equal(ranked[0].item.id, 2);
  assert.equal(ranked[0].trusted, true);
  assert.equal(ranked.find((entry) => entry.item.id === 3).trusted, false);
});
test("unknown duration, artist, alternate versions and timing mismatch require manual review", () => {
  for (const [entry, query, duration] of [
    [match(), identity, 0], [match(), { ...identity, artist: "" }, 180],
    [match({ duration: 190 }), identity, 180], [match({ trackName: "Canção (ao vivo)" }), identity, 180],
  ]) assert.equal(rankLyrics([entry], query, duration)[0].trusted, false);
});
test("download refresh preserves corrected metadata, offline artwork, lyrics status and timing offset", () => {
  const track = { id: "a", uri: "file:///a", title: "Corrigida", artist: "Autor", duration: 180, artwork: "file:///music-covers/a.jpg", album: "Disco", metadataEdited: true, lyricsOffset: 1, sync: { checkedAt: 1, outcome: "found", hasLyrics: true } };
  const result = mergeDownloads([track], [{ id: "a", uri: "file:///new", title: "Antiga", artist: "Errado", duration: 180, artwork: "https://example.test/a.jpg" }])[0];
  assert.equal(result.title, "Corrigida");
  assert.equal(result.artwork, track.artwork);
  assert.equal(result.sync.hasLyrics, true);
  assert.equal(result.lyricsOffset, 1);
  assert.equal(result.uri, "file:///new");
});
