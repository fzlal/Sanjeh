#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'src-tauri', 'gen', 'android');
const gradlePath = path.join(androidDir, 'app', 'build.gradle.kts');
const propertiesPath = path.join(androidDir, 'keystore.properties');
const requireSigning = process.argv.includes('--require');

const keystoreBase64 = (process.env.ANDROID_KEYSTORE_BASE64 || '').trim();
const keystorePathEnv = (process.env.ANDROID_KEYSTORE_PATH || '').trim();
const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD || '';
const keyAlias = process.env.ANDROID_KEY_ALIAS || '';
const keyPassword = process.env.ANDROID_KEY_PASSWORD || storePassword;

function fail(message) {
  console.error(`Android signing: ${message}`);
  process.exit(1);
}

function expandHome(filePath) {
  if (filePath === '~') return homedir();
  if (filePath.startsWith('~/')) return path.join(homedir(), filePath.slice(2));
  return filePath;
}

function escapeProperty(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/^(\s)/, '\\$1');
}

function patchGradle(source) {
  if (source.includes('sanjehKeystoreFile')) return source;
  if (!/^android \{/m.test(source)) {
    fail('could not find the android {} block in app/build.gradle.kts.');
  }
  if (!/getByName\("release"\)\s*\{/.test(source)) {
    fail('could not find the release build type in app/build.gradle.kts.');
  }

  const androidBlock = [
    'val sanjehKeystoreFile = rootProject.file("keystore.properties")',
    'val sanjehKeystoreProperties = Properties().apply {',
    '    if (sanjehKeystoreFile.exists()) {',
    '        sanjehKeystoreFile.inputStream().use { load(it) }',
    '    }',
    '}',
    '',
    'android {',
    '    signingConfigs {',
    '        if (sanjehKeystoreFile.exists()) {',
    '            create("release") {',
    '                storeFile = file(sanjehKeystoreProperties.getProperty("storeFile"))',
    '                storePassword = sanjehKeystoreProperties.getProperty("storePassword")',
    '                keyAlias = sanjehKeystoreProperties.getProperty("keyAlias")',
    '                keyPassword = sanjehKeystoreProperties.getProperty("keyPassword")',
    '            }',
    '        }',
    '    }',
  ].join('\n');

  let prepared = source;
  if (!/^import java\.util\.Properties$/m.test(prepared)) {
    prepared = `import java.util.Properties\n${prepared}`;
  }

  return prepared
    .replace(/^android \{/m, androidBlock)
    .replace(
      /(getByName\("release"\)\s*\{)/,
      `$1\n            if (sanjehKeystoreFile.exists()) {\n                signingConfig = signingConfigs.getByName("release")\n            }`,
    );
}

const hasAnyConfig = Boolean(
  keystoreBase64 ||
    keystorePathEnv ||
    storePassword ||
    keyAlias ||
    process.env.ANDROID_KEY_PASSWORD,
);

if (!hasAnyConfig) {
  if (requireSigning) {
    fail(
      'ANDROID_KEYSTORE_PATH or ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, and ANDROID_KEY_ALIAS are required.',
    );
  }
  console.log('Android signing: no key configured; release APKs will be unsigned.');
  process.exit(0);
}

const missing = [];
if (!keystoreBase64 && !keystorePathEnv) {
  missing.push('ANDROID_KEYSTORE_PATH or ANDROID_KEYSTORE_BASE64');
}
if (!storePassword) missing.push('ANDROID_KEYSTORE_PASSWORD');
if (!keyAlias) missing.push('ANDROID_KEY_ALIAS');
if (missing.length > 0) fail(`missing ${missing.join(', ')}.`);

if (!existsSync(gradlePath)) {
  fail('app/build.gradle.kts was not found. Run "npx tauri android init --ci" first.');
}

let keystorePath;
if (keystorePathEnv) {
  const expanded = expandHome(keystorePathEnv);
  keystorePath = path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded);
  if (!existsSync(keystorePath)) fail(`keystore not found at ${keystorePath}.`);
} else {
  const bytes = Buffer.from(keystoreBase64.replace(/\s+/g, ''), 'base64');
  if (bytes.length === 0) fail('ANDROID_KEYSTORE_BASE64 did not decode to any bytes.');
  keystorePath = path.join(androidDir, 'release.keystore');
  writeFileSync(keystorePath, bytes, { mode: 0o600 });
}

const properties = [
  `storeFile=${escapeProperty(keystorePath.replace(/\\/g, '/'))}`,
  `storePassword=${escapeProperty(storePassword)}`,
  `keyAlias=${escapeProperty(keyAlias)}`,
  `keyPassword=${escapeProperty(keyPassword)}`,
];
writeFileSync(propertiesPath, `${properties.join('\n')}\n`, 'utf8');

const gradle = readFileSync(gradlePath, 'utf8');
const patched = patchGradle(gradle);
if (patched !== gradle) writeFileSync(gradlePath, patched, 'utf8');

console.log(`Android signing: release alias "${keyAlias}" is configured.`);
