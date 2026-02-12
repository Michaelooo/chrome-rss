#!/usr/bin/env node

import { existsSync, createWriteStream, readFileSync } from 'fs';
import { mkdir, readdir, stat } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = resolve(__dirname, '..', 'dist');
const outDir = resolve(__dirname, '..', 'release');

/** 从 package.json 读取版本号 */
function getVersion() {
  const pkgPath = resolve(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

const zipName = `chrome-rss-reader-v${getVersion()}.zip`;
const zipPath = join(outDir, zipName);

async function ensureDist() {
  if (!existsSync(distDir)) {
    throw new Error('dist/ 目录不存在，请先运行 npm run build');
  }

  const items = await readdir(distDir);
  const hasFiles = await Promise.all(
    items.map(async (item) => (await stat(join(distDir, item))).isFile() || (await stat(join(distDir, item))).isDirectory())
  );
  if (!hasFiles.some(Boolean)) {
    throw new Error('dist/ 目录为空，请确认构建是否成功');
  }
}

async function createZip() {
  await ensureDist();
  await mkdir(outDir, { recursive: true });

  const output = createWriteStream(zipPath);
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });

  output.on('close', () => {
    console.log(`打包完成: ${zipPath} (${archive.pointer()} bytes)`);
  });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn(err.message);
    } else {
      throw err;
    }
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);
  archive.directory(distDir, false);
  await archive.finalize();
}

createZip().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
