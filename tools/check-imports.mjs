// بررسی یکپارچگی: همهٔ importهای ماژولی و فایل‌های مرجع‌دهی‌شده وجود دارند
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const seen = new Set();

function checkModule(file) {
  const abs = path.resolve(ROOT, file);
  if (seen.has(abs)) return;
  seen.add(abs);
  if (!existsSync(abs)) {
    problems.push(`فایل وجود ندارد: ${file}`);
    return;
  }
  const src = readFileSync(abs, 'utf8');
  const re = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const spec = m[1] || m[2] || m[3];
    if (!spec || !spec.startsWith('.')) continue;
    const target = path.normalize(path.join(path.dirname(abs), spec));
    const rel = path.relative(ROOT, target);
    if (!existsSync(target)) problems.push(`import شکسته در ${file}: ${spec}`);
    else if (target.endsWith('.js')) checkModule(rel);
  }
}

// ماژول‌ها از نقطهٔ ورود
checkModule('src/main.js');

// فایل‌های مرجع‌دهی‌شده در index.html
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:href|src)="\.?\/?([^"]+)"/g)) {
  const ref = m[1];
  if (ref.startsWith('#') || ref.startsWith('http')) continue;
  if (!existsSync(path.join(ROOT, ref))) problems.push(`مرجع شکسته در index.html: ${ref}`);
}

// فهرست precache سرویس‌ورکر
const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
for (const m of sw.matchAll(/'\.\/([^']+\.[a-z0-9]+)'/g)) {
  if (!existsSync(path.join(ROOT, m[1]))) problems.push(`فایل precache موجود نیست: ${m[1]}`);
}

// آیکون‌های manifest
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
for (const icon of manifest.icons) {
  if (!existsSync(path.join(ROOT, icon.src))) problems.push(`آیکون manifest موجود نیست: ${icon.src}`);
}

if (problems.length > 0) {
  console.error('✖ مشکلات یافت شد:');
  for (const p of problems) console.error(' -', p);
  process.exit(1);
}
console.log('✔ همهٔ importها و مراجع فایل سالم هستند.');
