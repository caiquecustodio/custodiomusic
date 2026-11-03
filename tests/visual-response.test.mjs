import assert from "node:assert/strict";
import { test } from "node:test";
import { latestRefresh } from "../src/lib/latest-refresh.ts";
import { scheduleIdle, yieldToInput } from "../src/lib/idle.ts";

test("download event bursts keep one in-flight read and deliver a trailing snapshot", async () => {
  const releases = [];
  let count = 0, active = 0, peak = 0;
  const refresh = latestRefresh(async () => {
    count++; active++; peak = Math.max(peak, active);
    await new Promise((resolve) => releases.push(resolve));
    active--;
  });
  const first = refresh();
  for (let index = 0; index < 100; index++) assert.equal(refresh(), first);
  assert.equal(count, 1);
  releases.shift()();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(count, 2);
  releases.shift()();
  await first;
  assert.equal(peak, 1);
  const next = refresh();
  assert.equal(count, 3);
  releases.shift()(); await next;
});

test("refresh failures release the lock for a later retry", async () => {
  let attempts = 0;
  const refresh = latestRefresh(async () => { if (++attempts === 1) throw new Error("offline"); });
  await assert.rejects(refresh(), /offline/);
  await refresh();
  assert.equal(attempts, 2);
});

test("idle scheduling yields and cancellation prevents obsolete work", async () => {
  let ran = false;
  const cancel = scheduleIdle(() => { ran = true; });
  cancel();
  let yielded = false;
  const task = yieldToInput().then(() => { yielded = true; });
  assert.equal(yielded, false);
  await task;
  assert.equal(ran, false);
  assert.equal(yielded, true);
});
