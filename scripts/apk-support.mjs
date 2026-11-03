import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const GiB = 1024 ** 3;
export const POLICY = Object.freeze({ startBytes: GiB, lowBytes: 1.5 * GiB, lowDurationMs: 10_000 });
export const PACKAGE = 'com.custodio.music';
export const CERTIFICATE = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';
export const gib = (bytes) => (bytes / GiB).toFixed(2);
export function gradleHeapMiB(value) {
  if (value === undefined || value === '') return 1536;
  const text = String(value).trim();
  if (!['768', '1024', '1280', '1536'].includes(text)) {
    throw new Error('APK_GRADLE_HEAP_MB deve ser 768, 1024, 1280 ou 1536. A proteção de RAM permanece ativa.');
  }
  return Number(text);
}

export function assertStartMemory(bytes) {
  if (bytes < POLICY.startBytes) {
    throw new Error(`RAM insuficiente: ${gib(bytes)} GiB disponíveis; é necessário 1 GiB. Feche aplicativos e tente novamente. Nenhum compilador foi iniciado.`);
  }
}

export class MemoryWatch {
  constructor({ freeMemory = os.freemem, totalMemory = os.totalmem(), now = Date.now } = {}) {
    this.freeMemory = freeMemory;
    this.totalMemory = totalMemory;
    this.now = now;
    this.lowSince = null;
    this.minAvailableBytes = totalMemory;
    this.peakSystemUsedBytes = 0;
  }
  sample() {
    const available = this.freeMemory();
    this.minAvailableBytes = Math.min(this.minAvailableBytes, available);
    this.peakSystemUsedBytes = Math.max(this.peakSystemUsedBytes, this.totalMemory - available);
    if (available >= POLICY.lowBytes) this.lowSince = null;
    else this.lowSince ??= this.now();
    return this.lowSince !== null && this.now() - this.lowSince >= POLICY.lowDurationMs;
  }
  stats() {
    return { minAvailableBytes: this.minAvailableBytes, peakSystemUsedBytes: this.peakSystemUsedBytes, totalSystemBytes: this.totalMemory };
  }
}

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

export function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

export function acquireLock(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'lock.json');
  const record = { id: crypto.randomUUID(), pid: process.pid, startedAt: new Date().toISOString() };
  let fd;
  try { fd = fs.openSync(file, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = readJson(file);
    const description = existing && processAlive(existing.pid) ? `geração já ativa (PID ${existing.pid})` : 'bloqueio antigo encontrado';
    throw new Error(`${description}. Use npm run apk:stop. Nenhuma segunda compilação foi iniciada.`);
  }
  try { fs.writeFileSync(fd, JSON.stringify(record)); }
  finally { fs.closeSync(fd); }
  return {
    ...record, file,
    release() {
      if (readJson(file)?.id === record.id) fs.unlinkSync(file);
      const stopFile = path.join(directory, 'stop.json');
      if (readJson(stopFile)?.id === record.id) fs.unlinkSync(stopFile);
    },
  };
}

export async function requestStop(directory, { timeoutMs = 15_000 } = {}) {
  const file = path.join(directory, 'lock.json');
  const record = readJson(file);
  if (!record) return 'Nenhuma geração está ativa.';
  if (!record.id || !Number.isSafeInteger(record.pid)) throw new Error('Bloqueio inválido; confira o arquivo lock.json antes de removê-lo.');
  if (!processAlive(record.pid)) {
    if (readJson(file)?.id === record.id) fs.unlinkSync(file);
    return 'Bloqueio de uma geração já encerrada removido.';
  }
  // The owner handles the request and terminates its own child tree. Never kill a PID from a stale lock.
  writeJsonAtomic(path.join(directory, 'stop.json'), { id: record.id });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (readJson(file)?.id !== record.id) return 'Geração encerrada. O APK anterior foi preservado se a publicação ainda não havia terminado.';
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Cancelamento solicitado, mas ainda não confirmado. Nenhum processo de outro aplicativo foi encerrado.');
}

async function terminateTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', reject);
      killer.on('close', (code) => {
        if (code === 0 || child.exitCode !== null || child.signalCode !== null) resolve();
        else reject(new Error(`Não foi possível encerrar a árvore do processo próprio ${child.pid} (taskkill ${code}).`));
      });
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}

export class CommandRunner {
  constructor({ logFile = null, onOutput = null, verbose = true } = {}) {
    this.logFile = logFile;
    this.onOutput = onOutput;
    this.verbose = verbose;
    this.active = null;
    this.reason = null;
    this.termination = Promise.resolve();
  }
  assertRunning() { if (this.reason) throw new Error(this.reason); }
  cancel(reason) {
    if (this.reason) return this.termination;
    this.reason = reason;
    this.termination = terminateTree(this.active);
    // Observe the rejection immediately; run() also awaits it before releasing the lock.
    this.termination.catch(() => {});
    return this.termination;
  }
  async run(command, args, { cwd, env = process.env, capture = false, quiet = false } = {}) {
    this.assertRunning();
    const header = `\n> ${path.basename(command)} ${args.join(' ')}\n`;
    if (!quiet && this.verbose) process.stdout.write(header);
    if (this.logFile) fs.appendFileSync(this.logFile, header);
    let output = '';
    let outputBytes = 0;
    const child = spawn(command, args, { cwd, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    this.active = child;
    const consume = (data) => {
      try {
        if (capture) {
          outputBytes += data.length;
          if (outputBytes > 4 * 1024 * 1024) { void this.cancel('Saída do comando excedeu o limite de 4 MiB.'); return; }
          output += data.toString();
        }
        if (!quiet && this.verbose) process.stdout.write(data);
        if (this.logFile) fs.appendFileSync(this.logFile, data);
        this.onOutput?.(data.toString());
      } catch (error) { void this.cancel(`Falha ao registrar saída: ${error.message}`); }
    };
    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
    try {
      await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`Comando terminou com código ${code}${signal ? ` (${signal})` : ''}.`)));
      });
      this.assertRunning();
      return output;
    } catch (error) {
      await this.termination;
      throw new Error(this.reason || error.message);
    } finally {
      if (this.active === child) this.active = null;
    }
  }
}

export function startProtection({ runner, lock, directory, memory = new MemoryWatch(), intervalMs = 1000 }) {
  const tick = () => {
    try {
      if (readJson(path.join(directory, 'stop.json'))?.id === lock.id) void runner.cancel('Cancelado por npm run apk:stop.');
      if (memory.sample()) void runner.cancel('Cancelado: RAM disponível abaixo de 1,5 GiB por dez segundos. Feche aplicativos antes de tentar novamente.');
    } catch (error) { void runner.cancel(`Falha no monitor de proteção: ${error.message}`); }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  const interrupt = () => { void runner.cancel('Geração interrompida pelo usuário.'); };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  return {
    memory,
    check: tick,
    stop() { clearInterval(timer); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); },
  };
}

export async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export function nativeFingerprint(root) {
  const files = new Set(['app.json', 'package.json', 'package-lock.json', 'app.config.js', 'app.config.ts', 'app.config.cjs']);
  const collect = (directory, predicate = () => true) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(file, predicate);
      else if (predicate(entry.name)) files.add(path.relative(root, file));
    }
  };
  collect(path.join(root, 'plugins'));
  // Module registration/dependencies need prebuild; Kotlin/C++ edits are handled by Gradle.
  const modules = path.join(root, 'modules');
  if (fs.existsSync(modules)) {
    for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
      if (entry.isDirectory()) for (const name of ['package.json', 'expo-module.config.json']) files.add(path.join('modules', entry.name, name));
    }
  }
  const config = readJson(path.join(root, 'app.json'), {});
  const collectAssetReferences = (value) => {
    if (typeof value === 'string' && value.startsWith('./assets/')) files.add(value.slice(2));
    else if (value && typeof value === 'object') Object.values(value).forEach(collectAssetReferences);
  };
  collectAssetReferences(config);
  const hash = crypto.createHash('sha256');
  for (const relative of [...files].sort()) {
    hash.update(relative.replaceAll('\\', '/') + '\0');
    const file = path.join(root, relative);
    hash.update(fs.existsSync(file) ? fs.readFileSync(file) : '<missing>');
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function parseBadging(output) {
  const match = output.match(/^package: name='([^']+)' versionCode='(\d+)'/m);
  if (!match) throw new Error('Não foi possível ler identificador/versão do APK.');
  const abis = output.match(/^native-code:\s*(.*)$/m)?.[1].match(/'([^']+)'/g)?.map((item) => item.slice(1, -1)) || [];
  return { packageName: match[1], versionCode: Number(match[2]), architectures: abis.sort() };
}

export function validateApkMetadata({ certificate, metadata, entries, versionCode, architectures }) {
  if (certificate !== CERTIFICATE) throw new Error('Assinatura incompatível com o APK antigo. O arquivo anterior não será substituído.');
  if (metadata.packageName !== PACKAGE) throw new Error(`Identificador incorreto: ${metadata.packageName}.`);
  if (versionCode !== undefined && metadata.versionCode !== versionCode) throw new Error('Código de versão do APK não corresponde ao solicitado.');
  if (architectures && metadata.architectures.join(',') !== [...architectures].sort().join(',')) throw new Error('Arquiteturas do APK não correspondem às solicitadas.');
  if (!entries.split(/\r?\n/).includes('assets/index.android.bundle')) throw new Error('APK sem JavaScript incluído; não pode ser publicado como independente.');
}

export function nextVersionCode(configVersion, lastVersion, apkVersion) {
  for (const value of [configVersion, lastVersion, apkVersion]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Estado de versão inválido.');
  }
  const next = Math.max(1, configVersion, lastVersion + 1, apkVersion + 1);
  if (next > 2_100_000_000) throw new Error('Código de versão excedeu o limite Android.');
  return next;
}

export function cleanupPublishDirectory(directory, releases) {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(releases) || !path.basename(resolved).startsWith('.publish-')) throw new Error('Diretório temporário fora de releases.');
  fs.rmSync(resolved, { recursive: true, force: true });
}

// All validation happens on the staged copy before this short synchronous transaction.
export function publishRelease({ directory, releases, stateFile, state, rename = fs.renameSync }) {
  const apk = path.join(releases, 'CustodioMusic.apk');
  const sha = `${apk}.sha256`;
  const pairs = [[apk, 'previous-apk'], [sha, 'previous-sha'], [stateFile, 'previous-state']];
  for (const [target, name] of pairs) {
    if (fs.existsSync(target)) {
      const backup = path.join(directory, name);
      try { fs.linkSync(target, backup); }
      catch (error) {
        if (!['EXDEV', 'ENOTSUP', 'EPERM'].includes(error.code)) throw error;
        fs.copyFileSync(target, backup);
      }
    }
  }
  writeJsonAtomic(path.join(directory, 'next-state.json'), state);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const committed = [];
  try {
    for (const [source, target] of [[path.join(directory, 'CustodioMusic.apk'), apk], [path.join(directory, 'CustodioMusic.apk.sha256'), sha], [path.join(directory, 'next-state.json'), stateFile]]) {
      rename(source, target);
      committed.push(target);
    }
  } catch (error) {
    try {
      for (const target of committed.reverse()) {
        const name = pairs.find(([file]) => file === target)[1];
        const previous = path.join(directory, name);
        if (fs.existsSync(previous)) fs.renameSync(previous, target);
        else fs.rmSync(target, { force: true });
      }
    } catch (rollback) {
      const recoveryError = new Error(`Falha na publicação e restauração: ${rollback.message}. Cópia anterior preservada em ${directory}. Erro original: ${error.message}`);
      recoveryError.keepRecoveryDirectory = true;
      throw recoveryError;
    }
    throw error;
  }
}
