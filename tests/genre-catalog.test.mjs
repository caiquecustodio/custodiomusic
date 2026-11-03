import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmedGenres, createPersonalGenre, personalGenreMatches, discoveryIdentity, contextMatches, contextQuery, isPersonalGenre } from "../src/lib/discovery-metadata.ts";
import { groupNames } from "../src/lib/organization-model.ts";
import { searchIdentity } from "../src/lib/metadata-model.ts";
import { parseBackup } from "../src/lib/backup-model.ts";
import { DEFAULT_STATE } from "../src/lib/types.ts";

const track = (id, artist = "Autor", genres = []) => {
  const value = { id, title: id, artist, uri: `file:///${id}`, duration: 180 };
  return { ...value, discovery: { identity: discoveryIdentity(value), genres, checkedAt: Date.now(), source: "MusicBrainz", outcome: "found" } };
};
test("a personal genre snapshots confirmed similar music and can include future matches", () => {
  const seed = track("a", "Autor", ["rock"]), similar = track("b", "Outro", ["rock"]), unrelated = track("c", "Autor", ["pop"]);
  const category = createPersonalGenre("  Rock   para viajar  ", seed, [seed, similar, unrelated], true, true);
  assert.equal(category.name, "Rock para viajar");
  assert.deepEqual(category.trackIds, ["a", "b"]);
  assert.equal(personalGenreMatches(track("future", "Novo", ["rock"]), category), true);
  assert.equal(personalGenreMatches(unrelated, category), false);
  assert.deepEqual(contextQuery({ category }), "rock músicas");
});
test("disabling future inclusion preserves the selection without classifying newcomers", () => {
  const seed = track("a", "Autor", ["rock"]), other = track("b", "Outro", ["rock"]);
  const category = createPersonalGenre("Viagem", seed, [seed, other], true, false);
  assert.equal(personalGenreMatches(other, category), true);
  assert.equal(personalGenreMatches(track("future", "Novo", ["rock"]), category), false);
});
test("single-song selection never invents similarity rules", () => {
  const seed = track("a", "Autor", ["rock"]);
  const category = createPersonalGenre("Minha seleção", seed, [seed, track("b", "Autor", ["rock"])], false, true);
  assert.deepEqual(category.trackIds, ["a"]);
  assert.equal(category.autoInclude, false);
  assert.deepEqual(category.matchGenres, []);
});
test("unknown genre uses only the explicitly chosen artist fallback", () => {
  const seed = track("a"), other = track("b"), unrelated = track("c", "Outro");
  const category = createPersonalGenre("Favoritas do autor", seed, [seed, other, unrelated], true, true);
  assert.equal(personalGenreMatches(other, category), true);
  assert.equal(personalGenreMatches(unrelated, category), false);
  const unknown = track("unknown", "Arquivo local");
  const emptyRule = createPersonalGenre("Sem dados", unknown, [unknown, track("another", "Arquivo local")], true, true);
  assert.deepEqual(emptyRule.trackIds, ["unknown"]);
});
test("stale genres and artist hints never become confirmed catalog entries", () => {
  const seed = track("a", "Autor", ["rock"]);
  assert.deepEqual(confirmedGenres({ ...seed, title: "Corrigido" }), []);
  const hint = { ...track("hint"), discovery: { ...track("hint").discovery, suggestedGenres: ["rock"] } };
  const category = createPersonalGenre("Rock", seed, [seed], true, true);
  assert.equal(personalGenreMatches(hint, category), false);
  assert.equal(contextMatches({ ...seed, title: "Corrigido" }, { category }), true); // explicit membership remains the user's choice
  assert.equal(contextMatches({ ...track("new", "Outro", ["rock"]), title: "Corrigido" }, { category }), false);
});
test("catalog groups retain all confirmed styles alongside personal categories", () => {
  const seed = track("a", "Autor", ["rock", "progressive rock"]);
  const category = createPersonalGenre("Estrada", seed, [seed], false, false);
  assert.deepEqual(groupNames(seed, "genre", [category]), ["rock", "progressive rock", "Estrada"]);
});
test("online catalog membership follows the same song after downloading", () => {
  const seed = { ...track("online:youtube:abc"), uri: "", online: { provider: "youtube", sourceId: "abc" } };
  const category = createPersonalGenre("Seleção", seed, [seed], false, false);
  const downloaded = { ...track("download:123"), origin: { provider: "youtube", sourceId: "abc" } };
  assert.equal(personalGenreMatches(downloaded, category), true);
});
test("radio rotates through category genres rather than searching an arbitrary personal label", () => {
  const seed = track("a", "Autor", ["rock", "blues"]);
  const category = createPersonalGenre("Estrada", seed, [seed], true, true);
  assert.equal(contextQuery({ category }, 0), "rock músicas");
  assert.equal(contextQuery({ category }, 1), "blues músicas");
});
test("YouTube artist prefixes and Topic suffixes resolve to the recording identity", () => {
  assert.deepEqual(searchIdentity({ title: "Autor - Canção (Official Video)", artist: "Autor - Topic" }), { title: "Canção", artist: "Autor", album: "" });
  assert.equal(searchIdentity({ title: "Outro - Canção (ao vivo)", artist: "Autor" }).title, "Outro - Canção (ao vivo)");
});
test("personal genres validate on backup restore and old backups remain supported", () => {
  const category = createPersonalGenre("Meu gênero", track("a"), [], false, false);
  assert.equal(isPersonalGenre(category), true);
  assert.equal(isPersonalGenre({ ...category, matchGenres: "rock" }), false);
  assert.throws(() => createPersonalGenre("   ", track("a"), [], false, false));
  const backup = { format: "custodio-backup", version: 1, state: { ...DEFAULT_STATE, personalGenres: [category] }, tracks: [], lyrics: [] };
  assert.equal(parseBackup(JSON.stringify(backup)).state.personalGenres[0].name, "Meu gênero");
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, state: { ...backup.state, personalGenres: [{ ...category, autoInclude: "yes" }] } })));
  delete backup.state.personalGenres;
  assert.equal(parseBackup(JSON.stringify(backup)).version, 1);
});
