// Development only: commit these deterministic assets; the sandbox installs nothing.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const requireTool = name => require(require.resolve(name, { paths: [process.env.ORBIT_BUILD_MODULES || root, root] }));
const compiler = requireTool('terser');
const { minify } = requireTool('html-minifier-terser');
const CleanCSS = requireTool('clean-css');
assert.equal(requireTool('terser/package.json').version, '5.51.4');
assert.equal(requireTool('html-minifier-terser/package.json').version, '7.2.0');
assert.equal(requireTool('clean-css/package.json').version, '5.3.3');
const source = join(root, 'dashboard');
const output = join(root, 'dashboard-built');
const check = process.argv.includes('--check');
const hash = value => createHash('sha256').update(value).digest('hex');
const selectors = ['app.css', 'focus.css'].map(name => readFileSync(join(source, name), 'utf8')).join('\n');
const classes = [...new Set([...selectors.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(match => match[1]))].sort();
// Stable IDs and state classes stay public; private style classes share one map.
const stable = new Set(['focus-detail', 'drawer-open', 'detail-full', 'skip-link']);
const classMap = new Map(classes.filter(name => name.includes('-') && !stable.has(name)).map((name, index) => [name, 'c' + index.toString(36)]));
for (const name of classMap.values()) assert.ok(!classes.includes(name), `Class collision: ${name}`);
function styleClasses(text) {
  return text.replace(/\.([A-Za-z_][\w-]*)/g, (match, name) => classMap.has(name) ? '.' + classMap.get(name) : match)
    .replace(/\bclass="([^"]*)"/g, (_, names) => 'class="' + names.replace(/[A-Za-z_][\w-]*/g, name => classMap.get(name) || name) + '"');
}
const options = { compress: { passes: 3 }, mangle: true, format: { comments: false, ascii_only: false, max_line_len: 240 } };
const manifest = { compiler: 'terser@5.51.4', html: 'html-minifier-terser@7.2.0', css: 'clean-css@5.3.3', options, classes: Object.fromEntries(classMap), files: {} };
const assets = [];
for (const name of readdirSync(source).sort()) {
  assert.match(name, /\.(?:html|css|js)$/);
  const text = readFileSync(join(source, name), 'utf8');
  const compact = styleClasses(text).replace(/>\s+</g, '> <');
  const loader = name.endsWith('.css') ? 'css' : 'js';
  let built;
  if (name.endsWith('.html')) built = await minify(compact, { collapseWhitespace: true, removeComments: true, removeRedundantAttributes: true, removeAttributeQuotes: true });
  else if (loader === 'css') {
    const result = new CleanCSS({ level: 2 }).minify(compact);
    assert.deepEqual(result.errors, []);
    built = result.styles + '\n';
  } else built = (await compiler.minify(compact, options)).code + '\n';
  manifest.files[name] = { source: hash(text), built: hash(built) };
  assets.push([name, built]);
}
const bytes = assets.reduce((total, [, text]) => total + Buffer.byteLength(text), 0);
console.log(JSON.stringify({ assets: assets.map(([name, text]) => ({ name, bytes: Buffer.byteLength(text) })) }));
assert.ok(bytes < 65000, `Dashboard source needs room for dossier headings: ${bytes} bytes.`);
const record = JSON.stringify(manifest, null, 2) + '\n';
if (check) {
  assert.deepEqual(readdirSync(output).sort(), assets.map(([name]) => name));
  for (const [name, text] of assets) assert.equal(readFileSync(join(output, name), 'utf8'), text, `Rebuild ${name}`);
  assert.equal(readFileSync(join(root, 'tools/dashboard-build.json'), 'utf8'), record, 'Rebuild the asset manifest');
} else {
  mkdirSync(output, { recursive: true });
  for (const [name, text] of assets) writeFileSync(join(output, name), text);
  writeFileSync(join(root, 'tools/dashboard-build.json'), record);
}
console.log(JSON.stringify({ check, compiler: manifest.compiler, files: assets.length, dashboardBytes: bytes }));
