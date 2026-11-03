import assert from "node:assert/strict";
import { test } from "node:test";
import { unifiedSearchResults } from "../src/lib/unified-search.ts";
const song = (id, extra = {}) => ({ id, title: "Coração de João", artist: "Forró do Sol", duration: 180, uri: "file:///song.mp3", ...extra });
const online = (id, extra = {}) => ({ id, provider: "audius", title: "Coração de João", artist: "Forró do Sol", duration: 180, url: "https://audius.co/song", thumbnail: null, downloadable: false, ...extra });

test("one search finds local titles, artists and albums without accents or case", () => {
  const tracks = [song("a", { album: "São João" }), song("b", { title: "Outra", artist: "Outro" })];
  assert.deepEqual(unifiedSearchResults("  CORACAO   forro ", tracks, []).map((row) => row.key), ["library:a"]);
  assert.equal(unifiedSearchResults("sao joao", tracks, []).length, 1);
  assert.deepEqual(unifiedSearchResults(" ", tracks, [online("x")]), []);
});
test("downloaded copies win over online session entries and duplicate provider results", () => {
  const source = { provider: "audius", sourceId: "x" };
  const rows = unifiedSearchResults("coracao", [song("session", { uri: "", online: source }), song("download", { origin: source })], [online("x"), online("y"), online("y")]);
  assert.deepEqual(rows.map((row) => row.key), ["library:download", "online:audius:y"]);
});
test("different recordings or sources with the same title remain available", () => {
  const rows = unifiedSearchResults("coracao", [song("local")], [online("x"), online("x", { provider: "youtube" })]);
  assert.equal(rows.length, 3);
});
test("resolved links reuse downloaded source identity even when query is a URL", () => {
  const rows = unifiedSearchResults("https://audius.co/artist/song", [song("download", { origin: { provider: "audius", sourceId: "x" } })], [online("x")]);
  assert.deepEqual(rows.map((row) => row.key), ["library:download"]);
});
test("unplayable metadata entries are excluded and online results survive no local match", () => {
  assert.deepEqual(unifiedSearchResults("rock", [song("missing", { uri: "" })], [online("x")]).map((row) => row.key), ["online:audius:x"]);
});
