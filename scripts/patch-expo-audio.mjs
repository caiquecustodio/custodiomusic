import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Backport of https://github.com/expo/expo/pull/52193 (Expo MIT license).
// Pin both inputs: an SDK/package update must be reviewed rather than silently overwritten.
const BEFORE = '03cec884ac2c75ee8aedb06357eb280f0bcc0d56a56e9d89effce3f4001d9626';
const AFTER = 'f623172c657b98c4272cf853a9ca4cb60539ca56239d2392e57fc77058e4a369';
const hash = (source) => crypto.createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex');
export function applyExpoAudioPatch(root) {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!app.expo?.autolinking?.android?.buildFromSource?.includes('expo-audio')) {
    throw new Error('A correção do Expo Audio exige buildFromSource para expo-audio; um AAR pré-compilado ainda contém o defeito.');
  }
  const audioRoot = path.join(root, 'node_modules', 'expo-audio');
  const version = JSON.parse(fs.readFileSync(path.join(audioRoot, 'package.json'), 'utf8')).version;
  if (version !== '58.0.10') throw new Error(`Reavalie a correção do Expo Audio antes de usar a versão ${version}.`);
  const target = path.join(audioRoot, 'android', 'src', 'main', 'java', 'expo', 'modules', 'audio', 'service', 'MetadataInjectingPlayer.kt');
  const replacement = fs.readFileSync(path.join(root, 'patches', 'expo-audio', 'MetadataInjectingPlayer.kt'), 'utf8');
  if (hash(replacement) !== AFTER) throw new Error('O conteúdo da correção do Expo Audio difere do backport revisado.');
  const current = hash(fs.readFileSync(target, 'utf8'));
  if (current === AFTER) return false;
  if (current !== BEFORE) throw new Error('O Expo Audio foi alterado. A correção não será aplicada sobre código desconhecido.');
  fs.writeFileSync(target, replacement, 'utf8');
  return true;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  console.log(applyExpoAudioPatch(root) ? '[ok] Correção de eventos da fila aplicada ao Expo Audio.' : '[ok] Expo Audio já contém a correção da fila.');
}
