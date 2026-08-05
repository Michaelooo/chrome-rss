#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const version = args.find(arg => !arg.startsWith('--'));
const checkDist = args.includes('--dist');
const notesArg = args.find(arg => arg.startsWith('--notes='));
const notesPath = resolve(root, notesArg?.slice('--notes='.length) || 'release-notes.md');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJSON(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  fail('版本号必须使用 X.Y.Z 格式，例如 1.1.0');
}

const packageVersion = readJSON('package.json').version;
const manifestVersion = readJSON('manifest.json').version;
if (packageVersion !== version) {
  fail(`package.json 版本 ${packageVersion} 与发布版本 ${version} 不一致`);
}
if (manifestVersion !== version) {
  fail(`manifest.json 版本 ${manifestVersion} 与发布版本 ${version} 不一致`);
}

const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
const escapedVersion = version.replace(/\./g, '\\.');
const headingPattern = new RegExp(`^## \\[${escapedVersion}\\](?: - .+)?$`, 'gm');
const headings = [...changelog.matchAll(headingPattern)];
if (headings.length !== 1) {
  fail(`CHANGELOG.md 必须且只能包含一个 ## [${version}] 正式版本段`);
}

const sectionStart = headings[0].index + headings[0][0].length;
const remaining = changelog.slice(sectionStart);
const nextHeading = remaining.search(/^## \[/m);
const section = (nextHeading >= 0 ? remaining.slice(0, nextHeading) : remaining)
  .replace(/\n---\s*$/, '')
  .trim();
if (!section) {
  fail(`CHANGELOG.md 的 ${version} 版本说明为空`);
}
writeFileSync(notesPath, `${section}\n`);

if (checkDist) {
  if (!existsSync(resolve(root, 'dist/manifest.json'))) {
    fail('dist/manifest.json 不存在，请先构建');
  }
  const distVersion = readJSON('dist/manifest.json').version;
  if (distVersion !== version) {
    fail(`dist/manifest.json 版本 ${distVersion} 与发布版本 ${version} 不一致`);
  }
  const zipPath = resolve(root, `release/chrome-rss-reader-v${version}.zip`);
  if (!existsSync(zipPath)) {
    fail(`发布包不存在: ${zipPath}`);
  }
}

console.log(`发布版本 ${version} 校验通过`);
