import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import ts from "typescript";

// Transpile the provider module only; keep the app's Metro extensionless imports.
const source = await readFile(new URL("../src/lib/metadata-service.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace('"./metadata-model"', JSON.stringify(new URL("../src/lib/metadata-model.ts", import.meta.url).href))
  .replace('"./discovery-metadata"', JSON.stringify(new URL("../src/lib/discovery-metadata.ts", import.meta.url).href));
const { findLyrics, findCover, request, bestLyrics, findDiscoveryMetadata } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
const track = { id: "a", uri: "file:///a", title: "Faixa", artist: "Autor", album: "Disco", duration: 180 };
test("provider requests encode metadata and validate lyrics before ranking", async (context) => {
  let requested;
  context.mock.method(globalThis, "fetch", async (url) => {
    requested = new URL(url);
    return Response.json([
      { id: 1, trackName: "Faixa", artistName: "Autor", albumName: "Disco", duration: 180, syncedLyrics: "[00:01]Texto", plainLyrics: null },
      { id: 2, trackName: "Faixa", artistName: "Outro", duration: 180, plainLyrics: "Texto" },
      { id: 3, trackName: "Faixa", artistName: "Autor", duration: 180, plainLyrics: "x".repeat(50001) },
      { id: "invalid" },
    ]);
  });
  const matches = await findLyrics(track, new AbortController().signal);
  assert.equal(requested.hostname, "lrclib.net");
  assert.equal(requested.searchParams.get("artist_name"), "Autor");
  assert.equal(matches.length, 2);
  assert.equal(bestLyrics(track, matches).chosen.id, 1);
});
test("HTTP failures remain retryable errors rather than empty successful results", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response("", { status: 503 }));
  await assert.rejects(() => findLyrics(track, new AbortController().signal), /503/);
});
test("cancelled requests propagate the cancellation signal", async (context) => {
  const abort = new AbortController();
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    options.signal.throwIfAborted();
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("cancelled"))));
  });
  const pending = request("https://lrclib.net/api/search?q=test", abort.signal);
  abort.abort();
  await assert.rejects(pending, /cancelled/);
});
test("cover lookup rejects a different recording and chooses the matching album", async (context) => {
  const release = "12345678-1234-1234-1234-123456789abc";
  context.mock.method(globalThis, "fetch", async () => Response.json({ recordings: [
    { title: "Faixa", length: 220000, "artist-credit": [{ name: "Autor" }], releases: [{ id: release, title: "Outro" }] },
    { title: "Faixa", length: 180000, "artist-credit": [{ name: "Autor" }], releases: [{ id: "aaaaaaaa-1234-1234-1234-123456789abc", title: "Outro" }, { id: release, title: "Disco" }] },
  ] }));
  assert.equal((await findCover(track, new AbortController().signal))[0], `https://coverartarchive.org/release/${release}/front-500`);
});
test("missing artist never triggers an unreliable cover search", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", async () => { throw new Error("must not request"); });
  assert.deepEqual(await findCover({ ...track, artist: "Arquivo local" }, new AbortController().signal), []);
  assert.equal(fetch.mock.callCount(), 0);
});


test("discovery looks up confirmed recording genres and release year", async (context) => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const urls = [];
  context.mock.method(globalThis, "fetch", async (url) => {
    urls.push(new URL(url));
    return Response.json(urls.length === 1 ? { recordings: [{ id, title: "Faixa", score: 100, length: 180000, "artist-credit": [{ name: "Autor" }], "first-release-date": "2019-01-01" }] } : { id, genres: [{ name: "rock", count: 5 }, { name: "invalid", count: -1 }] });
  });
  const result = await findDiscoveryMetadata(track, new AbortController().signal);
  assert.equal(result.outcome, "found");
  assert.deepEqual(result.genres, ["rock"]);
  assert.equal(result.year, 2019);
  assert.equal(urls[1].searchParams.get("inc"), "genres");
  assert.equal(urls.length, 2);
});
test("discovery never requests genres for a mismatched recording", async (context) => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ recordings: [{ title: "Outra", "artist-credit": [{ name: "Autor" }] }] }); });
  const result = await findDiscoveryMetadata(track, new AbortController().signal);
  assert.equal(result.outcome, "missing");
  assert.deepEqual(result.genres, []);
  assert.equal(calls, 1);
});
test("cancelled MusicBrainz work does not poison the shared request queue", async (context) => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(() => findDiscoveryMetadata(track, abort.signal));
  context.mock.method(globalThis, "fetch", async () => Response.json({ recordings: [] }));
  assert.equal((await findDiscoveryMetadata(track, new AbortController().signal)).outcome, "missing");
});

test("artist genres remain reviewable suggestions when the recording has no genre", async (context) => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const artistId = "aaaaaaaa-1234-1234-1234-123456789abc";
  const urls = [];
  context.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(url); urls.push(parsed);
    if (parsed.pathname.endsWith("/recording/")) return Response.json({ recordings: [{ id, title: "Faixa", score: 100, length: 180000, "artist-credit": [{ name: "Autor", artist: { id: artistId, name: "Autor" } }] }] });
    if (parsed.pathname.includes("/artist/")) return Response.json({ genres: [{ name: "blues", count: 4 }] });
    return Response.json({ id, genres: [] });
  });
  const result = await findDiscoveryMetadata(track, new AbortController().signal);
  assert.deepEqual(result.genres, []);
  assert.deepEqual(result.suggestedGenres, ["blues"]);
  assert.equal(result.outcome, "found");
  assert.equal(urls.length, 3);
  assert.equal(urls[2].pathname, `/ws/2/artist/${artistId}`);
});

test("optional artist lookup failure preserves the confirmed recording", async (context) => {
  const id = "12345678-1234-1234-1234-123456789abc";
  context.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/recording/")) return Response.json({ recordings: [{ id, title: "Faixa", score: 100, length: 180000, "artist-credit": [{ name: "Autor", artist: { id, name: "Autor" } }] }] });
    if (parsed.pathname.includes("/artist/")) return new Response("", { status: 503 });
    return Response.json({ id, genres: [] });
  });
  const result = await findDiscoveryMetadata(track, new AbortController().signal);
  assert.equal(result.recordingId, id);
  assert.deepEqual(result.suggestedGenres, []);
});

test("title-only discovery presents artists for review without guessing the genre", async (context) => {
  const id = "12345678-1234-1234-1234-123456789abc";
  let url;
  context.mock.method(globalThis, "fetch", async (value) => {
    url = new URL(value);
    return Response.json({ recordings: [
      { id, title: "Faixa", length: 180000, "artist-credit": [{ name: "Autor" }] },
      { id: "aaaaaaaa-1234-1234-1234-123456789abc", title: "Outra", length: 180000, "artist-credit": [{ name: "Outro" }] },
      { id: "bbbbbbbb-1234-1234-1234-123456789abc", title: "Faixa", length: 300000, "artist-credit": [{ name: "Outro" }] },
    ] });
  });
  const result = await findDiscoveryMetadata({ ...track, artist: "Arquivo local" }, new AbortController().signal);
  assert.deepEqual(result.genres, []);
  assert.equal(result.outcome, "missing");
  assert.deepEqual(result.candidates, [{ recordingId: id, title: "Faixa", artist: "Autor" }]);
  assert.equal(url.searchParams.get("query"), 'recording:"Faixa"');
});
