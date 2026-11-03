import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import {
  CERTIFICATE, PACKAGE, POLICY, GiB, CommandRunner, MemoryWatch,
  acquireLock, assertStartMemory, cleanupPublishDirectory, gradleHeapMiB, hashFile,
  nativeFingerprint, nextVersionCode, parseBadging, processAlive,
  publishRelease, readJson, requestStop, startProtection, validateApkMetadata, writeJsonAtomic,
} from '../scripts/apk-support.mjs';

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'custodio-apk-tests-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('custodio-apk-tests-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
test('lower heap profiles preserve the default and reject unsafe JVM argument overrides', () => {
  assert.equal(gradleHeapMiB(undefined), 1536);
  for (const value of ['768', '1024', '1280', '1536']) assert.equal(gradleHeapMiB(value), Number(value));
  for (const value of ['0', '-1', '4096', '1024 -Xmx8g', 'NaN']) assert.throws(() => gradleHeapMiB(value), /proteção de RAM/);
});

test('preflight blocks below 1 GiB before a compiler can start', () => {
  assert.equal(POLICY.startBytes, GiB);
  assert.throws(() => assertStartMemory(POLICY.startBytes - 1), /Nenhum compilador/);
  assert.doesNotThrow(() => assertStartMemory(POLICY.startBytes));
});

test('low-memory monitor requires ten continuous seconds and resets after recovery', () => {
  let now = 0;
  let free = 7 * GiB;
  const watch = new MemoryWatch({ freeMemory: () => free, totalMemory: 16 * GiB, now: () => now });
  assert.equal(watch.sample(), false);
  free = GiB;
  assert.equal(watch.sample(), false);
  now = 9999;
  assert.equal(watch.sample(), false);
  free = 3 * GiB;
  assert.equal(watch.sample(), false);
  free = GiB;
  now = 11000;
  assert.equal(watch.sample(), false);
  now = 21000;
  assert.equal(watch.sample(), true);
  assert.equal(watch.stats().minAvailableBytes, GiB);
  assert.equal(watch.stats().peakSystemUsedBytes, 15 * GiB);
});

test('exclusive lock refuses another build and a stale stop request does not cancel a new owner', async (t) => {
  const root = workspace(t);
  const lock = acquireLock(root);
  assert.throws(() => acquireLock(root), /Nenhuma segunda compilação/);
  writeJsonAtomic(path.join(root, 'stop.json'), { id: 'old-owner' });
  const runner = new CommandRunner({ verbose: false });
  const guard = startProtection({ runner, lock, directory: root, memory: new MemoryWatch({ freeMemory: () => 8 * GiB }), intervalMs: 10 });
  try {
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(runner.reason, null);
  } finally { guard.stop(); lock.release(); }
  const next = acquireLock(root);
  next.release();
  assert.equal(fs.existsSync(path.join(root, 'lock.json')), false);
});

test('stop with no build is harmless', async (t) => {
  assert.match(await requestStop(workspace(t)), /Nenhuma geração/);
});

async function cancellationFixture(t, byMemory) {
  const root = workspace(t);
  const lock = acquireLock(root);
  const published = path.join(root, 'CustodioMusic.apk');
  fs.writeFileSync(published, 'old-installed-compatible-apk');
  let memoryLow = false;
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  let descendant;
  let output = '';
  const runner = new CommandRunner({ verbose: false, onOutput(chunk) {
    output += chunk;
    const match = output.match(/DESCENDANT=(\d+)/);
    if (match) { descendant = Number(match[1]); readyResolve(); }
  } });
  let clock = 0;
  const memory = new MemoryWatch({ freeMemory: () => memoryLow ? GiB : 8 * GiB, now: () => { clock += 10_000; return clock; } });
  const guard = startProtection({ runner, lock, directory: root, memory, intervalMs: 20 });
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
  const fixture = `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});child.on('spawn',()=>console.log('DESCENDANT='+child.pid));setInterval(()=>{},1000);`;
  let running;
  try {
    running = runner.run(process.execPath, ['-e', fixture], { cwd: root });
    const settled = running.then(() => ({ success: true }), (error) => ({ error }));
    await Promise.race([ready, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('fixture startup timeout')), 10_000); timer.unref(); })]);
    assert.equal(processAlive(descendant), true);
    const ownerChild = runner.active.pid;
    if (byMemory) memoryLow = true;
    else {
      const stop = requestStop(root);
      const result = await settled;
      assert.match(result.error.message, /apk:stop/);
      guard.stop();
      lock.release();
      assert.match(await stop, /encerrada/);
    }
    if (byMemory) {
      const result = await settled;
      assert.match(result.error.message, /RAM disponível/);
    }
    assert.equal(processAlive(ownerChild), false);
    // taskkill /T (or the POSIX group) must also end grandchildren.
    for (let retry = 0; retry < 30 && processAlive(descendant); retry++) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(processAlive(descendant), false);
    assert.equal(processAlive(unrelated.pid), true);
    assert.equal(fs.readFileSync(published, 'utf8'), 'old-installed-compatible-apk');
  } finally {
    await runner.cancel('fixture cleanup').catch(() => {});
    await running?.catch(() => {});
    guard.stop();
    lock.release();
    unrelated.kill();
    await new Promise((resolve) => { if (unrelated.exitCode !== null || unrelated.signalCode !== null) resolve(); else unrelated.once('close', resolve); });
  }
}

test('apk:stop kills only its own child tree and keeps the old APK', { timeout: 25_000 }, async (t) => cancellationFixture(t, false));
test('low RAM cancels an active process tree and keeps unrelated processes', { timeout: 25_000 }, async (t) => cancellationFixture(t, true));

test('native fingerprint changes for native configuration, not UI source edits', (t) => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'plugins'));
  fs.mkdirSync(path.join(root, 'assets'));
  writeJsonAtomic(path.join(root, 'app.json'), { expo: { icon: './assets/icon.png' } });
  fs.writeFileSync(path.join(root, 'assets/icon.png'), 'icon');
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  const before = nativeFingerprint(root);
  fs.writeFileSync(path.join(root, 'src', 'App.tsx'), 'changed UI');
  assert.equal(nativeFingerprint(root), before);
  fs.writeFileSync(path.join(root, 'plugins', 'native.js'), 'native config');
  assert.notEqual(nativeFingerprint(root), before);
  const withPlugin = nativeFingerprint(root);
  fs.writeFileSync(path.join(root, 'assets/icon.png'), 'new icon');
  assert.notEqual(nativeFingerprint(root), withPlugin);
});

test('update counter stays above both the published APK and the saved counter', () => {
  assert.equal(nextVersionCode(2, 0, 1), 2);
  assert.equal(nextVersionCode(2, 8, 3), 9);
  assert.equal(nextVersionCode(2, 8, 10), 11);
  assert.throws(() => nextVersionCode(2, undefined, 1), /inválido/);
});

test('APK validator rejects wrong signing, identity, version, ABI or missing embedded JS', () => {
  const metadata = parseBadging("package: name='com.custodio.music' versionCode='2' versionName='1.0.0'\nnative-code: 'arm64-v8a'\n");
  const valid = { certificate: CERTIFICATE, metadata, entries: 'AndroidManifest.xml\nassets/index.android.bundle\n', versionCode: 2, architectures: ['arm64-v8a'] };
  assert.doesNotThrow(() => validateApkMetadata(valid));
  assert.throws(() => validateApkMetadata({ ...valid, certificate: 'other' }), /Assinatura/);
  assert.throws(() => validateApkMetadata({ ...valid, metadata: { ...metadata, packageName: `${PACKAGE}.different` } }), /Identificador/);
  assert.throws(() => validateApkMetadata({ ...valid, versionCode: 3 }), /versão/);
  assert.throws(() => validateApkMetadata({ ...valid, architectures: ['x86_64'] }), /Arquiteturas/);
  assert.throws(() => validateApkMetadata({ ...valid, entries: 'AndroidManifest.xml' }), /JavaScript/);
});

function publication(t) {
  const root = workspace(t);
  const releases = path.join(root, 'releases');
  fs.mkdirSync(releases);
  const directory = fs.mkdtempSync(path.join(releases, '.publish-'));
  fs.writeFileSync(path.join(releases, 'CustodioMusic.apk'), 'old apk');
  fs.writeFileSync(path.join(releases, 'CustodioMusic.apk.sha256'), 'old checksum');
  fs.writeFileSync(path.join(directory, 'CustodioMusic.apk'), 'new apk');
  fs.writeFileSync(path.join(directory, 'CustodioMusic.apk.sha256'), 'new checksum');
  const stateFile = path.join(root, 'version.json');
  writeJsonAtomic(stateFile, { lastVersionCode: 1 });
  return { directory, releases, stateFile, state: { lastVersionCode: 2 } };
}

test('successful publication replaces one APK and commits the version counter', (t) => {
  const params = publication(t);
  publishRelease(params);
  cleanupPublishDirectory(params.directory, params.releases);
  assert.equal(fs.readFileSync(path.join(params.releases, 'CustodioMusic.apk'), 'utf8'), 'new apk');
  assert.equal(readJson(params.stateFile).lastVersionCode, 2);
  assert.equal(fs.readdirSync(params.releases).filter((name) => name.endsWith('.apk')).length, 1);
});

test('publication failure after replacing APK restores the previous APK, hash and counter', (t) => {
  const params = publication(t);
  let renames = 0;
  assert.throws(() => publishRelease({ ...params, rename(source, destination) {
    if (++renames === 2) throw new Error('simulated disk failure');
    fs.renameSync(source, destination);
  } }), /disk failure/);
  assert.equal(fs.readFileSync(path.join(params.releases, 'CustodioMusic.apk'), 'utf8'), 'old apk');
  assert.equal(fs.readFileSync(path.join(params.releases, 'CustodioMusic.apk.sha256'), 'utf8'), 'old checksum');
  assert.equal(readJson(params.stateFile).lastVersionCode, 1);
  assert.throws(() => cleanupPublishDirectory(params.releases, params.releases), /fora de releases/);
});

test('counter write failure rolls back both the new APK and checksum', (t) => {
  const params = publication(t);
  let renames = 0;
  assert.throws(() => publishRelease({ ...params, rename(source, destination) {
    if (++renames === 3) throw new Error('simulated counter write failure');
    fs.renameSync(source, destination);
  } }), /counter write/);
  assert.equal(fs.readFileSync(path.join(params.releases, 'CustodioMusic.apk'), 'utf8'), 'old apk');
  assert.equal(fs.readFileSync(path.join(params.releases, 'CustodioMusic.apk.sha256'), 'utf8'), 'old checksum');
  assert.equal(readJson(params.stateFile).lastVersionCode, 1);
});

test('Expo config plugin preserves identical Gradle inputs on repeated syncs', async () => {
  const plugin = createRequire(import.meta.url)('../plugins/withStandaloneDebug.js');
  const config = plugin({});
  for (const [name, seed, marker] of [
    ['appBuildGradle', 'apply plugin: "com.android.application"\n', '// Custodio standalone debug APK'],
    ['projectBuildGradle', 'buildscript {}\n\napply plugin: "expo-root-project"\napply plugin: "com.facebook.react.rootproject"\n', '// Custodio native build cache'],
  ]) {
    const mod = config.mods.android[name];
    const apply = async (contents) => (await mod({ modRequest: {}, modResults: { language: 'groovy', contents } })).modResults.contents;
    const first = await apply(seed);
    assert.equal(await apply(await apply(first)), first);
    assert.equal(first.split(marker).length - 1, 1);
    if (name === 'appBuildGradle') {
      assert.ok(first.includes('../.local/android-signing/debug.keystore'));
      assert.ok(first.includes("findProperty('custodio.versionCode')"));
    } else {
      assert.ok(first.indexOf(marker) < first.indexOf('apply plugin: "expo-root-project"'));
    }
  }
});

test('SHA-256 uses streamed file contents', async (t) => {
  const file = path.join(workspace(t), 'file');
  fs.writeFileSync(file, 'abc');
  assert.equal(await hashFile(file), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
