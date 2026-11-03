import assert from "node:assert/strict";
import { test } from "node:test";
import { nextTrackId } from "../src/lib/playback.ts";

const options = (extra = {}) => ({ automatic: true, repeat: "off", shuffle: false, played: new Set(["a"]), ...extra });
test("automatic playback advances and stops at the end unless repeating the queue", () => {
  assert.equal(nextTrackId(["a", "b"], "a", options()), "b");
  assert.equal(nextTrackId(["a", "b"], "b", options()), null);
  assert.equal(nextTrackId(["a", "b"], "b", options({ repeat: "all" })), "a");
});
test("single stops, repeat-one repeats, and manual next overrides both", () => {
  assert.equal(nextTrackId(["a", "b"], "a", options({ repeat: "single" })), null);
  assert.equal(nextTrackId(["a", "b"], "a", options({ repeat: "one" })), "a");
  for (const repeat of ["single", "one"]) {
    assert.equal(nextTrackId(["a", "b"], "a", options({ repeat, automatic: false })), "b");
  }
});
test("shuffle traverses every track once and starts a new cycle only with repeat", () => {
  const config = options({ shuffle: true });
  let current = "a";
  for (let i = 0; i < 3; i++) {
    current = nextTrackId(["a", "b", "c", "d"], current, config);
    assert.ok(current);
    assert.ok(!config.played.has(current));
    config.played.add(current);
  }
  assert.equal(nextTrackId(["a", "b", "c", "d"], current, config), null);
  config.repeat = "all";
  assert.notEqual(nextTrackId(["a", "b", "c", "d"], current, config), current);
});
test("empty and single-track queues have defined end behavior", () => {
  assert.equal(nextTrackId([], null, options()), null);
  assert.equal(nextTrackId(["a"], "a", options({ shuffle: true })), null);
  assert.equal(nextTrackId(["a"], "a", options({ shuffle: true, repeat: "all" })), "a");
});
