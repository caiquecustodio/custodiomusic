import fs from 'node:fs';
import { applyExpoAudioPatch } from './patch-expo-audio.mjs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  CERTIFICATE, PACKAGE, CommandRunner,
  acquireLock, assertStartMemory, cleanupPublishDirectory, gib, gradleHeapMiB, hashFile,
  nativeFingerprint, nextVersionCode, parseBadging, publishRelease,
  readJson, requestStop, startProtection, validateApkMetadata, writeJsonAtomic,
} from './apk-support.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, '.local', 'apk-build');
const signingKey = path.join(root, '.local', 'android-signing', 'debug.keystore');
const releases = path.join(root, 'releases');
const targetApk = path.join(releases, 'CustodioMusic.apk');
const versionFile = path.join(local, 'version.json');
const syncFile = path.join(local, 'native-sync.json');
const windows = process.platform === 'win32';

function jdkMajor(home) {
  if (!home || !fs.existsSync(path.join(home, 'bin', windows ? 'javac.exe' : 'javac'))) return 0;
  const release = path.join(home, 'release');
  return fs.existsSync(release) ? Number(fs.readFileSync(release, 'utf8').match(/JAVA_VERSION="(\d+)/)?.[1]) : 0;
}

function environment() {
  const homes = new Set([process.env.JAVA_HOME]);
  const containers = [path.join(os.homedir(), 'Android', 'jdk'), ...(windows
    ? ['C:/Program Files/Eclipse Adoptium', 'C:/Program Files/Java', 'C:/Program Files/Android/Android Studio']
    : ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines'])];
  for (const directory of containers) {
    if (!fs.existsSync(directory)) continue;
    homes.add(directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        homes.add(path.join(directory, entry.name));
        homes.add(path.join(directory, entry.name, 'Contents', 'Home'));
      }
    }
  }
  const jdk21 = [...homes].find((home) => jdkMajor(home) === 21);
  const jdk17 = [...homes].find((home) => jdkMajor(home) === 17);
  if (!jdk21 || !jdk17) throw new Error('Instale JDK 21 (Gradle) e JDK 17 (plugins React Native) em ~/Android/jdk ou configure JAVA_HOME. Não serão baixadas toolchains automaticamente.');
  const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'Android', 'sdk'),
    ...(windows ? [path.join(process.env.LOCALAPPDATA || os.homedir(), 'Android', 'Sdk'), 'C:/Android/Sdk'] : [path.join(os.homedir(), 'Library', 'Android', 'sdk'), '/opt/android-sdk']),
  ].find((home) => home && fs.existsSync(path.join(home, 'platform-tools')));
  if (!sdk) throw new Error('Android SDK não encontrado. Configure ANDROID_HOME.');
  const tools = path.join(sdk, 'build-tools', '37.0.0');
  const java = path.join(jdk21, 'bin', windows ? 'java.exe' : 'java');
  const keytool = path.join(jdk21, 'bin', windows ? 'keytool.exe' : 'keytool');
  const apksigner = path.join(tools, 'lib', 'apksigner.jar');
  const aapt = path.join(tools, windows ? 'aapt.exe' : 'aapt');
  for (const file of [java, keytool, apksigner, aapt, path.join(sdk, 'ndk', '27.1.12297006', 'source.properties'), path.join(sdk, 'cmake', '3.22.1', 'bin', windows ? 'ninja.exe' : 'ninja'), path.join(root, 'node_modules', 'expo', 'bin', 'cli')]) {
    if (!fs.existsSync(file)) throw new Error(`Pré-requisito ausente: ${file}. Instale as dependências/SDK antes de compilar.`);
  }
  if (!['android-37', 'android-37.0'].some((name) => fs.existsSync(path.join(sdk, 'platforms', name)))) throw new Error('Plataforma Android SDK 37 ausente.');
  return { sdk, java, keytool, apksigner, aapt, jdk21, jdk17, env: {
    ...process.env, JAVA_HOME: jdk21, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
    PATH: [path.join(jdk21, 'bin'), path.join(sdk, 'platform-tools'), process.env.PATH || process.env.Path || ''].join(path.delimiter),
  } };
}

async function certificateOfKey(runner, tools, key) {
  const output = await runner.run(tools.keytool, ['-J-Xmx64m', '-J-XX:MaxMetaspaceSize=128m', '-exportcert', '-rfc', '-keystore', key, '-alias', 'androiddebugkey', '-storepass', 'android'], { cwd: root, env: tools.env, capture: true, quiet: true });
  const pem = output.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)?.[0];
  if (!pem || new crypto.X509Certificate(pem).fingerprint256.replaceAll(':', '').toLowerCase() !== CERTIFICATE) throw new Error('A chave não corresponde à assinatura do APK antigo. Não será gerada outra chave.');
}

async function inspectApk(runner, tools, file, expected = {}) {
  const opts = { cwd: root, env: tools.env, capture: true, quiet: true };
  const signed = await runner.run(tools.java, ['-Xmx64m', '-XX:MaxMetaspaceSize=128m', '-jar', tools.apksigner, 'verify', '--print-certs', file], opts);
  const certificates = [...new Set([...signed.matchAll(/certificate SHA-256 digest:\s*([a-fA-F0-9]+)/g)].map((match) => match[1].toLowerCase()))];
  const badging = await runner.run(tools.aapt, ['dump', 'badging', file], opts);
  const entries = await runner.run(tools.aapt, ['list', file], opts);
  const metadata = parseBadging(badging);
  validateApkMetadata({ certificate: certificates.length === 1 ? certificates[0] : null, metadata, entries, ...expected });
  return metadata;
}

async function currentApk(runner, tools) {
  if (!fs.existsSync(targetApk)) return null;
  const metadata = await inspectApk(runner, tools, targetApk);
  const checksum = `${targetApk}.sha256`;
  if (fs.existsSync(checksum)) {
    const expected = fs.readFileSync(checksum, 'utf8').match(/^([a-fA-F0-9]{64})\s/)?.[1]?.toLowerCase();
    if (!expected || await hashFile(targetApk) !== expected) throw new Error('SHA-256 do APK anterior não confere. Confira o arquivo antes de gerar uma atualização.');
  }
  return metadata;
}

function sourceKey() {
  const key = fs.existsSync(signingKey) ? signingKey : path.join(root, 'android', 'app', 'debug.keystore');
  if (!fs.existsSync(key)) throw new Error('Chave de atualização ausente. Restaure .local/android-signing/debug.keystore a partir de uma cópia confiável; não gere outra chave.');
  return key;
}

async function check() {
  const available = os.freemem();
  console.log(`RAM disponível: ${gib(available)} GiB (mínimo para build: 1 GiB).`);
  const tools = environment();
  console.log(`JDK 21: ${tools.jdk21}\nJDK 17: ${tools.jdk17}\nAndroid SDK: ${tools.sdk}`);
  const runner = new CommandRunner({ verbose: false });
  await certificateOfKey(runner, tools, sourceKey());
  console.log('[ok] Chave compatível com a assinatura original.');
  const previous = await currentApk(runner, tools);
  if (previous) console.log(`[ok] APK atual: ${previous.packageName}, versionCode ${previous.versionCode}, ${previous.architectures.join(', ')}; assinatura e JavaScript verificados.`);
  else console.log('Nenhum APK publicado nesta pasta.');
  const version = nextVersionCode(readJson(path.join(root, 'app.json')).expo.android.versionCode, readJson(versionFile, { lastVersionCode: 0 }).lastVersionCode, previous?.versionCode || 0);
  console.log(`Próximo versionCode: ${version}.`);
  const lock = readJson(path.join(local, 'lock.json'));
  if (lock) console.log(`Bloqueio presente: PID ${lock.pid}. Use apk:stop antes de iniciar outra geração.`);
  assertStartMemory(available);
  if (lock) throw new Error('Resolva o bloqueio de compilação antes de gerar outro APK.');
  console.log('[ok] Pré-requisitos conferidos; nenhum build foi iniciado.');
}

function generatedHashes() {
  const files = ['android/build.gradle', 'android/app/build.gradle', 'android/gradle.properties', 'android/gradle/wrapper/gradle-wrapper.jar'];
  if (files.some((name) => !fs.existsSync(path.join(root, name)))) return null;
  return Object.fromEntries(files.map((name) => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]));
}

async function build() {
  const heapMiB = gradleHeapMiB(process.env.APK_GRADLE_HEAP_MB);
  const lock = acquireLock(local);
  const started = Date.now();
  const report = { id: lock.id, startedAt: new Date(started).toISOString(), status: 'running', stage: 'preflight', phases: [] };
  const runner = new CommandRunner({ logFile: path.join(local, 'build.log') });
  let protection;
  let temporary = null;
  let keepRecoveryDirectory = false;
  const phase = async (name, action) => {
    runner.assertRunning();
    report.stage = name;
    const start = Date.now();
    console.log(`\n[etapa] ${name}`);
    try { return await action(); }
    finally { report.phases.push({ name, durationSeconds: (Date.now() - start) / 1000 }); }
  };
  try {
    fs.writeFileSync(runner.logFile, `Build ${lock.id}\n`);
    protection = startProtection({ runner, lock, directory: local });
    assertStartMemory(os.freemem());
    applyExpoAudioPatch(root);
    // Include 32-bit Android devices even when their processor supports 64 bits.
    const architectures = (process.env.APK_ARCHITECTURES || 'arm64-v8a,armeabi-v7a').split(',');
    if (!architectures.length || new Set(architectures).size !== architectures.length || !architectures.every((abi) => ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'].includes(abi))) throw new Error('APK_ARCHITECTURES inválido. Use ABIs Android separadas por vírgulas, sem duplicação.');
    const tools = environment();
    report.gradleHeapMiB = heapMiB;
    console.log(`RAM: ${gib(os.freemem())} GiB disponíveis. Gradle: um worker, heap ${heapMiB} MiB; Metro: um worker.`);
    const previous = await phase('verificação da assinatura e APK anterior', async () => {
      const key = sourceKey();
      await certificateOfKey(runner, tools, key);
      const metadata = await currentApk(runner, tools);
      runner.assertRunning();
      fs.mkdirSync(path.dirname(signingKey), { recursive: true });
      if (!fs.existsSync(signingKey)) fs.copyFileSync(key, signingKey, fs.constants.COPYFILE_EXCL);
      await certificateOfKey(runner, tools, signingKey);
      return metadata;
    });
    const versionCode = nextVersionCode(readJson(path.join(root, 'app.json')).expo.android.versionCode, readJson(versionFile, { lastVersionCode: 0 }).lastVersionCode, previous?.versionCode || 0);
    report.versionCode = versionCode;
    report.architectures = architectures;
    const fingerprint = nativeFingerprint(root);
    const sync = readJson(syncFile);
    const generated = generatedHashes();
    if (!sync || sync.fingerprint !== fingerprint || !generated || JSON.stringify(sync.generated) !== JSON.stringify(generated)) {
      await phase('sincronização nativa incremental', async () => {
        await runner.run(process.execPath, [path.join(root, 'node_modules', 'expo', 'bin', 'cli'), 'prebuild', '--platform', 'android', '--no-install', '--no-clean'], { cwd: root, env: tools.env });
        runner.assertRunning();
        writeJsonAtomic(syncFile, { fingerprint: nativeFingerprint(root), generated: generatedHashes() });
      });
      report.nativeSync = true;
    } else {
      console.log('[cache] Configuração nativa inalterada; Expo Prebuild dispensado.');
      report.nativeSync = false;
    }
    await phase('Gradle e empacotamento', () => runner.run(tools.java, [
      '-classpath', path.join('gradle', 'wrapper', 'gradle-wrapper.jar'), 'org.gradle.wrapper.GradleWrapperMain', 'app:assembleRelease',
      '-Pcustodio.standaloneDebug=true', `-Pcustodio.versionCode=${versionCode}`, '-Pexpo.android.cmakeObjectPathMax=240',
      `-PreactNativeArchitectures=${architectures.join(',')}`, `-Porg.gradle.java.installations.paths=${tools.jdk21},${tools.jdk17}`,
      '-Porg.gradle.java.installations.auto-download=false', `-Dorg.gradle.jvmargs=-Xmx${heapMiB}m -XX:MaxMetaspaceSize=384m`,
      '-Pkotlin.compiler.execution.strategy=in-process', '--build-cache', '--no-parallel', '--max-workers=1', '--no-daemon', '--console=plain',
    ], { cwd: path.join(root, 'android'), env: tools.env }));
    await phase('validação e publicação do APK', async () => {
      const candidate = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
      if (!fs.existsSync(candidate)) throw new Error(`APK não encontrado: ${candidate}`);
      fs.mkdirSync(releases, { recursive: true });
      temporary = fs.mkdtempSync(path.join(releases, '.publish-'));
      const staged = path.join(temporary, 'CustodioMusic.apk');
      await fs.promises.copyFile(candidate, staged);
      await inspectApk(runner, tools, staged, { versionCode, architectures });
      const sha256 = await hashFile(staged);
      fs.writeFileSync(`${staged}.sha256`, `${sha256.toUpperCase()}  CustodioMusic.apk\n`);
      protection.check();
      runner.assertRunning();
      publishRelease({ directory: temporary, releases, stateFile: versionFile, state: { lastVersionCode: versionCode, sha256, packageName: PACKAGE, certificate: CERTIFICATE } });
      report.sha256 = sha256;
      report.apk = targetApk;
      console.log(`[ok] APK atualizado: ${targetApk}\n[ok] versionCode: ${versionCode}; SHA-256: ${sha256}`);
    });
    report.status = 'success';
  } catch (error) {
    keepRecoveryDirectory = Boolean(error.keepRecoveryDirectory);
    report.status = runner.reason ? 'cancelled' : report.stage === 'preflight' ? 'blocked' : 'failed';
    report.error = error.message;
    throw error;
  } finally {
    protection?.stop();
    await runner.termination.catch((error) => { console.error(`[erro] ${error.message}`); });
    report.finishedAt = new Date().toISOString();
    report.durationSeconds = (Date.now() - started) / 1000;
    report.memory = protection?.memory.stats();
    try {
      if (temporary && !keepRecoveryDirectory) cleanupPublishDirectory(temporary, releases);
      writeJsonAtomic(path.join(local, 'last-run.json'), report);
    } catch (error) { console.error(`[aviso] Não foi possível concluir a limpeza/relatório: ${error.message}`); }
    finally { lock.release(); }
    console.log(`[relatório] ${path.join(local, 'last-run.json')} (${report.durationSeconds.toFixed(1)} s).`);
  }
}

try {
  const args = process.argv.slice(2);
  if (args.length === 0) await build();
  else if (args.length === 1 && args[0] === 'check') await check();
  else if (args.length === 1 && args[0] === 'stop') console.log(await requestStop(local));
  else throw new Error('Use npm run apk:debug, npm run apk:check ou npm run apk:stop.');
} catch (error) {
  console.error(`\n[erro] ${error.message}\n`);
  process.exitCode = 1;
}
