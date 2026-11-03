import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeDuration,
  formatDuration,
  formatPosition,
  restoreDuration,
} from "../src/lib/duration.ts";
test("media-library milliseconds become canonical seconds", () => {
  assert.equal(normalizeDuration(184000, "milliseconds"), 184);
  assert.equal(
    formatDuration(normalizeDuration(184000, "milliseconds")),
    "3:04",
  );
  assert.equal(normalizeDuration(184.5, "seconds"), 184.5);
});
test("unknown, invalid and zero durations have a neutral label", () => {
  for (const value of [undefined, null, NaN, Infinity, -1, 0]) {
    assert.equal(normalizeDuration(value, "milliseconds"), 0);
  }
  assert.equal(formatDuration(0), "—:—");
  assert.equal(formatDuration(NaN), "—:—");
  assert.equal(formatPosition(0), "0:00");
});
test("legacy values are invalidated without changing identity or artwork", () => {
  assert.deepEqual(
    restoreDuration({ id: "local:1", duration: 184000, artwork: "cover.jpg" }),
    {
      id: "local:1",
      duration: 0,
      durationUnit: "seconds",
      artwork: "cover.jpg",
    },
  );
});
test("persisted seconds survive repeated reloads without double conversion", () => {
  const track = { id: "local:1", duration: 184.5, durationUnit: "seconds" };
  const first = restoreDuration(JSON.parse(JSON.stringify(track)));
  assert.deepEqual(restoreDuration(JSON.parse(JSON.stringify(first))), track);
});
