// Smoke-test the recovery pipeline by running web/recovery.js in a Node 22
// sandbox against a synthetic, deliberately-broken .pptx.

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');

// The recovery engine decompresses with the Immortal Inflater (a global in the
// browser). Load the same UMD module here and expose it to the sandbox below.
const ImmortalInflate = (await import(url.pathToFileURL(path.join(WEB, 'immortal-inflate.js')).href)).default;

class FakeDOMParser {
  parseFromString() { return { querySelector: () => null }; }
}

// Build a tiny synthetic, fully valid .pptx using the browser-style ZIP layout.
async function makeFakePptx() {
  const enc = new TextEncoder();
  const files = {
    '[Content_Types].xml':
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="x" Target="ppt/presentation.xml"/></Relationships>',
    'ppt/presentation.xml': '<?xml version="1.0"?><p:presentation xmlns:p="x"/>',
    'ppt/slides/slide1.xml':
      '<?xml version="1.0"?><p:sld xmlns:p="x" xmlns:a="y"><p:cSld><p:spTree>' +
      '<p:sp><p:txBody><a:p><a:r><a:t>Hello recovery world</a:t></a:r></a:p>' +
      '<a:p><a:r><a:t>Slide 1 line 2</a:t></a:r></a:p></p:txBody></p:sp>' +
      '</p:spTree></p:cSld></p:sld>',
  };
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[i] = c >>> 0;
  }
  const crc32 = (b) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const deflate = async (b) => {
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter(); w.write(b); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  };

  const localChunks = [], cdChunks = [];
  let offset = 0;
  for (const name of Object.keys(files)) {
    const raw = enc.encode(files[name]);
    const data = await deflate(raw);
    const nameBytes = enc.encode(name);
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); lv.setUint16(8, 8, true);
    lv.setUint32(14, crc32(raw), true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lh.set(nameBytes, 30);
    localChunks.push(lh, data);
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc32(raw), true); cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);
    cdChunks.push(ch);
    offset += lh.length + data.length;
  }
  const cdSize = cdChunks.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, Object.keys(files).length, true);
  ev.setUint16(10, Object.keys(files).length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const all = [...localChunks, ...cdChunks, eocd];
  const total = all.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0; for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

function makeSandbox() {
  const elements = {};
  const meta = {};
  const listeners = {}; // listeners[id][evt] = fn
  const downloads = [];
  const blobs = new Map();

  const makeEl = (id) => ({
    id,
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    style: {},
    addEventListener(ev, fn) { (listeners[id] ||= {})[ev] = fn; },
    appendChild() {},
    querySelector: () => null,
    set textContent(v) { meta[id] = v; },
    get textContent() { return meta[id] || ''; },
    set innerHTML(v) { meta[id + '_html'] = v; },
    get innerHTML() { return meta[id + '_html'] || ''; },
    scrollTop: 0, scrollHeight: 0,
    open: false,
    remove: () => {},
    disabled: false,
    files: [],
    value: '',
    click: () => {}
  });

  const document = {
    getElementById(id) { return elements[id] ||= makeEl(id); },
    createElement(t) {
      const node = makeEl('_' + t);
      node.tagName = t;
      return node;
    },
    addEventListener: () => {},
    body: { appendChild(node) { downloads.push(node); } },
    readyState: 'complete'
  };

  const URLshim = {
    createObjectURL: (b) => { const u = 'blob:' + Math.random(); blobs.set(u, b); return u; },
    revokeObjectURL: () => {}
  };

  const sandbox = {
    document,
    DOMParser: FakeDOMParser,
    ImmortalInflate,
    CompressionStream,
    TextEncoder, TextDecoder, DataView,
    Uint8Array, Uint16Array, Uint32Array, Int32Array, ArrayBuffer,
    Blob, Response,
    URL: URLshim,
    console,
    setTimeout, clearTimeout
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.navigator = { serviceWorker: undefined };

  return { sandbox, elements, meta, listeners, downloads, blobs };
}

async function runRecovery(bytes, label) {
  const env = makeSandbox();
  const ctx = vm.createContext(env.sandbox);
  const code = fs.readFileSync(path.join(WEB, 'recovery.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'recovery.js' });

  const file = new File([bytes], `${label}.pptx`, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  });
  env.elements['file'].files = [file];
  const handler = env.listeners['file'] && env.listeners['file'].change;
  if (!handler) throw new Error('file change listener not registered');
  handler(); // change handler is non-async; just kicks off handle(file)
  // Wait until either m-entries is populated or status indicates failure.
  const start = Date.now();
  while (Date.now() - start < 10000) {
    const status = env.meta['status'] || '';
    if (env.meta['m-entries'] != null) break;
    if (status.startsWith('Recovery failed') || status.startsWith('Could not')) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  return env;
}

(async () => {
  const ok = (m) => console.log('  \x1b[32mOK\x1b[0m', m);
  const bad = (m) => { console.log('  \x1b[31mFAIL\x1b[0m', m); process.exitCode = 1; };

  const good = await makeFakePptx();
  console.log('Synthetic .pptx size:', good.length);

  console.log('\n[1] well-formed pptx');
  const r1 = await runRecovery(good, 'good');
  console.log('  meta:', r1.meta);
  if (r1.meta['m-entries'] === '4') ok('all 4 entries recovered');
  else bad('m-entries=' + r1.meta['m-entries']);
  if (r1.meta['m-slides'] === '1') ok('1 slide detected');
  else bad('m-slides=' + r1.meta['m-slides']);
  if (r1.meta['m-strategy'] === 'standard') ok('standard strategy used');
  else bad('strategy=' + r1.meta['m-strategy']);

  console.log('\n[2] truncated archive (no central directory)');
  const cut = good.slice(0, good.length - 200);
  const r2 = await runRecovery(cut, 'cut');
  console.log('  meta:', r2.meta);
  if (parseInt(r2.meta['m-entries']) >= 3) ok('low-level scan recovered ' + r2.meta['m-entries'] + ' entries');
  else bad('m-entries=' + r2.meta['m-entries']);
  if (r2.meta['m-strategy'] === 'low-level scan') ok('fell back to low-level scan');
  else bad('strategy=' + r2.meta['m-strategy']);

  console.log('\n[3] CD bytes mangled');
  const mangled = good.slice();
  for (let i = mangled.length - 22; i >= 0; i--) {
    if (mangled[i] === 0x50 && mangled[i+1] === 0x4B && mangled[i+2] === 0x05 && mangled[i+3] === 0x06) {
      const cdOff = mangled[i+16] | (mangled[i+17]<<8) | (mangled[i+18]<<16) | (mangled[i+19]<<24);
      mangled[cdOff + 8] = 0xFF; mangled[cdOff + 9] = 0xFF;
      break;
    }
  }
  const r3 = await runRecovery(mangled, 'mangled');
  console.log('  meta:', r3.meta);
  if (parseInt(r3.meta['m-entries']) >= 3) ok('recovered ' + r3.meta['m-entries'] + ' entries despite CD corruption');
  else bad('m-entries=' + r3.meta['m-entries']);

  console.log('\nDone.');
})().catch((e) => { console.error(e); process.exit(2); });
