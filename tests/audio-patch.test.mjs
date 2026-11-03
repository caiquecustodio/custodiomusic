import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyExpoAudioPatch } from '../scripts/patch-expo-audio.mjs';

function fixture(t, { version = '58.0.10', sourceBuild = true, source } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'custodio-audio-patch-'));
  t.after(() => { assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('custodio-audio-patch-')); fs.rmSync(root, { recursive: true, force: true }); });
  const relative = 'android/src/main/java/expo/modules/audio/service/MetadataInjectingPlayer.kt';
  const target = path.join(root, 'node_modules/expo-audio', relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.mkdirSync(path.join(root, 'patches/expo-audio'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ expo: { autolinking: { android: { buildFromSource: sourceBuild ? ['expo-audio'] : [] } } } }));
  fs.writeFileSync(path.join(root, 'node_modules/expo-audio/package.json'), JSON.stringify({ version }));
  const replacement = fs.readFileSync(new URL('../patches/expo-audio/MetadataInjectingPlayer.kt', import.meta.url), 'utf8');
  fs.writeFileSync(path.join(root, 'patches/expo-audio/MetadataInjectingPlayer.kt'), replacement);
  fs.writeFileSync(target, source ?? replacement);
  return { root, target, replacement };
}
test('audio backport is idempotent and accepts CRLF line endings', (t) => {
  const { root, target, replacement } = fixture(t);
  fs.writeFileSync(target, replacement.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'));
  assert.equal(applyExpoAudioPatch(root), false);
  assert.equal(applyExpoAudioPatch(root), false);
});
test('unknown upstream changes are preserved and require review', (t) => {
  const { root, target } = fixture(t, { source: 'upstream changed' });
  assert.throws(() => applyExpoAudioPatch(root), /código desconhecido/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'upstream changed');
});
test('a dependency upgrade requires reevaluating the pinned backport', (t) => {
  const { root } = fixture(t, { version: '58.0.11' });
  assert.throws(() => applyExpoAudioPatch(root), /Reavalie/);
});
test('builds cannot silently use the vulnerable precompiled module', (t) => {
  const { root } = fixture(t, { sourceBuild: false });
  assert.throws(() => applyExpoAudioPatch(root), /AAR pré-compilado/);
});
