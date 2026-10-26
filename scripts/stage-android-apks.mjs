#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const apkRoot = join(repoRoot, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk');
const abiOrder = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];
const [mode, outArg, buildKind = 'release'] = process.argv.slice(2);

if (!['universal', 'split'].includes(mode) || !outArg || !['release', 'debug'].includes(buildKind)) {
  console.error('Usage: node scripts/stage-android-apks.mjs <universal|split> <output-dir> [release|debug]');
  process.exit(1);
}

const outDir = resolve(repoRoot, outArg);
const outRelative = relative(repoRoot, outDir);
if (outRelative === '' || outRelative.startsWith('..')) {
  console.error(`Output directory must be inside the repository: ${outArg}`);
  process.exit(1);
}

const version = JSON.parse(readFileSync(join(repoRoot, 'src-tauri', 'tauri.conf.json'), 'utf8')).version;
if (!version) {
  console.error('src-tauri/tauri.conf.json has no version.');
  process.exit(1);
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.apk')) files.push(path);
  }
  return files;
}

function classify(file) {
  const path = relative(apkRoot, file).toLowerCase();
  if (path.includes('universal')) return 'universal';
  if (path.includes('arm64')) return 'arm64-v8a';
  if (path.includes('arm')) return 'armeabi-v7a';
  if (path.includes('x86_64')) return 'x86_64';
  if (path.includes('x86') || path.includes('i686')) return 'x86';
  return null;
}

function assetName(abi) {
  return `SANJEH_${version}_android_${buildKind}_${abi}.apk`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const apks = walk(apkRoot);
if (apks.length === 0) {
  fail(`No APKs found under ${relative(repoRoot, apkRoot)}. Build the Android app first.`);
}

const grouped = new Map();
for (const apk of apks) {
  const abi = classify(apk);
  if (!abi) fail(`Cannot determine the ABI from ${relative(repoRoot, apk)}.`);
  const files = grouped.get(abi) ?? [];
  files.push(apk);
  grouped.set(abi, files);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

if (mode === 'universal') {
  const universal = grouped.get('universal') ?? [];
  if (universal.length !== 1 || grouped.size !== 1) {
    fail(`Expected exactly one universal APK, found ${apks.length}: ${apks.map((apk) => relative(repoRoot, apk)).join(', ')}`);
  }
  cpSync(universal[0], join(outDir, assetName('universal')));
  console.log(`Staged universal APK as ${assetName('universal')}`);
} else {
  if (grouped.has('universal')) {
    fail('The split build produced a universal APK; expected per-ABI APKs only.');
  }
  const unexpected = [...grouped.keys()].filter((abi) => !abiOrder.includes(abi));
  const missing = abiOrder.filter((abi) => !grouped.has(abi));
  if (unexpected.length > 0 || missing.length > 0) {
    fail(`Expected APKs for ${abiOrder.join(', ')}. Missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}.`);
  }
  for (const abi of abiOrder) {
    const files = grouped.get(abi);
    if (files.length !== 1) {
      fail(`Expected exactly one APK for ${abi}, found ${files.length}.`);
    }
    const abiDir = join(outDir, abi);
    mkdirSync(abiDir, { recursive: true });
    cpSync(files[0], join(abiDir, assetName(abi)));
    console.log(`Staged ${abi} APK as ${assetName(abi)}`);
  }
}
