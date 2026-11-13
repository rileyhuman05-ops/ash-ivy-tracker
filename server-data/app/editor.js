'use strict';
// Site model PREVIEW v3. Layout autosaves to Supabase via /api/layout (Cursor Private identity). File save/load remains as backup.
(function () {
const showErr = m => { const e = document.getElementById('err'); if (e) e.textContent = m; };
try {
// ===== core: data, state, three.js setup, geometry and label helpers =====
const $ = id => document.getElementById(id);
const D = window.DATA, RB = D.rb, AB = D.ab, PARTS = D.parts, LOCS = D.locs, COLS = D.cols, BAYKEYS = D.bayKeys, PACK = D.pack;
let CLEAR = D.site.clear || 24, MIN_AISLE = 8; const WALL_H = 30, CLEAR0 = CLEAR;
const CL = PACK.container.L / 30.48, CW = PACK.container.W / 30.48, CH = PACK.container.H / 30.48;   // container interior, ft
const clone = o => JSON.parse(JSON.stringify(o));
const fmt = v => v == null ? '–' : (+v).toLocaleString('en-US', { maximumFractionDigits: 1 });
const ft = v => String(Math.round(v * 100) / 100);
const r2 = v => Math.round(v * 100) / 100;
const snap = v => Math.round(v * 2) / 2;
const pad2 = n => (n < 10 ? '0' : '') + n;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = s => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 240);
const LETTERS = 'ABCDEFGHIJKLMNOP';
const KIND = ['box', 'overflow slab', 'overflow excess marker', 'unknown size marker', 'placeholder (no size data)'];
const num = (v, lo, hi, def) => { v = parseFloat(v); if (!isFinite(v)) return def; return Math.min(hi, Math.max(lo, v)); };
const parseLevels = s => { const a = String(s).split(/[\s,\/]+/).map(Number).filter(v => isFinite(v) && v >= 0).map(r2); a.sort((x, y) => x - y); return a.filter((v, i) => !i || v > a[i - 1]).slice(0, 12); };

// ---------------------------------------------------------------- state (these are the rows the real site would keep in Supabase)
let types = clone(D.types);
let runs = D.runs.map((r, i) => ({ id: i, code: r.code, label: r.label, type: r.type, x: r.x, z: r.z, axis: r.axis, bays: r.bays, pitch: r.pitch, depth: r.depth, backMax: r.backMax, status: r.status, height: null, levels: null, removed: false,
  bay: r.names.map(n => ({ name: n, type: null, height: null, levels: null })) }));
let areas = D.areas.map((a, i) => ({ id: 100 + i, name: a.name, loc: a.name, x: a.x, z: a.z, w: a.w, d: a.d, flag: a.flag, removed: false }));
let equip = [], conts = [], skus = {}, fcFillPct = 85;      // skus: only the sizes someone changed or added
let nextId = 1000;
let sel = null;            // { kind: 'run'|'bay'|'area'|'equip'|'cont', obj, s? }
let clicked = null;        // last clicked stock box
let tab = 'racks', openType = null;
const undoStack = [], log = [], tight0 = {}, tightBy0 = {};
const view = { walls: 'cut', shadows: true, packMode: 'cat', fc: true };

const typeOf = r => types.find(t => t.id === r.type) || types[0];
const typeById = id => types.find(t => t.id === id) || types[0];
const bayType = (r, s) => r.bay[s] && r.bay[s].type ? typeById(r.bay[s].type) : typeOf(r);
const bayH = (r, s) => { const b = r.bay[s] || {}; return b.height != null ? b.height : b.type ? typeById(b.type).height : r.height != null ? r.height : typeOf(r).height; };
const bayLv = (r, s) => { const b = r.bay[s] || {}; return b.levels || (b.type ? typeById(b.type).levels : (r.levels || typeOf(r).levels)); };
const heightOf = r => r.height != null ? r.height : typeOf(r).height;
const levelsOf = r => r.levels || typeOf(r).levels;
const maxH = r => { let h = 0; for (let s = 0; s < r.bays; s++) h = Math.max(h, bayH(r, s)); return h; };
const lenOf = r => r.bays * r.pitch;
const rectOf = r => r.axis === 'z' ? { x0: r.x, x1: r.x + r.depth, z0: r.z, z1: r.z + lenOf(r) } : { x0: r.x, x1: r.x + lenOf(r), z0: r.z, z1: r.z + r.depth };
const toWorld = (r, a, d) => r.axis === 'z' ? [r.x + d, r.z + a] : [r.x + a, r.z + d];
const byId = (list, id) => list.find(o => o.id === id);
function fixBays(r) { while (r.bay.length < r.bays) r.bay.push({ name: '', type: null, height: null, levels: null }); if (r.bay.length > r.bays) r.bay.length = r.bays; }
const getState = () => JSON.stringify({ types, runs: runs.map(r => { const o = {}; Object.keys(r).forEach(k => { if (k !== 'g' && k !== 'stock' && k !== 'unplaced' && k !== 'tight' && k !== 'tightBy' && k !== 'idx') o[k] = r[k]; }); return o; }),
  areas: areas.map(a => { const o = Object.assign({}, a); delete o.g; delete o.idx; delete o.stock; return o; }), equip: equip.map(e => { const o = Object.assign({}, e); delete o.g; return o; }),
  conts: conts.map(c => { const o = Object.assign({}, c); delete o.g; delete o.mat; delete o.shown; delete o.units; return o; }), nextId, skus, cfg: { minAisle: MIN_AISLE, clear: CLEAR, fill: fcFillPct } });

// ---------------------------------------------------------------- renderer
const R = new THREE.WebGLRenderer({ antialias: true });
R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); R.toneMapping = THREE.NoToneMapping; R.outputEncoding = THREE.sRGBEncoding;
R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.shadowMap.autoUpdate = false;
R.setSize(innerWidth, innerHeight); document.body.prepend(R.domElement);
const dom = R.domElement;
const C = hex => new THREE.Color(hex).convertSRGBToLinear();
const sc = new THREE.Scene(); sc.background = new THREE.Color(0x14181d);
const cam = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.5, 4000);
const ctl = new THREE.OrbitControls(cam, dom);
ctl.screenSpacePanning = true; ctl.enableDamping = true; ctl.dampingFactor = 0.12; ctl.maxPolarAngle = Math.PI * 0.495; ctl.minDistance = 2; ctl.maxDistance = 1200; ctl.zoomSpeed = 1.2;
ctl.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }; ctl.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }; ctl.keys = {};
dom.addEventListener('contextmenu', e => e.preventDefault());
sc.add(new THREE.HemisphereLight(0xffffff, 0x7a8088, 0.5)); sc.add(new THREE.AmbientLight(0xffffff, 0.18));
const sun = new THREE.DirectionalLight(0xfff4e2, 0.82); sun.position.set(75 - 120, 250, 80 - 70);     // from the south-west, so shadows fall across the aisles and show from the default views sun.target.position.set(75, 0, 80); sc.add(sun); sc.add(sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
{ const c = sun.shadow.camera; c.left = -215; c.right = 215; c.top = 215; c.bottom = -215; c.near = 20; c.far = 600; c.updateProjectionMatrix(); }
let dirty = true;
function invalidate(shadows) { dirty = true; if (shadows !== false) R.shadowMap.needsUpdate = true; }

// ---------------------------------------------------------------- materials
const matCache = {};
function lam(hex, op, extra) {
  const k = hex + '|' + op + '|' + (extra ? JSON.stringify(extra) : '');
  if (!matCache[k]) matCache[k] = new THREE.MeshLambertMaterial(Object.assign({ color: C(hex), transparent: op < 1, opacity: op, depthWrite: op >= 1, side: op < 1 ? THREE.DoubleSide : THREE.FrontSide }, extra || {}));
  return matCache[k];
}
const basic = (hex, extra) => new THREE.MeshBasicMaterial(Object.assign({ color: C(hex) }, extra || {}));
const lineCache = {};
function lineMat(hex, op) { const k = hex + '|' + op; if (!lineCache[k]) lineCache[k] = new THREE.LineBasicMaterial({ color: C(hex), transparent: op < 1, opacity: op }); return lineCache[k]; }
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = R.capabilities.getMaxAnisotropy(); if (repeat) t.repeat.set(repeat, repeat); return t;
}
function hatchTex(c1, c2) { return canvasTex(64, 64, (g) => { g.fillStyle = c1; g.fillRect(0, 0, 64, 64); g.strokeStyle = c2; g.lineWidth = 9; for (let k = -64; k < 128; k += 22) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); } }); }
// seeded noise so the page looks the same every load
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function concreteTex(base, joint, speck) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,255,255' : '0,0,0') + ',' + (0.008 + rnd() * speck) + ')'; const s = 6 + rnd() * 60; g.fillRect(rnd() * w - 20, rnd() * h - 20, s, s * (0.4 + rnd())); }
    g.strokeStyle = joint; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  });
}
const TEX = {
  floor: concreteTex('#86898b', 'rgba(40,42,45,0.55)', 0.022), court: concreteTex('#a3a29c', 'rgba(60,60,58,0.5)', 0.022), asphalt: concreteTex('#33363a', 'rgba(0,0,0,0)', 0.007),
  gravel: concreteTex('#97866a', 'rgba(0,0,0,0)', 0.016),
  wire: canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(205,210,214,0.95)'; g.lineWidth = 5; g.strokeRect(0, 0, 64, 64); g.lineWidth = 2; g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.stroke(); }, 3),
  corr: canvasTex(64, 64, (g) => { const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#d8d8d8'); gr.addColorStop(0.5, '#9a9a9a'); gr.addColorStop(0.95, '#e6e6e6'); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }, 2.2),
  door: canvasTex(64, 64, (g) => { g.fillStyle = '#c9cdd1'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 3); }),
};

// ---------------------------------------------------------------- geometry builder: many boxes and struts merged into one mesh
const CUBE = (() => { const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); return { p: g.attributes.position.array, n: g.attributes.normal.array }; })();
function Geo(uvScale) { this.P = []; this.N = []; this.U = []; this.uv = uvScale || 0; this.n = 0; }
Geo.prototype.box = function (cx, cy, cz, sx, sy, sz) {
  const P = this.P, N = this.N, U = this.U, k = this.uv;
  for (let v = 0; v < 36; v++) {
    const t = v * 3, px = CUBE.p[t] * sx + cx, py = CUBE.p[t + 1] * sy + cy, pz = CUBE.p[t + 2] * sz + cz;
    P.push(px, py, pz); N.push(CUBE.n[t], CUBE.n[t + 1], CUBE.n[t + 2]);
    if (k) { const ax = Math.abs(CUBE.n[t]), ay = Math.abs(CUBE.n[t + 1]); U.push(ay > 0.5 ? px * k : ax > 0.5 ? pz * k : px * k, ay > 0.5 ? pz * k : py * k); }
  }
  this.n++; return this;
};
// a square bar of width w from point a to point b (used for bracing)
Geo.prototype.strut = function (x0, y0, z0, x1, y1, z1, w) {
  let ux = x1 - x0, uy = y1 - y0, uz = z1 - z0; const len = Math.hypot(ux, uy, uz); if (len < 1e-6) return this; ux /= len; uy /= len; uz /= len;
  let vx, vy, vz; if (Math.abs(uy) > 0.95) { vx = 1; vy = 0; vz = 0; } else { vx = uz; vy = 0; vz = -ux; } const vl = Math.hypot(vx, vy, vz); vx /= vl; vy /= vl; vz /= vl;
  const wx = uy * vz - uz * vy, wy = uz * vx - ux * vz, wz = ux * vy - uy * vx, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, P = this.P, N = this.N, U = this.U;
  for (let v = 0; v < 36; v++) {
    const t = v * 3, a = CUBE.p[t] * len, b = CUBE.p[t + 1] * w, c = CUBE.p[t + 2] * w, na = CUBE.n[t], nb = CUBE.n[t + 1], nc = CUBE.n[t + 2];
    P.push(cx + ux * a + vx * b + wx * c, cy + uy * a + vy * b + wy * c, cz + uz * a + vz * b + wz * c); N.push(ux * na + vx * nb + wx * nc, uy * na + vy * nb + wy * nc, uz * na + vz * nb + wz * nc);
    if (this.uv) U.push(0, 0);
  }
  this.n++; return this;
};
Geo.prototype.mesh = function (mat, ud, shadow) {
  if (!this.n) return null;
  const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); G.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
  if (this.uv) G.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2)); if (this.C && this.C.length) G.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); G.computeBoundingSphere();
  const m = new THREE.Mesh(G, mat); if (ud) Object.assign(m.userData, ud); if (shadow !== false) { m.castShadow = shadow !== 'recv'; m.receiveShadow = true; } return m;
};
const EDGE = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
function edgesGeo(list) {       // list of [cx,cy,cz,sx,sy,sz]
  const n = list.length, P = new Float32Array(n * 72);
  for (let i = 0; i < n; i++) { const b = list[i], hx = b[3] / 2, hy = b[4] / 2, hz = b[5] / 2;
    for (let j = 0; j < 12; j++) { const o = i * 72 + j * 6, a = EDGE[j][0], c = EDGE[j][1];
      P[o] = b[0] + (a & 1 ? hx : -hx); P[o + 1] = b[1] + (a & 2 ? hy : -hy); P[o + 2] = b[2] + (a & 4 ? hz : -hz); P[o + 3] = b[0] + (c & 1 ? hx : -hx); P[o + 4] = b[1] + (c & 2 ? hy : -hy); P[o + 5] = b[2] + (c & 4 ? hz : -hz); } }
  const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.BufferAttribute(P, 3)); return G;
}
function boxMesh(list, mat, ud, uv, shadow) { const g = new Geo(uv ? 0.6 : 0); list.forEach(b => g.box(b[0], b[1], b[2], b[3], b[4], b[5])); return g.mesh(mat, ud, shadow); }
function addBoxes(parent, list, mat, edgeHex, edgeOp, ud, uv, shadow) {
  if (!list.length) return null; const m = boxMesh(list, mat, ud, uv, shadow); parent.add(m);
  if (edgeHex != null) { const l = new THREE.LineSegments(edgesGeo(list), lineMat(edgeHex, edgeOp == null ? 1 : edgeOp)); if (ud && ud.layer) l.userData.layer = ud.layer; parent.add(l); }
  return m;
}
// flat rectangle on the ground with world-space texture coordinates
function slab(x0, z0, x1, z1, y, mat, div) {
  const G = new THREE.BufferGeometry(), d = div || 15;
  G.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0], 3));
  G.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  G.setAttribute('uv', new THREE.Float32BufferAttribute([x0 / d, z0 / d, x0 / d, z1 / d, x1 / d, z1 / d, x0 / d, z0 / d, x1 / d, z1 / d, x1 / d, z0 / d], 2));
  const m = new THREE.Mesh(G, mat); m.receiveShadow = true; return m;
}
function clearGroup(g) {
  for (let i = g.children.length - 1; i >= 0; i--) { const o = g.children[i]; g.remove(o); if (o.children && o.children.length) clearGroup(o); if (o.geometry && !o.isSprite) o.geometry.dispose(); if (o.material && o.userData.ownMat) o.material.dispose(); }
}

// ---------------------------------------------------------------- labels
const texCache = {};
function labelTex(t, col, bg) {
  const k = t + '|' + (col || '') + '|' + (bg || '');
  if (!texCache[k]) {
    const S = 4, c = document.createElement('canvas'), g = c.getContext('2d'), F = '600 ' + (40 * S) + 'px system-ui,Helvetica,Arial,sans-serif';
    g.font = F; const w = g.measureText(t).width / S + 20; c.width = Math.min(8192, Math.ceil(w * S)); c.height = 56 * S; g.font = F;
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
    g.lineJoin = 'round'; g.lineWidth = 9 * S / 2; g.strokeStyle = bg === '#ffffff' ? 'rgba(255,255,255,0)' : 'rgba(8,10,14,0.92)'; g.strokeText(t, 10 * S, 42 * S); g.fillStyle = col || '#eee'; g.fillText(t, 10 * S, 42 * S);
    const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding; tx.anisotropy = R.capabilities.getMaxAnisotropy(); tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter;
    texCache[k] = { tx, w };
  }
  return texCache[k];
}
function sprite(t, sz, col, bg) { const L = labelTex(t, col, bg), s = new THREE.Sprite(new THREE.SpriteMaterial({ map: L.tx, depthTest: false })); s.userData.ownMat = true; s.scale.set(sz * L.w / 56, sz, 1); return s; }
function flat(t, sz, col, rot) {
  const L = labelTex(t, col), m = new THREE.Mesh(new THREE.PlaneGeometry(sz * L.w / 56, sz), new THREE.MeshBasicMaterial({ map: L.tx, transparent: true, depthWrite: false }));
  m.userData.ownMat = true; m.rotation.x = -Math.PI / 2; if (rot) m.rotation.z = rot; return m;
}
// upright sign on a wall (like the aisle letters by the dock doors)
function sign(t, sz, nx, nz) {
  const L = labelTex(t, '#111111', '#ffffff'), m = new THREE.Mesh(new THREE.PlaneGeometry(sz * L.w / 56, sz), new THREE.MeshBasicMaterial({ map: L.tx }));
  m.userData.ownMat = true; m.rotation.y = Math.atan2(nx, nz); return m;
}
const layerOn = { run: true, aisle: true, bay: true, zone: true, inv: true, equip: true, site: true };
function applyLayers() { sc.traverse(o => { const l = o.userData && o.userData.layer; if (l) o.visible = layerOn[l]; }); invalidate(); }

// ===== site and building shell (measured from the permit site plan, sheet 1 of 14, and the photos) =====
const SITE = {
  ramp: { x0: 78.8, x1: 129.2, z0: -60, z1: 0 },                       // 52 ft wide drive-in ramp on the truck court side
  rampSlots: [[87, -22], [104, -22], [121, -22]],                       // where a 40 ft container sits on the ramp, backed to the doors
  incoming: [[20, -24], [32, -24], [44, -24], [56, -24], [68, -24], [137, -24], [149, -24]],
  hold: { x0: -150, x1: -104, z0: 0, z1: 95 },                          // things nobody has located yet
  rollups: [14, 31.7, 48.7, 56.5, 73.5, 91, 103, 116, 134.5, 149.5],  // roll-up doors on the dock wall: positions estimated from the photos
};
const mapMat = (tex, hex, extra) => new THREE.MeshLambertMaterial(Object.assign({ map: tex, color: C(hex || 0xffffff) }, extra || {}));
const siteG = new THREE.Group(), wallCut = new THREE.Group(), wallFull = new THREE.Group(), wallLow = new THREE.Group();
sc.add(siteG, wallCut, wallFull, wallLow);
function inside(x, z) { const o = D.site.outline; let c = false; for (let i = 0, j = o.length - 1; i < o.length; j = i++) { const a = o[i], b = o[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }

function buildSite() {
  const g = siteG, asphalt = mapMat(TEX.asphalt), court = mapMat(TEX.court), walk = mapMat(TEX.court, 0xdcdad2), gravel = mapMat(TEX.gravel), floorM = mapMat(TEX.floor);
  // ground
  g.add(slab(-260, -190, 420, 330, -0.12, asphalt, 40));
  // inside floor (polished concrete with joints every 15 ft)
  g.add(slab(0, 0, 155.75, 160, 0, floorM, 15)); g.add(slab(-5.4, 100, 0, 160, 0, floorM, 15));
  // truck court, ramp, screen wall
  g.add(slab(12.8, -60, 330, 0, -0.06, court, 13));
  const rp = SITE.ramp; g.add(slab(rp.x0, rp.z0, rp.x1, rp.z1, -0.03, mapMat(TEX.court, 0xb9b6ad), 13));
  const stripes = new Geo(), chev = new Geo();
  [rp.x0, rp.x1].forEach(x => stripes.box(x, 0, -30, 0.5, 0.04, 60));
  for (let z = -52; z < -6; z += 9) { chev.strut(rp.x0 + 6, 0.02, z, (rp.x0 + rp.x1) / 2, 0.02, z + 5, 0.5); chev.strut(rp.x1 - 6, 0.02, z, (rp.x0 + rp.x1) / 2, 0.02, z + 5, 0.5); }
  g.add(stripes.mesh(basic(0xf2c230), null, false)); const cm = chev.mesh(basic(0xf2c230, { transparent: true, opacity: 0.35 }), null, false); g.add(cm);
  { const l = flat('DRIVE-IN RAMP', 2.6, '#f2c230'); l.position.set((rp.x0 + rp.x1) / 2, 0.06, -66); g.add(l); }
  { const l = flat('TRUCK COURT', 3, '#c9cdd2'); l.position.set(45, 0.02, -70); g.add(l); }
  addBoxes(g, [[12.8, 4, -30, 0.7, 8, 60]], lam(0xcfc8b8, 1), null, null, null, false);           // screen wall between the court and the car park
  addBoxes(g, [[2, 3, -70, 14, 6, 0.7], [-5, 3, -79, 0.7, 6, 18], [9, 3, -79, 0.7, 6, 18]], lam(0xcfc8b8, 1), null, null, null, false);   // refuse enclosure
  // south car park: walk, planter, two rows of stalls either side of a 26 ft aisle
  g.add(slab(-18.5, -60, -12, 173.5, -0.02, walk, 6)); g.add(slab(-12, -60, 0, 100, -0.04, gravel, 20)); g.add(slab(-12, 100, -5.4, 160, -0.04, gravel, 20)); g.add(slab(-18.5, -100, 12.8, -60, -0.05, gravel, 20));
  g.add(slab(-104, -100, -76.5, 262, -0.05, gravel, 20));
  const line = new Geo(), island = [], trees = [];
  const rowsZ = [[-61.5, 10.5, 8], [19.5, 91.5, 8], [100.5, 163.5, 7]];
  [[-34.5, -18.5], [-76.5, -60.5]].forEach(xr => {
    rowsZ.forEach(rz => { for (let k = 0; k <= rz[2]; k++) line.box((xr[0] + xr[1]) / 2, 0, rz[0] + k * 9, 16, 0.03, 0.33); });
    [[10.5, 19.5], [91.5, 100.5]].forEach(iz => { island.push([(xr[0] + xr[1]) / 2, 0.2, (iz[0] + iz[1]) / 2, 16, 0.5, 9]); trees.push([(xr[0] + xr[1]) / 2, (iz[0] + iz[1]) / 2]); });
  });
  // east (front) car park: walk, stalls facing the building, 26 ft aisle, outer stalls, landscape, street
  g.add(slab(-18.5, 160, 330, 173.5, -0.02, walk, 6)); g.add(slab(-104, 231.5, 420, 262, -0.05, gravel, 20));
  [[-4, 50, 6], [59, 86, 3], [122, 149, 3], [158, 203, 5], [212, 257, 5]].forEach(q => { for (let k = 0; k <= q[2]; k++) line.box(q[0] + k * 9, 0, 181.5, 0.33, 0.03, 16); });
  [[50, 59], [149, 158], [203, 212]].forEach(q => { island.push([(q[0] + q[1]) / 2, 0.2, 181.5, 9, 0.5, 16]); trees.push([(q[0] + q[1]) / 2, 181.5]); });
  island.push([-20, 0.2, 181.5, 31, 0.5, 16]); trees.push([-22, 181.5]);
  [[-43, -7, 4], [2, 65, 7], [74, 146, 8], [155, 227, 8]].forEach(q => { for (let k = 0; k <= q[2]; k++) line.box(q[0] + k * 9, 0, 223.5, 0.33, 0.03, 16); });
  [[-7, 2], [65, 74], [146, 155]].forEach(q => { island.push([(q[0] + q[1]) / 2, 0.2, 223.5, 9, 0.5, 16]); trees.push([(q[0] + q[1]) / 2, 223.5]); });
  // accessible stalls by the front door, entry walk
  g.add(slab(59.3, 173.8, 76.7, 189.2, 0.01, basic(0x2f6fc4, { transparent: true, opacity: 0.55 }), 15)); g.add(slab(86, 173.5, 122, 189.5, -0.01, walk, 6));
  g.add(line.mesh(basic(0xe9ecef), null, false));
  addBoxes(g, island, mapMat(TEX.gravel, 0xb7a684), 0xd8d6cf, 0.9, null, true, 'recv');
  [[-90, -40], [-90, 60], [-90, 150], [-92, 240], [20, 246], [110, 246], [200, 246], [300, 246], [-3, -84]].forEach(t => trees.push(t));
  const trunk = new Geo(); trees.forEach(t => trunk.box(t[0], 3.2, t[1], 0.7, 6.4, 0.7)); g.add(trunk.mesh(lam(0x6b5236, 1)));
  const canopy = new THREE.IcosahedronGeometry(5.2, 1), cmat = lam(0x5d8a45, 1, { flatShading: true });
  trees.forEach((t, i) => { const m = new THREE.Mesh(canopy, cmat); m.position.set(t[0], 9.5 + (i % 3) * 0.6, t[1]); m.scale.set(1, 0.8, 1); m.castShadow = true; g.add(m); });
  g.add(slab(-260, 262, 420, 300, -0.07, mapMat(TEX.asphalt, 0xbfc4c9), 40));
  { const c = new Geo(); for (let x = -250; x < 410; x += 24) c.box(x, 0, 281, 10, 0.03, 0.4); g.add(c.mesh(basic(0xf2c230), null, false)); }
  [['PARKING', -47.5, 55, Math.PI / 2], ['PARKING', 100, 202.5, 0]].forEach(q => { const l = flat(q[0], 2.6, '#aeb5bd', q[3]); l.position.set(q[1], 0.02, q[2]); g.add(l); });
  // the rest of Building 1 (other suites): shown as a ghost for context
  addBoxes(g, [[243, WALL_H / 2, 80, 174.5, WALL_H, 160]], lam(0xbfc5cc, 0.1), 0x9aa3ad, 0.5, null, false, false);
  { const l = flat('REST OF BUILDING 1 (other suites)', 3, '#9aa3ad'); l.position.set(243, WALL_H + 0.2, 80); g.add(l); }
  // holding strip for things with no known position
  const h = SITE.hold; g.add(slab(h.x0, h.z0, h.x1, h.z1, -0.08, basic(0x3b2c16), 15));
  { const P = [], y = 0; [[h.x0, h.z0, h.x1, h.z0], [h.x1, h.z0, h.x1, h.z1], [h.x1, h.z1, h.x0, h.z1], [h.x0, h.z1, h.x0, h.z0]].forEach(s => P.push(s[0], y, s[1], s[2], y, s[3]));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); const ln = new THREE.LineSegments(lg, new THREE.LineDashedMaterial({ color: C(0xf0a020), dashSize: 2, gapSize: 1.5 })); ln.computeLineDistances(); g.add(ln);
    const l = flat('NOT LOCATED YET: drag these to where they really are', 2.2, '#f0b860', Math.PI / 2); l.position.set(h.x0 - 3, 0.02, (h.z0 + h.z1) / 2); g.add(l); }
  // scale bar and north arrow (north is +X on this plan)
  const wb = new Geo(), kb = new Geo(); for (let k = 0; k < 5; k++) (k % 2 ? kb : wb).box(-95 + k * 10, 0.1, -118, 10, 0.2, 1.5);
  g.add(wb.mesh(basic(0xffffff), null, false)); g.add(kb.mesh(basic(0x101214), null, false));
  { const l = flat('0        10        20        30        40        50 ft', 2.0, '#fff'); l.position.set(-75, 0.2, -114.5); g.add(l); const n = flat('N  ➜', 5, '#fd4'); n.position.set(-20, 0.2, -116); g.add(n); }
}

// ---------------------------------------------------------------- building walls. "cut" shows inside faces only, so the wall nearest the camera disappears.
const GLASS = basic(0xbfe1f7);
const WALLS = { W: { fixed: 'z', c: 0, n: [0, 1] }, E: { fixed: 'z', c: 160, n: [0, -1] }, S: { fixed: 'x', c: 0, n: [1, 0] }, SB: { fixed: 'x', c: -5.4, n: [1, 0] }, N: { fixed: 'x', c: 155.75, n: [-1, 0] } };
function wallPlane(w, h, mat, nx, nz) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.y = Math.atan2(nx, nz); return m; }
function wallItem(wall, t, y0, w, h, mat, matOut) {
  const W = WALLS[wall], lift = mat === GLASS ? 0.16 : 0.08, put = (grp, s, mt) => { const m = wallPlane(w, h, mt, W.n[0] * s, W.n[1] * s), off = lift * s; if (W.fixed === 'z') m.position.set(t, y0 + h / 2, W.c + W.n[1] * off); else m.position.set(W.c + W.n[0] * off, y0 + h / 2, t); grp.add(m); };
  put(wallCut, 1, mat); put(wallFull, -1, matOut || mat);
}
function buildWalls() {
  const o = D.site.outline, inner = lam(0xece7da, 1), outer = lam(0xd9d3c5, 1), band = lam(0xb9b2a2, 1), low = [], top = [];
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length], cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len; if (!inside(cx + nx * 0.6, cz + nz * 0.6)) { nx = -nx; nz = -nz; }
    const pi = wallPlane(len, WALL_H, inner, nx, nz); pi.position.set(cx, WALL_H / 2, cz); pi.receiveShadow = true; wallCut.add(pi);
    const po = wallPlane(len + 1, WALL_H + 5, outer, -nx, -nz); po.position.set(cx - nx * 0.5, (WALL_H + 5) / 2, cz - nz * 0.5); wallFull.add(po);
    const pb = wallPlane(len + 1, 1.2, band, -nx, -nz); pb.position.set(cx - nx * 0.56, WALL_H + 2.4, cz - nz * 0.56); wallFull.add(pb);
    low.push(a[0] === b[0] ? [cx, 1.5, cz, 0.6, 3, len] : [cx, 1.5, cz, len, 3, 0.6]);
    top.push(a[0], WALL_H, a[1], b[0], WALL_H, b[1], a[0], 0.02, a[1], b[0], 0.02, b[1]);
  }
  addBoxes(wallLow, low, lam(0x8f98a3, 0.28), 0x9aa3ad, 0.6, null, false, false);
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3)); wallCut.add(new THREE.LineSegments(tg, lineMat(0xcfd6dd, 0.55)));
  // roof (full mode only), with the 4x8 skylights shown on the sections
  const roof = slab(-5.9, -0.5, 156.25, 160.5, WALL_H + 0.3, lam(0xe9ecee, 1), 15); roof.castShadow = false; wallFull.add(roof);
  { const s = new Geo(); for (let x = 20; x < 150; x += 26) for (let z = 20; z < 150; z += 30) s.box(x, WALL_H + 0.5, z, 4, 0.4, 8); wallFull.add(s.mesh(basic(0xbfe3ff), null, false)); }
  // dock wall: roll-up doors, man doors, small high windows
  const dm = new THREE.MeshLambertMaterial({ map: TEX.door.clone() }); dm.map.repeat.set(1, 3); dm.map.needsUpdate = true;
  const glass = GLASS, manDoor = lam(0x6f7a86, 1), frame = lam(0x3d444c, 1);
  SITE.rollups.forEach(x => { wallItem('W', x, 0, 10, 12, dm); });
  [40.2, 65, 91, 115.7, 141.7, 14].forEach(x => { wallItem('W', x, 20, 4.4, 4.4, frame); wallItem('W', x, 20.2, 4, 4, glass); });
  D.site.doors.forEach(d => { if (d.span || d.id === 'E-ENTRY') return; const wall = d.at[1] === 0 ? 'W' : d.at[1] === 160 ? 'E' : 'S'; wallItem(wall, wall === 'S' ? d.at[1] : d.at[0], 0, 3.4, 7.2, manDoor); });
  // front (east) wall: storefront entry and two rows of windows, as in the photos
  wallItem('E', 90, 0, 6.4, 8.2, frame); wallItem('E', 90, 0.2, 6, 7.8, glass);
  for (let x = 4; x < 46; x += 7) { [[2.5, 6], [14.5, 6]].forEach(q => { wallItem('E', x, q[0] - 0.2, 4.4, q[1] + 0.4, frame); wallItem('E', x, q[0], 4, q[1], glass); }); }
  for (let x = 110; x < 152; x += 7) { wallItem('E', x, 14.3, 4.4, 6.4, frame); wallItem('E', x, 14.5, 4, 6, glass); }
  // offices: open-top rooms so stock kept inside them stays visible
  const ow = [], q = D.site.offices.find(f => f.id === 'OFFICE-BLOCK').rect, H = 10, T = 0.5;
  ow.push([(q[0] + q[2]) / 2, H / 2, q[1], q[2] - q[0], H, T], [q[0], H / 2, (q[1] + q[3]) / 2, T, H, q[3] - q[1]], [q[2], H / 2, (q[1] + q[3]) / 2, T, H, q[3] - q[1]]);
  D.site.offices.forEach(f => { if (f.id === 'OFFICE-BLOCK') return; const r = f.rect; ow.push([(r[0] + r[2]) / 2, H / 2, r[1], r[2] - r[0], H, 0.3], [(r[0] + r[2]) / 2, H / 2, r[3], r[2] - r[0], H, 0.3], [r[0], H / 2, (r[1] + r[3]) / 2, 0.3, H, r[3] - r[1]], [r[2], H / 2, (r[1] + r[3]) / 2, 0.3, H, r[3] - r[1]]);
    const l = flat(f.label.split(' (')[0], 1.5, '#dfe6ee'); l.position.set((r[0] + r[2]) / 2, 0.3, (r[1] + r[3]) / 2); siteG.add(l); });
  siteG.add(slab(q[0], q[1], q[2], q[3], 0.03, lam(0x4d5b6b, 1), 15)); addBoxes(siteG, ow, lam(0xe4dfd2, 1), 0x8a8478, 0.5);
  { const l = flat('Office / restroom block', 1.8, '#dfe6ee'); l.position.set((q[0] + q[2]) / 2, 0.3, 147); siteG.add(l); }
  setWalls(view.walls);
}
function setWalls(mode) { view.walls = mode; wallCut.visible = mode !== 'low'; wallFull.visible = mode === 'full'; wallLow.visible = mode === 'low'; const inner = mode !== 'full'; runsRoot.visible = inner; areasRoot.visible = inner; equipRoot.visible = inner; invalidate(); }

// ---------------------------------------------------------------- equipment: simple block models, sizes in feet
const EQ = {
  forklift_e: { name: 'Forklift (electric)', w: 4, l: 11.5, h: 7.5, p: [[0, 1.9, -1.2, 3.8, 2.6, 5.6, 'yellow'], [0, 3.6, -3.2, 3.6, 0.9, 1.6, 'dark'], [0, 4.2, 1.4, 0.5, 7.4, 0.5, 'dark', 1], [-1.2, 4.2, 1.5, 0.3, 7.4, 0.3, 'dark'], [1.2, 4.2, 1.5, 0.3, 7.4, 0.3, 'dark'], [-0.8, 0.25, 3.8, 0.45, 0.2, 4.4, 'dark'], [0.8, 0.25, 3.8, 0.45, 0.2, 4.4, 'dark'], [0, 7.2, -1.4, 3.4, 0.25, 4.6, 'silver'], [-1.6, 5.3, 0.7, 0.2, 3.8, 0.2, 'silver'], [1.6, 5.3, 0.7, 0.2, 3.8, 0.2, 'silver'], [-1.6, 5.3, -3.5, 0.2, 3.8, 0.2, 'silver'], [1.6, 5.3, -3.5, 0.2, 3.8, 0.2, 'silver'], [-1.9, 0.9, 0.6, 0.6, 1.8, 1.8, 'dark'], [1.9, 0.9, 0.6, 0.6, 1.8, 1.8, 'dark'], [-1.8, 0.7, -3, 0.5, 1.4, 1.4, 'dark'], [1.8, 0.7, -3, 0.5, 1.4, 1.4, 'dark']] },
  forklift_lp: { name: 'Forklift (propane)', w: 4.2, l: 12.5, h: 7.5, p: [[0, 1.9, -1.4, 4, 2.6, 6, 'orange'], [0, 3.5, -3.6, 3.4, 0.8, 1.4, 'steel'], [0, 4.6, -4, 1.3, 1.3, 3, 'silver'], [-1.2, 4.2, 1.6, 0.35, 7.4, 0.35, 'dark'], [1.2, 4.2, 1.6, 0.35, 7.4, 0.35, 'dark'], [-0.8, 0.25, 4.2, 0.45, 0.2, 4.6, 'dark'], [0.8, 0.25, 4.2, 0.45, 0.2, 4.6, 'dark'], [0, 7.2, -1.5, 3.6, 0.25, 4.8, 'dark'], [-1.7, 5.3, 0.7, 0.2, 3.8, 0.2, 'dark'], [1.7, 5.3, 0.7, 0.2, 3.8, 0.2, 'dark'], [-1.7, 5.3, -3.7, 0.2, 3.8, 0.2, 'dark'], [1.7, 5.3, -3.7, 0.2, 3.8, 0.2, 'dark'], [-2, 1, 0.6, 0.7, 2, 2, 'dark'], [2, 1, 0.6, 0.7, 2, 2, 'dark'], [-1.9, 0.8, -3.2, 0.6, 1.6, 1.6, 'dark'], [1.9, 0.8, -3.2, 0.6, 1.6, 1.6, 'dark']] },
  stacker: { name: 'Walkie stacker', w: 3, l: 6.5, h: 7.5, p: [[0, 1.6, -1.6, 2.8, 3, 2.2, 'yellow'], [-1.1, 3.8, 0, 0.35, 7.4, 0.5, 'orange'], [1.1, 3.8, 0, 0.35, 7.4, 0.5, 'orange'], [0, 7.3, 0, 2.6, 0.3, 0.5, 'orange'], [0, 4, 0.05, 2, 6.6, 0.12, 'dark'], [-0.7, 0.25, 1.9, 0.45, 0.2, 3.6, 'orange'], [0.7, 0.25, 1.9, 0.45, 0.2, 3.6, 'orange'], [0, 3.4, -2.9, 0.25, 1.2, 0.25, 'dark']] },
  pallet_jack: { name: 'Pallet jack', w: 2.3, l: 5.2, h: 4, p: [[-0.6, 0.3, 0.8, 0.55, 0.3, 3.8, 'orange'], [0.6, 0.3, 0.8, 0.55, 0.3, 3.8, 'orange'], [0, 0.8, -1.4, 1.8, 1.2, 0.8, 'orange'], [0, 2.6, -1.9, 0.2, 2.8, 0.2, 'dark'], [0, 4, -1.9, 1.2, 0.2, 0.2, 'dark']] },
  ladder: { name: 'Rolling stair ladder', w: 3, l: 9, h: 13, p: [[0, 0.3, 0, 2.8, 0.25, 8.6, 'silver'], [0, 1.5, 2.9, 2.4, 0.15, 1, 'silver'], [0, 3, 1.9, 2.4, 0.15, 1, 'silver'], [0, 4.5, 0.9, 2.4, 0.15, 1, 'silver'], [0, 6, -0.1, 2.4, 0.15, 1, 'silver'], [0, 7.5, -1.1, 2.4, 0.15, 1, 'silver'], [0, 9, -2.9, 2.6, 0.2, 2.6, 'silver'], [-1.3, 4.5, -4.1, 0.15, 9, 0.15, 'silver'], [1.3, 4.5, -4.1, 0.15, 9, 0.15, 'silver'], [-1.3, 10.8, -2.9, 0.12, 3.5, 0.12, 'silver'], [1.3, 10.8, -2.9, 0.12, 3.5, 0.12, 'silver'], [0, 12.5, -4.1, 2.6, 0.12, 0.12, 'silver'], [-1.3, 12.5, -2.9, 0.12, 0.12, 2.6, 'silver'], [1.3, 12.5, -2.9, 0.12, 0.12, 2.6, 'silver']] },
  scissor: { name: 'Scissor lift', w: 3, l: 6.5, h: 7.5, p: [[0, 1.3, 0, 2.8, 1.8, 6.2, 'orange'], [0, 3, 0, 2.6, 1.4, 5.6, 'dark'], [0, 3.9, 0, 2.8, 0.25, 6.2, 'orange'], [-1.35, 5.7, 0, 0.1, 3.4, 6.2, 'rail'], [1.35, 5.7, 0, 0.1, 3.4, 6.2, 'rail'], [0, 5.7, -3.05, 2.8, 3.4, 0.1, 'rail'], [0, 5.7, 3.05, 2.8, 3.4, 0.1, 'rail']] },
  lockers: { name: 'Lockers', w: 6, l: 1.6, h: 6.2, p: [[0, 3.1, 0, 6, 6.2, 1.5, 'steel'], [-1.5, 3.1, 0.78, 0.05, 6, 0.02, 'dark'], [0, 3.1, 0.78, 0.05, 6, 0.02, 'dark'], [1.5, 3.1, 0.78, 0.05, 6, 0.02, 'dark']] },
  flam: { name: 'Flammables cabinet', w: 3.6, l: 1.6, h: 5.5, p: [[0, 2.75, 0, 3.6, 5.5, 1.5, 'yellow'], [0, 4.2, 0.78, 2.6, 0.5, 0.02, 'red']] },
  bench: { name: 'Workbench / tool station', w: 6, l: 2.6, h: 3.2, p: [[0, 3, 0, 6, 0.25, 2.6, 'wood'], [-2.7, 1.45, -1, 0.3, 2.9, 0.3, 'steel'], [2.7, 1.45, -1, 0.3, 2.9, 0.3, 'steel'], [-2.7, 1.45, 1, 0.3, 2.9, 0.3, 'steel'], [2.7, 1.45, 1, 0.3, 2.9, 0.3, 'steel'], [0, 0.9, 0, 5.4, 0.15, 2.2, 'steel'], [0, 4.2, -1.2, 6, 2.2, 0.12, 'wood']] },
  charger: { name: 'Battery charger', w: 2.2, l: 1.6, h: 3.4, p: [[0, 1.7, 0, 2.2, 3.4, 1.5, 'steel'], [0, 2.6, 0.78, 1.2, 0.6, 0.02, 'yellow']] },
  ext: { name: 'Fire extinguisher', w: 1, l: 1, h: 5, p: [[0, 3.2, 0, 0.55, 1.7, 0.55, 'red'], [0, 4.6, 0, 1, 0.8, 0.08, 'red'], [0, 1.2, 0, 0.12, 2.4, 0.12, 'steel']] },
  fan: { name: 'Drum fan', w: 3.4, l: 1.4, h: 3.6, p: [[0, 1.9, 0, 3.2, 3.2, 1.1, 'dark'], [0, 1.9, 0.02, 2.6, 2.6, 1.2, 'steel'], [-1.3, 0.2, 0, 0.3, 0.4, 1.4, 'dark'], [1.3, 0.2, 0, 0.3, 0.4, 1.4, 'dark']] },
  pallets: { name: 'Pallet stack', w: 4, l: 3.4, h: 4, p: [[0, 2, 0, 4, 4, 3.3, 'blue'], [0, 1, 0.01, 4.02, 0.08, 3.32, 'dark'], [0, 2, 0.01, 4.02, 0.08, 3.32, 'dark'], [0, 3, 0.01, 4.02, 0.08, 3.32, 'dark']] },
  trailer: { name: 'Semi trailer (53 ft)', w: 8.5, l: 53, h: 13.5, p: [[0, 8.75, 0, 8.5, 9.5, 53, 'white'], [-3.6, 1.7, 19, 1, 3.4, 8, 'dark'], [3.6, 1.7, 19, 1, 3.4, 8, 'dark'], [-3, 2, -22, 0.4, 4, 0.4, 'steel'], [3, 2, -22, 0.4, 4, 0.4, 'steel'], [0, 3.8, 0, 8, 0.5, 52, 'steel']] },
  truck: { name: 'Box truck (26 ft)', w: 8, l: 33, h: 12.5, p: [[0, 8, 3.5, 8, 9, 26, 'white'], [0, 4.6, -13, 7.6, 6, 6.5, 'steel'], [0, 6.2, -15.6, 7, 2.4, 1.4, 'glass'], [-3.5, 1.6, -12.5, 1, 3.2, 3.2, 'dark'], [3.5, 1.6, -12.5, 1, 3.2, 3.2, 'dark'], [-3.5, 1.6, 10, 1, 3.2, 3.2, 'dark'], [3.5, 1.6, 10, 1, 3.2, 3.2, 'dark']] },
};
const EQC = { yellow: 0xf2b705, orange: 0xe8641b, dark: 0x23272c, silver: 0xc3c8cd, steel: 0x87909a, red: 0xc0392b, wood: 0xb08a57, blue: 0x2a5db0, white: 0xe9ebed, glass: 0x9fc6e0, rail: 0xe8641b };

// ===== stock binding by NAME, racks built bay by bay, floor areas, equipment, containers =====
const runsRoot = new THREE.Group(), areasRoot = new THREE.Group(), equipRoot = new THREE.Group(), contRoot = new THREE.Group(); sc.add(runsRoot, areasRoot, equipRoot, contRoot);
const MAT = { wire: new THREE.MeshLambertMaterial({ map: TEX.wire, transparent: true, depthWrite: false, side: THREE.DoubleSide }) };

// ---- stock colours
const BOXPAL = { 0xc9a26b: 0xcfa25f, 0xff8c1a: 0xf07a14, 0xff3030: 0xd9342b };
const invMats = [];
function invMat(cat) {
  const k = 'inv|' + cat; if (matCache[k]) return matCache[k];
  let m;
  if (cat === 'xs') m = new THREE.MeshLambertMaterial({ color: 0xffffff, map: hatchTex('#ff5a5a', '#3a0c0c'), transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  else if (cat === 'ph') m = new THREE.MeshLambertMaterial({ color: 0xffffff, map: hatchTex('#c9bdf0', '#5b4a86') });
  else if (cat === 'ns') m = new THREE.MeshLambertMaterial({ color: C(0x9aa0a8) });
  else { const raw = COLS[+cat.slice(3)], hex = BOXPAL[raw] || raw, pt = cat.charAt(0) === 'p'; m = new THREE.MeshLambertMaterial({ color: C(hex), transparent: pt, opacity: pt ? 0.42 : 1, depthWrite: !pt, side: pt ? THREE.DoubleSide : THREE.FrontSide }); }
  m.userData.base = m.color.clone(); invMats.push(m); matCache[k] = m; return m;
}
const catOf = (kind, col, pt) => kind === 2 ? 'xs' : kind === 3 ? 'ns' : kind === 4 ? 'ph' : (pt ? 'pt_' : 'op_') + col;
const shrink = (w, d) => [w[0], w[1], w[2], Math.max(w[3] * 0.7, w[3] - d), Math.max(w[4] * 0.7, w[4] - d), Math.max(w[5] * 0.7, w[5] - d)];
function addInv(parent, cats, ud) {
  Object.keys(cats).forEach(cat => {
    const c = cats[cat], list = c.list.map(w => shrink(w, cat === 'ns' ? 0 : 0.5 / 12)), solid = cat !== 'xs' && cat.charAt(0) !== 'p';
    const m = addBoxes(parent, list, invMat(cat), 0x15120e, solid ? 0.5 : 0.35, Object.assign({ idx: c.idx, layer: 'inv' }, ud), true, solid ? true : false);
    if (m) { m.visible = layerOn.inv; parent.children[parent.children.length - 1].visible = layerOn.inv; }
  });
}
const pushCat = (cats, kind, col, pt, w, i) => { const k = catOf(kind, col, pt), c = cats[k] = cats[k] || { list: [], idx: [] }; c.list.push(w); c.idx.push(i); };

// ---- which bay or area holds each box: looked up by name every time something is renamed, added or removed
let bayIndex = {}, dupNames = {}, areaIndex = {}, homeless = {};
const needLv = {}, yoLetter = new Float32Array(RB.length), abOrd = new Int16Array(AB.length);
const placedN = {}, bandL = {}, bandP = {};      // per bay code: levels the current model draws; height of each letter's stack and of each drawn level's stack
RB.forEach(b => { needLv[b[0]] = Math.max(needLv[b[0]] || 0, b[1] + 1); placedN[b[0]] = Math.max(placedN[b[0]] || 0, b[2] + 1); const k = b[0] + '|' + b[2]; bandP[k] = Math.max(bandP[k] || 0, b[5] + b[8]); });
const relL = i => { const b = RB[i]; return b[1] === b[2] ? b[5] : yoLetter[i]; };
const sumBand = (band, key, from, to) => { let s = 0; for (let k = from; k < to; k++) s += band[key + '|' + k] || 0; return s; };
AB.forEach((b, j) => { const n = D.areas[b[0]].name; let o = 0; for (let k = 0; k < b[0]; k++) if (D.areas[k].name === n) o++; abOrd[j] = o; });
function reindex() {
  bayIndex = {}; dupNames = {}; homeless = {};
  runs.forEach(r => { r.idx = []; if (r.removed) return; fixBays(r); for (let s = 0; s < r.bays; s++) { const n = r.bay[s].name; if (!n) continue; if (bayIndex[n]) dupNames[n] = 1; else bayIndex[n] = { r, s }; } });
  const lost = (k, u) => { const h = homeless[k] = homeless[k] || { boxes: 0, units: 0 }; h.boxes++; h.units += u; };
  for (let i = 0; i < RB.length; i++) { const k = BAYKEYS[RB[i][0]], hit = bayIndex[k]; if (hit) hit.r.idx.push(i); else lost('bay ' + k, RB[i][12]); }
  areaIndex = {}; areas.forEach(a => { a.idx = []; if (a.removed || !a.loc) return; (areaIndex[a.loc] = areaIndex[a.loc] || []).push(a); });
  for (let j = 0; j < AB.length; j++) { const n = LOCS[AB[j][9]], list = areaIndex[n]; if (list) (list[abOrd[j]] || list[0]).idx.push(j); else lost('area ' + n, AB[j][10]); }
}
// where a rack box sits now: [cx,cy,cz,sx,sy,sz, level, slot] or null if its level is gone
function rackBox(i) {
  const b = RB[i], hit = bayIndex[BAYKEYS[b[0]]]; if (!hit) return null;
  const r = hit.r, s = hit.s, lv = bayLv(r, s), n = lv.length; let li, yo;
  if (n >= needLv[b[0]] || n > placedN[b[0]]) { li = Math.min(b[1], n - 1); yo = relL(i) + (b[1] > li ? sumBand(bandL, b[0], li, b[1]) : 0); }      // by letter; letters past the last level stack up on the top level
  else { li = Math.min(b[2], n - 1); yo = b[5] + (b[2] > li ? sumBand(bandP, b[0], li, b[2]) : 0); }                                           // as the current model draws it; levels that are gone stack up on the top level
  const p = toWorld(r, s * r.pitch + b[3], b[4]), y = lv[li] + yo + b[8] / 2;
  return r.axis === 'z' ? [p[0], y, p[1], b[7], b[8], b[6], li, s] : [p[0], y, p[1], b[6], b[8], b[7], li, s];
}
function areaBox(j) { const b = AB[j], list = areaIndex[LOCS[b[9]]]; if (!list) return null; const a = list[abOrd[j]] || list[0]; return [a.x + b[1], b[2], a.z + b[3], b[4], b[5], b[6]]; }
function initLetterOffsets() {      // stacking order for boxes whose level letter differs from the level they are squeezed onto
  const minB = {}, abs = {};
  RB.forEach((b, i) => { if (b[1] === b[2]) return; const hit = bayIndex[BAYKEYS[b[0]]]; if (!hit) return; const v = bayLv(hit.r, hit.s)[b[2]] + b[5]; abs[i] = v; const k = b[0] + '|' + b[1]; minB[k] = Math.min(minB[k] == null ? 1e9 : minB[k], v); });
  Object.keys(abs).forEach(i => { const b = RB[i]; yoLetter[i] = abs[i] - minB[b[0] + '|' + b[1]]; });
  RB.forEach((b, i) => { const k = b[0] + '|' + b[1]; bandL[k] = Math.max(bandL[k] || 0, relL(i) + b[8]); });
}

// ---------------------------------------------------------------- racks
function buildRun(r) {
  if (r.g) { clearGroup(r.g); runsRoot.remove(r.g); r.g = null; }
  r.stock = { boxes: 0, units: 0 }; r.unplaced = { boxes: 0, units: 0 }; r.tight = 0; r.tightBy = {};
  if (r.removed) return;
  fixBays(r);
  const g = r.g = new THREE.Group(); runsRoot.add(g);
  const n = r.bays, P = r.pitch, dep = r.depth, ud = { sel: 'run', id: r.id }, acc = {}, deck = new Geo(0.6);
  const G = hex => acc[hex] || (acc[hex] = new Geo());
  const box = (geo, a, d, y, sa, sd, sy) => { const p = toWorld(r, a, d); if (r.axis === 'z') geo.box(p[0], y, p[1], sd, sy, sa); else geo.box(p[0], y, p[1], sa, sy, sd); };
  const strut = (geo, a0, d0, y0, a1, d1, y1, w) => { const p = toWorld(r, a0, d0), q = toWorld(r, a1, d1); geo.strut(p[0], y0, p[1], q[0], y1, q[1], w); };
  // upright frames at every bay line, as tall as the taller neighbour, with the zig-zag bracing seen in the photos
  for (let k = 0; k <= n; k++) {
    const tL = k > 0 ? bayType(r, k - 1) : null, tR = k < n ? bayType(r, k) : null, hL = tL && tL.structure !== 'cantilever' ? bayH(r, k - 1) : 0, hR = tR && tR.structure !== 'cantilever' ? bayH(r, k) : 0;
    if (!hL && !hR) continue;
    const H = Math.max(hL, hR), t = hR >= hL ? tR : tL, U = t.upright, col = G(t.color), a = k * P;
    box(col, a, U / 2, H / 2, U, U, H); box(col, a, dep - U / 2, H / 2, U, U, H);
    box(col, a, U / 2, 0.03, U * 1.8, U * 1.8, 0.06); box(col, a, dep - U / 2, 0.03, U * 1.8, U * 1.8, 0.06);
    let flip = false;
    for (let y = 0.6; y < H - 0.31;) { strut(col, a, U / 2, y, a, dep - U / 2, y, 0.09); const y2 = Math.min(H - 0.3, y + 4); if (y2 - y > 1.2) strut(col, a, flip ? dep - U / 2 : U / 2, y, a, flip ? U / 2 : dep - U / 2, y2, 0.075); flip = !flip; y = y2; }
    strut(col, a, U / 2, H - 0.3, a, dep - U / 2, H - 0.3, 0.09);
  }
  for (let s = 0; s < n; s++) {
    const t = bayType(r, s), H = bayH(r, s), lv = bayLv(r, s), a0 = s * P, col = G(t.color), bm = G(t.beamColor || t.color);
    if (t.structure === 'cantilever') {
      const back = r.backMax ? dep - 0.25 : 0.25, cols = Math.max(1, Math.round(P / (t.colSpacing || 3.9)));
      for (let c = 0; c <= cols; c++) {
        const a = a0 + P * c / cols, shared = c === 0 && s > 0 && bayType(r, s - 1).structure === 'cantilever';
        if (!shared) { box(col, a, back, H / 2, t.upright, t.upright, H); lv.forEach(e => { if (e + 0.33 <= H + 0.01) box(e < 0.5 ? col : bm, a, dep / 2, e + 0.165, 0.3, dep, 0.33); }); }
        if (c < cols) { const a2 = a0 + P * (c + 1) / cols, m = H / 2; [1.5, m, H - 1].forEach(y => strut(col, a, back, y, a2, back, y, 0.1)); strut(col, a, back, 1.5, a2, back, m, 0.07); strut(col, a2, back, 1.5, a, back, m, 0.07); strut(col, a, back, m, a2, back, H - 1, 0.07); strut(col, a2, back, m, a, back, H - 1, 0.07); }
      }
    } else {
      const U = t.upright, bl = P - U;
      lv.forEach(e => { if (e > 0.05 && e <= H + 0.01) { box(bm, a0 + P / 2, 0.08, e - 0.165, bl, 0.16, 0.33); box(bm, a0 + P / 2, dep - 0.08, e - 0.165, bl, 0.16, 0.33); box(deck, a0 + P / 2, dep / 2, e - 0.012, bl, dep - 0.3, 0.024); } });
      if (t.hangers) {
        const first = lv.find(e => e > 0.05) || H, back = r.backMax ? dep - 0.2 : 0.2, dir = r.backMax ? -1 : 1;
        [first * 0.45, first * 0.82].forEach(y => { if (y < 1.5) return; box(bm, a0 + P / 2, back, y, bl, 0.12, 0.2); for (let a = a0 + 0.9; a < a0 + P - 0.5; a += 1.25) { box(bm, a, back + dir * dep * 0.3, y, 0.09, dep * 0.6, 0.09); box(bm, a, back + dir * dep * 0.6, y + 0.25, 0.09, 0.09, 0.5); } });
      }
    }
  }
  Object.keys(acc).forEach(hex => { const m = acc[hex].mesh(lam(hex, 1), ud); if (m) g.add(m); });
  const dm = deck.mesh(MAT.wire, ud, 'recv'); if (dm) { dm.receiveShadow = false; g.add(dm); }
  // stock that resolves to a bay of this rack
  const cats = {};
  (r.idx || []).forEach(i => {
    const b = RB[i], w = rackBox(i);
    if (!w) { r.unplaced.boxes++; r.unplaced.units += b[12]; return; }
    r.stock.boxes++; r.stock.units += b[12];
    const lv = bayLv(r, w[7]), top = w[1] + w[4] / 2, next = lv[w[6] + 1];
    if (b[9] !== 2 && ((next != null && top > next - 0.33 + 0.02) || top > CLEAR + 0.02)) { r.tight++; r.tightBy[w[7]] = (r.tightBy[w[7]] || 0) + 1; }
    pushCat(cats, b[9], b[13], b[14], w, i);
  });
  if (tight0[r.id] == null) { tight0[r.id] = r.tight; tightBy0[r.id] = Object.assign({}, r.tightBy); }
  addInv(g, cats, { sel: 'run', id: r.id, src: 'rack' });
  // labels: rack name, bay names, aisle letters (also as a sign on the dock wall, like the real ones)
  const q = rectOf(r), Hm = maxH(r);
  const rl = flat(r.label, 0.55, r.status === 'installed' ? '#ffd27f' : '#ffb07a', r.axis === 'z' ? Math.PI / 2 : 0); rl.position.set((q.x0 + q.x1) / 2, Hm + 0.4, (q.z0 + q.z1) / 2); rl.userData.layer = 'run'; rl.visible = layerOn.run; g.add(rl);
  const first = {};
  for (let s = 0; s < n; s++) {
    const name = r.bay[s].name; if (!name) continue;
    const p = toWorld(r, (s + 0.5) * P, dep / 2), l = sprite(name, 0.9, dupNames[name] ? '#ff9a9a' : '#fff'); l.position.set(p[0], bayH(r, s) + 1.6, p[1]); l.userData.layer = 'bay'; l.visible = layerOn.bay; g.add(l);
    const pre = name.split(':')[0], no = parseInt(name.split(':')[1], 10) || 0; if (!first[pre] || no < first[pre].no) first[pre] = { no, s };
  }
  Object.keys(first).forEach(pre => {
    const s = first[pre].s, p = toWorld(r, (s + 0.5) * P, dep / 2), l = sprite(pre, 3, '#9cf'); l.position.set(p[0], Math.max(23, bayH(r, s) + 3.4), p[1]); l.userData.layer = 'aisle'; l.visible = layerOn.aisle; g.add(l);
    if (r.axis === 'z' && inside(q.x0 + 0.1, q.z0 + 0.1) && q.z0 < 45) { const sg = sign(pre, 2.4, 0, 1); sg.position.set((q.x0 + q.x1) / 2, 10.5, 0.2); sg.userData.layer = 'aisle'; sg.visible = layerOn.aisle; g.add(sg); }
  });
}

// ---------------------------------------------------------------- floor areas that hold material
function buildArea(a) {
  if (a.g) { clearGroup(a.g); areasRoot.remove(a.g); a.g = null; }
  a.stock = { boxes: 0, units: 0 }; if (a.removed) return;
  const g = a.g = new THREE.Group(); areasRoot.add(g);
  const ud = { sel: 'area', id: a.id }, col = a.flag === 'unlocated' ? 0xf0a020 : 0xf2c230, y = 0.05;
  const pad = slab(a.x, a.z, a.x + a.w, a.z + a.d, y, new THREE.MeshBasicMaterial({ color: C(col), transparent: true, opacity: 0.13, depthWrite: false }), 15); pad.userData = Object.assign({ ownMat: true }, ud); pad.receiveShadow = false; g.add(pad);
  const tape = new Geo(), T = 0.33; tape.box(a.x + a.w / 2, y, a.z, a.w + T, 0.02, T).box(a.x + a.w / 2, y, a.z + a.d, a.w + T, 0.02, T).box(a.x, y, a.z + a.d / 2, T, 0.02, a.d).box(a.x + a.w, y, a.z + a.d / 2, T, 0.02, a.d);
  const tm = tape.mesh(basic(col), ud, false); tm.userData.ownMat = true; g.add(tm);
  const cats = {};
  (a.idx || []).forEach(j => { const b = AB[j], w = areaBox(j); if (!w) return; a.stock.boxes++; a.stock.units += b[10]; pushCat(cats, b[7], b[11], b[12], w, j); });
  addInv(g, cats, { sel: 'area', id: a.id, src: 'area' });
  const l = sprite(a.name, 1.1, a.flag === 'unlocated' ? '#ffcf8a' : '#eee'); l.position.set(a.x + a.w / 2, 9, a.z + a.d / 2); l.userData.layer = 'zone'; l.visible = layerOn.zone; g.add(l);
}

// ---------------------------------------------------------------- equipment
function buildEquip(e) {
  if (e.g) { clearGroup(e.g); equipRoot.remove(e.g); e.g = null; }
  if (e.removed) return;
  const k = EQ[e.kind] || EQ.pallets, g = e.g = new THREE.Group(); equipRoot.add(g); g.position.set(e.x, 0, e.z); g.rotation.y = e.rot * Math.PI / 180;
  const acc = {}; k.p.forEach(p => { (acc[p[6]] = acc[p[6]] || new Geo()).box(p[0], p[1], p[2], p[3], p[4], p[5]); });
  Object.keys(acc).forEach(c => { const m = acc[c].mesh(c === 'rail' ? lam(EQC.rail, 0.35) : lam(EQC[c], 1), { sel: 'equip', id: e.id, layer: 'equip' }, c === 'rail' ? false : true); m.visible = layerOn.equip; g.add(m); });
  const l = sprite(e.name, 0.8, '#ffe9a8', 'rgba(30,26,10,0.78)'); l.position.set(0, k.h + 1.6, 0); l.userData.layer = 'equip'; l.visible = layerOn.equip; g.add(l);
}
function seedEquipment() {
  // counts come from the photos; positions are placeholders along the dock wall until someone drags them home (the blue pallets are where photo 1 shows them)
  const list = [['pallets', 'Blue pallets', 8, 6, 0], ['pallets', 'Blue pallets', 8, 10.5, 0], ['forklift_e', 'Forklift 20 (electric)', 22, 9, 180], ['forklift_lp', 'Forklift (propane)', 28.5, 9, 180], ['stacker', 'Walkie stacker 1', 35, 6, 180], ['stacker', 'Walkie stacker 2', 39.5, 6, 180],
    ['scissor', 'Scissor lift', 44.5, 6, 0], ['ladder', 'Rolling ladder 1', 62, 6, 0], ['ladder', 'Rolling ladder 2', 66.5, 6, 0], ['pallet_jack', 'Pallet jack', 70.5, 5, 0], ['lockers', 'Lockers', 111, 1.2, 0], ['flam', 'Flammables cabinet', 121.5, 1.2, 0], ['fan', 'Drum fan', 127, 4, 0],
    ['ext', 'Fire extinguisher', 24.1, 30.5, 0], ['ext', 'Fire extinguisher', 73.7, 30.5, 0], ['ext', 'Fire extinguisher', 123, 30.5, 0], ['charger', 'Battery charger', 18, 1.2, 0]];
  return list.map(q => ({ id: nextId++, kind: q[0], name: q[1], x: q[2], z: q[3], rot: q[4], removed: false }));
}

// ---------------------------------------------------------------- containers: the ones on site (Fishbowl stock) and the incoming ones from the load planner
const CATC = [0x4ea1ff, 0xd9a45b, 0x2fbf71, 0xe0559a, 0xf0b400, 0x9b7bff, 0x3fd0d0, 0xff7a00, 0x9aa4b0], skuCol = {};
const CSHELL = [0x2f5f8f, 0x8f3a2f, 0x3d7a4a, 0x6f7780, 0x7a5a2f, 0x4a6a8a, 0x8a8f96];
const packColor = it => { if (view.packMode === 'cat') return CATC[it[5] % CATC.length]; if (skuCol[it[0]] == null) skuCol[it[0]] = new THREE.Color().setHSL((Object.keys(skuCol).length * 0.618) % 1, 0.55, 0.55).getHex(); return skuCol[it[0]]; };
const contLocal = (c, k) => {          // box k of container c in the container's own frame: [cx,cy,cz,sx,sy,sz]
  if (c.kind === 'yard') { const b = D.yard[c.src].boxes[k]; return [-CL / 2 + b[0] + b[3] / 2, 0.5 + b[1] + b[4] / 2, -CW / 2 + b[2] + b[5] / 2, b[3], b[4], b[5]]; }
  const q = contPack(c).boxes[k], f = 30.48; return [-CL / 2 + (q[1] + q[4]) / 2 / f, 0.5 + (q[2] + q[5]) / 2 / f, -CW / 2 + (q[3] + q[6]) / 2 / f, (q[4] - q[1]) / f, (q[5] - q[2]) / f, (q[6] - q[3]) / f];
};
const contCount = c => c.kind === 'yard' ? D.yard[c.src].boxes.length : contPack(c).boxes.length;
function contWorld(c, w) { const t = c.rot * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t); return [c.x + w[0] * cs + w[2] * sn, w[1], c.z - w[0] * sn + w[2] * cs]; }
const contMat = (col, endwise) => { const k = 'cont|' + col + '|' + endwise; if (!matCache[k]) { const t = TEX.corr.clone(); t.repeat.set((endwise ? CW + 0.4 : CL + 0.5) / 1.1, 1); t.needsUpdate = true; matCache[k] = new THREE.MeshLambertMaterial({ map: t, color: C(col) }); } return matCache[k]; };
function buildCont(c) {
  if (c.g) { clearGroup(c.g); contRoot.remove(c.g); c.g = null; }
  if (c.removed || c.hidden || c.received) return;
  const g = c.g = new THREE.Group(); contRoot.add(g); g.position.set(c.x, 0, c.z); g.rotation.y = c.rot * Math.PI / 180;
  const ud = { sel: 'cont', id: c.id }, L = CL + 0.5, W = CW + 0.4, H = CH + 0.9, col = CSHELL[c.shell % CSHELL.length], fr = new Geo();
  fr.box(0, 0.25, 0, L, 0.5, W);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(s => fr.box(s[0] * (L / 2 - 0.15), H / 2, s[1] * (W / 2 - 0.15), 0.3, H, 0.3));
  [-1, 1].forEach(s => { fr.box(0, H - 0.15, s * (W / 2 - 0.15), L, 0.3, 0.3); fr.box(s * (L / 2 - 0.15), H - 0.15, 0, 0.3, 0.3, W); });
  g.add(fr.mesh(lam(col, 1), ud));
  const side = contMat(col, false), end = contMat(col, true);
  const wall = (w, mat, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H - 0.5), mat); m.position.set(x, 0.5 + (H - 0.5) / 2, z); m.rotation.y = ry; m.userData = Object.assign({}, ud); m.receiveShadow = true; g.add(m); return m; };
  wall(L, side, 0, -W / 2 + 0.02, 0); wall(L, side, 0, W / 2 - 0.02, Math.PI); wall(W, end, -L / 2 + 0.02, 0, Math.PI / 2);
  if (c.closed) { wall(L, side, 0, -W / 2, Math.PI); wall(L, side, 0, W / 2, 0); wall(W, end, -L / 2, 0, -Math.PI / 2); wall(W, end, L / 2, 0, Math.PI / 2); const rf = new Geo(); rf.box(0, H + 0.05, 0, L, 0.12, W); g.add(rf.mesh(lam(col, 1), ud)); }
  else { const dr = new Geo(); [-1, 1].forEach(s => dr.box(L / 2 + 1.9, 0.5 + (H - 0.5) / 2, s * (W / 2 + 0.05), 3.8, H - 0.5, 0.12)); g.add(dr.mesh(lam(col, 1), ud)); }
  // contents
  const n = contCount(c), shown = c.shown == null ? n : Math.min(n, c.shown); c.units = 0;
  if (!c.closed) {
    if (c.kind === 'yard') { const cats = {}, B = D.yard[c.src].boxes; for (let k = 0; k < shown; k++) { pushCat(cats, B[k][6], B[k][10], B[k][11], contLocal(c, k), k); c.units += B[k][9]; } addInv(g, cats, { sel: 'cont', id: c.id, src: 'yard' }); }
    else {
      const geo = new Geo(), items = contPack(c).items, list = [], idx = [], cc = new THREE.Color(); geo.C = [];
      for (let k = 0; k < shown; k++) { const w = shrink(contLocal(c, k), 0.04), it = items[contPack(c).boxes[k][0]]; cc.setHex(packColor(it)).convertSRGBToLinear(); geo.box(w[0], w[1], w[2], w[3], w[4], w[5]); for (let v = 0; v < 36; v++) geo.C.push(cc.r, cc.g, cc.b); list.push(w); idx.push(k); }
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true }); mat.userData.base = new THREE.Color(1, 1, 1); c.mat = mat;
      const m = geo.mesh(mat, { sel: 'cont', id: c.id, src: 'pack', idx, layer: 'inv' }); if (m) { m.userData.ownMat = true; m.visible = layerOn.inv; g.add(m); const e = new THREE.LineSegments(edgesGeo(list), lineMat(0x0d0f12, 0.55)); e.userData.layer = 'inv'; e.visible = layerOn.inv; g.add(e); }
    }
  }
  const tag = c.kind === 'yard' ? c.name + ' · ' + fmt(c.units || D.yard[c.src].boxes.reduce((s, b) => s + b[9], 0)) + ' u' : c.name + ' · ' + contPack(c).cbm.toFixed(1) + ' CBM' + (c.eta ? ' · ETA ' + c.eta : '');
  const l = sprite(tag, 1.5, '#fff', c.kind === 'yard' ? 'rgba(20,45,80,0.9)' : 'rgba(60,40,10,0.9)'); l.position.set(0, H + 2.4, 0); l.userData.layer = 'zone'; l.visible = layerOn.zone; g.add(l);
}
function seedContainers() {
  const out = [];
  D.yard.forEach((y, i) => out.push({ id: nextId++, kind: 'yard', src: i, name: y.name, x: SITE.rampSlots[i][0], z: SITE.rampSlots[i][1], rot: -90, shell: i, status: 'On the ramp', closed: false, hidden: false, removed: false }));
  PACK.list.forEach((p, i) => out.push({ id: nextId++, kind: 'incoming', src: i, name: 'Incoming ' + p.no, x: SITE.incoming[i][0], z: SITE.incoming[i][1], rot: -90, shell: 3 + (i % 4), status: 'Incoming', closed: false, hidden: false, removed: false }));
  return out;
}
function buildAll() { reindex(); runs.forEach(buildRun); areas.forEach(buildArea); equip.forEach(buildEquip); conts.forEach(buildCont); invalidate(); }
function rebuildStockOwners() { reindex(); runs.forEach(buildRun); areas.forEach(buildArea); invalidate(); }

// ===== selection, checks, history, panel, navigation, search =====
const LISTS = { run: () => runs, bay: () => runs, area: () => areas, equip: () => equip, cont: () => conts };
const TABOF = { run: 'racks', bay: 'racks', area: 'areas', equip: 'equip', cont: 'conts' };
const selName = s => s.kind === 'run' ? s.obj.code : s.kind === 'bay' ? (s.obj.bay[s.s].name || s.obj.code + ' bay ' + (s.s + 1)) : s.obj.name;
function foot(s) {
  const o = s.obj;
  if (s.kind === 'run') { const q = rectOf(o); return { cx: (q.x0 + q.x1) / 2, cz: (q.z0 + q.z1) / 2, w: q.x1 - q.x0, d: q.z1 - q.z0, h: maxH(o), rot: 0 }; }
  if (s.kind === 'bay') { const p = toWorld(o, (s.s + 0.5) * o.pitch, o.depth / 2); return { cx: p[0], cz: p[1], w: o.axis === 'z' ? o.depth : o.pitch, d: o.axis === 'z' ? o.pitch : o.depth, h: bayH(o, s.s), rot: 0 }; }
  if (s.kind === 'area') return { cx: o.x + o.w / 2, cz: o.z + o.d / 2, w: o.w, d: o.d, h: 1.5, rot: 0 };
  if (s.kind === 'equip') { const k = EQ[o.kind] || EQ.pallets; return { cx: o.x, cz: o.z, w: k.w, d: k.l, h: k.h, rot: o.rot }; }
  return { cx: o.x, cz: o.z, w: CL + 0.5, d: CW + 0.4, h: CH + 0.9, rot: o.rot };
}
function rebuild(s) { const o = s.obj; if (s.kind === 'run' || s.kind === 'bay') buildRun(o); else if (s.kind === 'area') buildArea(o); else if (s.kind === 'equip') buildEquip(o); else buildCont(o); invalidate(); }

// ---- checks around a rack
function neighbors(r) {
  const A = rectOf(r), res = { lo: null, hi: null, overlaps: [] };
  const upd = (k, gap, o, mid) => { if (gap < -0.05) return; if (!res[k] || gap < res[k].gap) res[k] = { gap: Math.max(0, gap), run: o, mid }; };
  runs.forEach(o => {
    if (o === r || o.removed) return;
    const Q = rectOf(o), ox = Math.min(A.x1, Q.x1) - Math.max(A.x0, Q.x0), oz = Math.min(A.z1, Q.z1) - Math.max(A.z0, Q.z0);
    if (ox > 0.05 && oz > 0.05) { res.overlaps.push(o); return; }
    if (r.axis === 'z') { if (oz > 0.05) { const mid = (Math.max(A.z0, Q.z0) + Math.min(A.z1, Q.z1)) / 2; if (Q.x0 >= A.x1 - 0.05) upd('hi', Q.x0 - A.x1, o, mid); else if (Q.x1 <= A.x0 + 0.05) upd('lo', A.x0 - Q.x1, o, mid); } }
    else if (ox > 0.05) { const mid = (Math.max(A.x0, Q.x0) + Math.min(A.x1, Q.x1)) / 2; if (Q.z0 >= A.z1 - 0.05) upd('hi', Q.z0 - A.z1, o, mid); else if (Q.z1 <= A.z0 + 0.05) upd('lo', A.z0 - Q.z1, o, mid); }
  });
  return res;
}
function warningsFor(r) {      // [level, text, 1 if it is a fit warning that "as built" can silence]
  const w = [], q = rectOf(r), nb = neighbors(r), H = maxH(r), fit = (lvl, txt) => { w.push(r.ok ? ['note', txt + ' Marked as built.'] : [lvl, txt, 1]); };
  if (r.status === 'unverified') w.push(['warn', 'Added from the photos. Its position and size are an estimate.']);
  if (H > CLEAR) fit('bad', 'Uprights are above the ' + CLEAR + ' ft clear height.');
  for (let s = 0; s < r.bays; s++) { const lv = bayLv(r, s), h = bayH(r, s), over = lv.filter(e => e > h); if (over.length) { fit('warn', 'A level sits above the uprights in ' + (r.bay[s].name || 'bay ' + (s + 1)) + ', so no beam is drawn for it.'); break; } }
  const dups = r.bay.filter(b => b.name && dupNames[b.name]).map(b => b.name); if (dups.length) w.push(['bad', 'Bay name used twice in the building: ' + dups.slice(0, 4).join(', ') + '. Stock goes to the first one.']);
  if (r.unplaced.boxes) w.push(['bad', fmt(r.unplaced.boxes) + ' boxes (' + fmt(r.unplaced.units) + ' units) are on a level this rack does not have. They are still counted.']);
  const more = r.tight - (tight0[r.id] || 0);
  if (more > 0) { const b0 = tightBy0[r.id] || {}, where = Object.keys(r.tightBy || {}).filter(s => r.tightBy[s] > (b0[s] || 0)).map(s => ((r.bay[s] && r.bay[s].name) || 'bay ' + (+s + 1)) + ' (' + (r.tightBy[s] - (b0[s] || 0)) + ')');
    fit('warn', fmt(more) + ' more boxes do not fit under the level above or the ' + CLEAR + ' ft ceiling' + (where.length ? ': ' + where.slice(0, 5).join(', ') + (where.length > 5 ? ' …' : '') : '') + '. Box sizes in the model are estimates.'); }
  if (nb.overlaps.length) w.push(['bad', 'Overlaps ' + nb.overlaps.map(o => o.code).join(', ') + '.']);
  ['lo', 'hi'].forEach(k => { const g = nb[k]; if (!g || g.gap < 1.5) return; if (g.gap < MIN_AISLE) fit('bad', 'Aisle to ' + plain(g.run.code) + ' is only ' + g.gap.toFixed(1) + ' ft (' + MIN_AISLE + ' ft minimum).'); else w.push(['ok', 'Aisle to ' + plain(g.run.code) + ': ' + g.gap.toFixed(1) + ' ft.']); });
  if (r.status !== 'unmapped' && ![[q.x0, q.z0], [q.x1, q.z0], [q.x0, q.z1], [q.x1, q.z1]].every(p => inside(p[0] + (p[0] === q.x0 ? 0.05 : -0.05), p[1] + (p[1] === q.z0 ? 0.05 : -0.05)))) w.push(['warn', 'Part of this rack is outside the building.']);
  return w;
}

// ---- selection visuals
const selG = new THREE.Group(); sc.add(selG);
function refreshSel() {
  clearGroup(selG); selG.position.set(0, 0, 0); invalidate(false);
  if (!sel || sel.obj.removed || sel.obj.hidden || sel.obj.received) return;
  const f = foot(sel), inner = new THREE.Group(), m = 0.35; inner.position.set(f.cx, 0, f.cz); inner.rotation.y = (f.rot || 0) * Math.PI / 180; selG.add(inner);
  const wire = new THREE.LineSegments(edgesGeo([[0, f.h / 2 + 0.05, 0, f.w + 2 * m, f.h + 0.1, f.d + 2 * m]]), new THREE.LineBasicMaterial({ color: C(dragOn ? 0x35d0ff : 0xffe600), depthTest: false })); wire.userData.ownMat = true; wire.renderOrder = 5; inner.add(wire);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(f.w + 2 * m, f.d + 2 * m), new THREE.MeshBasicMaterial({ color: C(dragOn ? 0x35d0ff : 0xffe600), transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  plate.userData.ownMat = true; plate.userData.plate = true; plate.rotation.x = -Math.PI / 2; plate.position.y = 0.26; inner.add(plate);
  const tag = sprite(selName(sel), 2.2, '#fff7b0', 'rgba(70,60,0,0.92)'); tag.position.set(f.cx, Math.max(sel.kind === 'run' || sel.kind === 'bay' ? 27 : 0, f.h + 6), f.cz); selG.add(tag);
  if (sel.kind !== 'run') return;
  const r = sel.obj, q = rectOf(r), nb = neighbors(r);
  ['lo', 'hi'].forEach(k => {
    const g = nb[k]; if (!g || g.gap < 1.5) return;
    const ok = g.gap >= MIN_AISLE || r.ok, y = 0.6; let a, b;
    if (r.axis === 'z') { const x = k === 'hi' ? q.x1 : q.x0, s = k === 'hi' ? 1 : -1; a = [x, y, g.mid]; b = [x + s * g.gap, y, g.mid]; } else { const z = k === 'hi' ? q.z1 : q.z0, s = k === 'hi' ? 1 : -1; a = [g.mid, y, z]; b = [g.mid, y, z + s * g.gap]; }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(a.concat(b), 3));
    const ln = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: C(ok ? 0x2fbf71 : 0xff3b3b), depthTest: false })); ln.userData.ownMat = true; ln.renderOrder = 5; selG.add(ln);
    const l = sprite(g.gap.toFixed(1) + ' ft' + (g.gap >= MIN_AISLE ? '' : r.ok ? ' (as built)' : ' (under ' + MIN_AISLE + ')'), 1.5, ok ? '#9ff0c0' : '#ffb0b0', ok ? 'rgba(10,60,25,0.9)' : 'rgba(120,20,20,0.92)'); l.position.set((a[0] + b[0]) / 2, 2.2, (a[2] + b[2]) / 2); selG.add(l);
  });
}
function select(kind, obj, s, fly) {
  const prev = sel; sel = kind && obj && !obj.removed ? { kind, obj, s: s || 0 } : null;
  if (!sel || !prev || prev.obj !== sel.obj || prev.kind !== sel.kind) moveMode(false);      // moving is locked again as soon as something else is picked
  refreshSel();
  if (sel) { tab = TABOF[kind]; if (fly) { const f = foot(sel); moveTo(new THREE.Vector3(f.cx, 0, f.cz)); } }
  render();
}

// ---- history: every committed change is described and can be undone
let committed, INITIAL, lastLost = 0;
const lostTotal = () => Object.keys(homeless).reduce((s, k) => s + homeless[k].boxes, 0);
function describe(a, b) {
  const out = [], A = {}; a.runs.forEach(r => { A[r.id] = r; });
  const q = s => esc(String(s == null ? '' : s));
  const tn = (st, id) => q((st.types.find(t => t.id === id) || {}).name || id);
  const eff = (st, r) => { const t = st.types.find(x => x.id === r.type) || st.types[0]; return { h: r.height != null ? r.height : t.height, lv: r.levels || t.levels }; };
  const span = bays => { const n = bays.map(x => x.name).filter(Boolean).map(q); return n.length ? (n.length > 1 ? n[0] + ' … ' + n[n.length - 1] : n[0]) : 'no names'; };
  b.runs.forEach(r => {
    const o = A[r.id]; if (!o) { out.push('Rack ' + q(r.code) + ': added (' + tn(b, r.type) + ')'); return; }
    const ch = []; if (o.removed !== r.removed) ch.push(r.removed ? 'removed' : 'restored');
    if (o.type !== r.type) ch.push('type ' + tn(a, o.type) + ' → ' + tn(b, r.type));
    if (o.type !== r.type || o.height !== r.height || JSON.stringify(o.levels) !== JSON.stringify(r.levels)) { const eo = eff(a, o), en = eff(b, r); if (eo.h !== en.h) ch.push('height ' + ft(eo.h) + ' → ' + ft(en.h) + ' ft'); if (eo.lv.join() !== en.lv.join()) ch.push('levels ' + eo.lv.map(ft).join(' / ') + ' → ' + en.lv.map(ft).join(' / ') + ' ft'); }
    if (o.axis !== r.axis) ch.push('turned 90°'); else if (o.x !== r.x || o.z !== r.z) ch.push('moved ' + ft(r.x - o.x) + ' ft in X, ' + ft(r.z - o.z) + ' ft in Z');
    if (o.bays !== r.bays) ch.push('bays ' + o.bays + ' → ' + r.bays); if (o.pitch !== r.pitch) ch.push('bay width ' + ft(o.pitch) + ' → ' + ft(r.pitch) + ' ft'); if (o.depth !== r.depth) ch.push('depth ' + ft(o.depth) + ' → ' + ft(r.depth) + ' ft');
    if (o.label !== r.label) ch.push('renamed "' + q(r.label) + '"'); if (!!o.ok !== !!r.ok) ch.push(r.ok ? 'marked as built (fit warnings off)' : 'fit warnings back on'); if (!!o.noRecv !== !!r.noRecv) ch.push(r.noRecv ? 'left out of the receiving forecast' : 'back in the receiving forecast');
    if (o.bay.map(x => x.name).join() !== r.bay.map(x => x.name).join()) ch.push('bay names ' + span(o.bay) + ' → ' + span(r.bay));
    r.bay.forEach((x, s) => { const p = o.bay[s]; if (!p) return; const c2 = []; if (p.type !== x.type) c2.push('type ' + (x.type ? tn(b, x.type) : 'same as the rack')); if (p.height !== x.height) c2.push('height ' + (x.height == null ? 'same as the rack' : ft(x.height) + ' ft')); if (JSON.stringify(p.levels) !== JSON.stringify(x.levels)) c2.push('levels ' + (x.levels ? x.levels.map(ft).join(' / ') + ' ft' : 'same as the rack')); if (!!p.ok !== !!x.ok) c2.push(x.ok ? 'levels marked as built' : 'level warning back on'); if (c2.length) ch.push('bay ' + q(x.name || (s + 1)) + ' ' + c2.join(', ')); });
    if (ch.length) out.push('Rack ' + q(r.code) + ': ' + (ch.length > 6 ? ch.slice(0, 6).join('; ') + '; and ' + (ch.length - 6) + ' more' : ch.join('; ')));
  });
  [['areas', 'Area'], ['equip', 'Equipment'], ['conts', 'Container']].forEach(kl => {
    const m = {}; a[kl[0]].forEach(o => { m[o.id] = o; });
    b[kl[0]].forEach(o => {
      const p = m[o.id], nm = kl[1] + ' ' + q(o.name); if (!p) { out.push(nm + ': added'); return; }
      const ch = []; if (p.removed !== o.removed) ch.push(o.removed ? 'removed' : 'restored'); if (p.name !== o.name) ch.push('renamed from "' + q(p.name) + '"');
      if (p.x !== o.x || p.z !== o.z) ch.push('moved ' + ft(o.x - p.x) + ' ft in X, ' + ft(o.z - p.z) + ' ft in Z'); if (p.rot !== o.rot) ch.push('turned to ' + o.rot + '°');
      if (p.w !== o.w || p.d !== o.d) ch.push('resized to ' + ft(o.w) + ' × ' + ft(o.d) + ' ft'); if (p.loc !== o.loc) ch.push(o.loc ? 'now holds Fishbowl location "' + q(o.loc) + '"' : 'holds no Fishbowl location');
      if (p.kind !== o.kind) ch.push(o.kind === 'order' ? 'repacked with the edited SKU sizes' : 'type changed'); if (!!p.received !== !!o.received) ch.push(o.received ? 'marked received' : 'brought back, not received'); if (!!p.fc !== !!o.fc) ch.push(o.fc ? 'added to the forecast' : 'taken out of the forecast');
      if (JSON.stringify(p.lines) !== JSON.stringify(o.lines) && p.kind === o.kind) ch.push('contents changed, now ' + (o.lines || []).length + ' lines'); if ((p.eta || '') !== (o.eta || '')) ch.push(o.eta ? 'ETA ' + q(o.eta) : 'ETA cleared'); if ((p.po || '') !== (o.po || '')) ch.push('reference "' + q(o.po || '') + '"'); if (p.status !== o.status) ch.push('status "' + q(o.status) + '"'); if (p.closed !== o.closed) ch.push(o.closed ? 'closed up' : 'opened'); if (p.hidden !== o.hidden) ch.push(o.hidden ? 'hidden' : 'shown');
      if (ch.length) out.push(nm + ': ' + ch.join(', '));
    });
  });
  b.types.forEach(t => {
    const o = a.types.find(x => x.id === t.id); if (!o) { out.push('Rack type added: ' + q(t.name)); return; }
    const ch = []; if (o.name !== t.name) ch.push('renamed from "' + q(o.name) + '"'); if (o.height !== t.height) ch.push('default height ' + ft(o.height) + ' → ' + ft(t.height) + ' ft');
    if (o.levels.join() !== t.levels.join()) ch.push('default levels ' + o.levels.map(ft).join(' / ') + ' → ' + t.levels.map(ft).join(' / ') + ' ft');
    if (o.color !== t.color || o.beamColor !== t.beamColor) ch.push('colour'); if (o.structure !== t.structure || !!o.hangers !== !!t.hangers) ch.push('build'); if (o.upright !== t.upright) ch.push('upright size');
    if (ch.length) out.push('Rack type "' + q(t.name) + '": ' + ch.join(', '));
  });
  a.types.forEach(t => { if (!b.types.find(x => x.id === t.id)) out.push('Rack type deleted: ' + q(t.name)); });
  const sa = a.skus || {}, sb = b.skus || {}; Object.keys(Object.assign({}, sa, sb)).forEach(k => { const y = sb[k]; if (JSON.stringify(sa[k]) === JSON.stringify(y)) return; out.push('SKU ' + q(k) + ': ' + (y ? 'box ' + [y.l, y.w, y.h].join(' × ') + ' in, ' + y.boxes + (y.boxes > 1 ? ' boxes' : ' box') + ' per unit' + (y.pcs > 1 ? ', ' + y.pcs + ' units per box' : '') : sa[k] && sa[k].desc != null && !SKU0[k] ? 'deleted' : 'back to the original size')); });
  const ca = a.cfg || {}, cb = b.cfg || {}; if (ca.minAisle !== cb.minAisle) out.push('Narrowest aisle before a warning: ' + cb.minAisle + ' ft'); if (ca.clear !== cb.clear) out.push('Clear height: ' + cb.clear + ' ft'); if (ca.fill !== cb.fill) out.push('Forecast fills open rack space to ' + cb.fill + '%');
  return out;
}
let cloudRev = 0, cloudTimer = null, cloudStatus = 'idle', cloudMsg = '', cloudIgnore = false;
function cloudParse(res) {
  const ct = (res.headers.get('content-type') || '');
  if (ct.indexOf('application/json') < 0) return Promise.resolve({ __nonJson: true, status: res.status });
  return res.json().catch(() => ({}));
}
function cloudFailMsg(data, res) {
  if (data && data.__nonJson) return plain('Cloud API returned a sign-in page (HTTP ' + (data.status || res.status) + ')');
  const err = data && (data.error || data.message);
  if (err === 'supabase_invalid_api_key' || err === 'supabase_not_configured' || (data && data.configured === false && /key|JWT|secret|database/i.test(String(data.message || '')))) {
    return plain(data.message || 'Cloud database key rejected — update the bound server secret in Cursor Secrets');
  }
  return plain(err || ('HTTP ' + res.status));
}
async function cloudLoad() {
  cloudStatus = 'loading'; chrome();
  try {
    const res = await fetch('/api/layout', { credentials: 'same-origin', cache: 'no-store' });
    if (res.status === 401) { cloudStatus = 'auth'; cloudMsg = 'Sign in to Cursor to sync'; chrome(); return; }
    const data = await cloudParse(res);
    if (data.__nonJson) { cloudStatus = 'auth'; cloudMsg = cloudFailMsg(data, res); chrome(); return; }
    if (!res.ok) { cloudStatus = (data.error === 'supabase_invalid_api_key' || res.status === 503) ? 'offline' : 'error'; cloudMsg = cloudFailMsg(data, res); chrome(); return; }
    if (!data.configured) { cloudStatus = 'offline'; cloudMsg = plain(data.message || 'Cloud save not configured'); chrome(); return; }
    if (!data.state || !data.state.runs || !data.state.types) { cloudRev = data.revision || 0; cloudStatus = 'ready'; cloudMsg = 'No saved layout yet'; chrome(); return; }
    cloudIgnore = true;
    try {
      cloudRev = data.revision || 0;
      setState(JSON.stringify(data.state));
      committed = getState();
      undoStack.length = 0;
      lastLost = lostTotal();
      cloudStatus = 'ready';
      cloudMsg = data.updatedAt ? ('Loaded · ' + new Date(data.updatedAt).toLocaleString()) : 'Loaded';
      render();
    } finally { cloudIgnore = false; }
  } catch (e) { cloudStatus = 'error'; cloudMsg = plain(e.message || String(e)); }
  chrome();
}
async function cloudSave(manual) {
  if (cloudIgnore) return;
  if (cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; }
  cloudStatus = 'saving'; cloudMsg = manual ? 'Saving…' : 'Autosaving…'; chrome();
  try {
    const res = await fetch('/api/layout', {
      method: 'PUT', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: JSON.parse(getState()), revision: cloudRev })
    });
    const data = await cloudParse(res);
    if (data.__nonJson) { cloudStatus = 'auth'; cloudMsg = cloudFailMsg(data, res); chrome(); return; }
    if (res.status === 409) {
      cloudStatus = 'conflict';
      cloudMsg = 'Someone else saved first — reload to get their layout, or Save again to overwrite';
      if (data.revision != null) cloudRev = data.revision;
      chrome();
      return;
    }
    if (res.status === 503 || data.error === 'supabase_not_configured' || data.error === 'supabase_invalid_api_key') {
      cloudStatus = 'offline'; cloudMsg = cloudFailMsg(data, res); chrome(); return;
    }
    if (!res.ok) { cloudStatus = 'error'; cloudMsg = cloudFailMsg(data, res); chrome(); return; }
    cloudRev = data.revision || cloudRev;
    cloudStatus = 'saved';
    cloudMsg = 'Saved' + (data.updatedAt ? (' · ' + new Date(data.updatedAt).toLocaleString()) : '');
  } catch (e) { cloudStatus = 'error'; cloudMsg = plain(e.message || String(e)); }
  chrome();
}
function scheduleCloudSave() {
  if (cloudIgnore) return;
  cloudStatus = 'pending'; cloudMsg = 'Unsaved changes…'; chrome();
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => cloudSave(false), 900);
}
function flushCloudSave() { if (cloudIgnore) return; if (cloudTimer || cloudStatus === 'pending') cloudSave(false); }
addEventListener('pagehide', flushCloudSave);
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushCloudSave(); });
function commit() {
  const now = getState(); if (now === committed) return false;
  const d = describe(JSON.parse(committed), JSON.parse(now)), t = new Date(), lost = lostTotal();
  if (lost !== lastLost) { d.push(lost ? 'Stock with no home now: ' + fmt(lost) + ' boxes (see More)' : 'All stock has a home again'); lastLost = lost; }
  undoStack.push(committed); committed = now; d.forEach(s => log.unshift({ t, s })); forecast(); readouts(); scheduleCloudSave(); chrome(); return true;
}
function scrubState(st) {
  const scrub = s => plain(s).slice(0, 120);
  (st.types || []).forEach(t => { t.id = scrub(t.id); t.name = scrub(t.name); t.color = cssColor(t.color); t.beamColor = cssColor(t.beamColor || t.color); });
  (st.runs || []).forEach(r => { r.code = scrub(r.code); r.label = scrub(r.label); (r.bay || []).forEach(b => { if (b && b.name != null) b.name = scrub(b.name); }); });
  (st.areas || []).forEach(a => { a.name = scrub(a.name); a.loc = scrub(a.loc || ''); });
  (st.equip || []).forEach(e => { e.name = scrub(e.name); e.kind = scrub(e.kind); });
  (st.conts || []).forEach(c => { c.name = scrub(c.name); c.status = scrub(c.status || ''); c.po = scrub(c.po || ''); c.eta = scrub(c.eta || ''); });
  if (st.skus && typeof st.skus === 'object') Object.keys(st.skus).forEach(k => { const s = st.skus[k]; if (!s || typeof s !== 'object') return; if (s.desc != null) s.desc = scrub(s.desc); });
  return st;
}
function setState(json) {
  const st = scrubState(JSON.parse(json)), keep = sel ? { kind: sel.kind, id: sel.obj.id, s: sel.s } : null;
  [runs, areas, equip, conts].forEach(list => list.forEach(o => { if (o.g) { clearGroup(o.g); o.g.parent && o.g.parent.remove(o.g); o.g = null; } }));
  types = st.types; runs = st.runs; areas = st.areas; equip = st.equip; conts = st.conts; nextId = st.nextId; skus = st.skus || {}; { const cf = st.cfg || {}; MIN_AISLE = cf.minAisle || 8; CLEAR = cf.clear || CLEAR0; fcFillPct = cf.fill || 85; } dirtyPacks(); refreshSkuList(); moveMode(false);
  sel = null; if (keep) { const o = byId(LISTS[keep.kind](), keep.id); if (o && !o.removed && !o.received && !(keep.kind === 'bay' && keep.s >= o.bays)) sel = { kind: keep.kind, obj: o, s: keep.s }; }
  buildAll(); forecast(); lastLost = lostTotal(); refreshSel(); search($('q').value); render();
}
function undo() { if (!undoStack.length) return; const prev = undoStack.pop(), d = describe(JSON.parse(committed), JSON.parse(prev)); log.unshift({ t: new Date(), s: 'Undo → ' + (d.join('; ') || 'no change') }); committed = prev; setState(prev); }

// ---------------------------------------------------------------- panel
const panel = $('panelBody');
const cssColor = c => { const s = String(c == null ? '' : c).trim(); if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s; if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(s)) return s; return '#888888'; };
const swatch = c => '<span class="sw" style="background:' + cssColor(c) + '"></span>';
const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
const numIn = (f, v, step, min, max) => '<input type="number" data-f="' + f + '" step="' + step + '" min="' + min + '" max="' + max + '" value="' + v + '">';
function chrome() {
  $('undo').disabled = !undoStack.length; $('undo').textContent = 'Undo' + (undoStack.length ? ' (' + undoStack.length + ')' : '');
  const lost = lostTotal(); let lvl = 0; runs.forEach(r => { lvl += r.unplaced ? r.unplaced.boxes : 0; });
  const cloudLabel = cloudStatus === 'saving' || cloudStatus === 'pending' ? cloudMsg : cloudStatus === 'saved' ? cloudMsg : cloudStatus === 'ready' ? cloudMsg : cloudStatus === 'loading' ? 'Loading saved layout…' : cloudStatus === 'offline' ? (cloudMsg || 'Cloud offline') : cloudStatus === 'conflict' || cloudStatus === 'error' || cloudStatus === 'auth' ? cloudMsg : '';
  $('status').innerHTML = runs.filter(r => !r.removed).length + ' racks · ' + areas.filter(a => !a.removed).length + ' areas · ' + (undoStack.length ? undoStack.length + ' edit' + (undoStack.length > 1 ? 's' : '') + ' in undo' : 'no local undo') + (cloudLabel ? ' · ' + esc(cloudLabel) : '') + (lost + lvl ? ' · <b class="bad">' + fmt(lost + lvl) + ' boxes without a home</b>' : ''); // cloudLabel always via esc()
  ['racks', 'areas', 'equip', 'conts', 'skus', 'more'].forEach(k => $('tab-' + k).classList.toggle('on', tab === k));
}
function stockCard() {
  if (!clicked) return '';
  let p, loc, units, kind, sz, extra = '';
  if (clicked.src === 'pack') {
    const c = byId(conts, clicked.cont); if (!c) return ''; const q = contPack(c).boxes[clicked.i]; if (!q) return ''; const it = contPack(c).items[q[0]];
    return '<div class="sec">Clicked carton</div><div class="card"><b>' + esc(it[0]) + '</b><div class="dim">' + esc(it[2]) + '</div><div class="kv"><span>Container</span><b>' + esc(c.name) + ' · load #' + (clicked.i + 1) + '</b></div><div class="kv"><span>Model / finish</span><b>' + esc(it[1]) + ' / ' + esc(it[3]) + '</b></div><div class="kv"><span>Category</span><b>' + esc(PACK.cats[it[5]]) + '</b></div>' +
      '<div class="kv"><span>On this container</span><b>' + it[4] + ' pcs in ' + it[9] + (it[7] ? ' cartons (' + it[8] + '/ctn)' : ' boxes (size estimated)') + '</b></div><div class="kv"><span>Carton</span><b>' + [q[4] - q[1], q[6] - q[3], q[5] - q[2]].map(v => v.toFixed(1)).join(' × ') + ' cm</b></div><div class="kv"><span>From front wall</span><b>' + (q[1] / 100).toFixed(2) + ' m, ' + (q[2] / 100).toFixed(2) + ' m up</b></div></div>';
  }
  if (clicked.src === 'rack') { const b = RB[clicked.i]; p = PARTS[b[10]]; loc = LOCS[b[11]]; units = b[12]; kind = b[9]; sz = [b[6], b[7], b[8]]; const hit = bayIndex[BAYKEYS[b[0]]]; extra = '<div class="kv"><span>Bay code it follows</span><b>' + esc(BAYKEYS[b[0]]) + ' level ' + LETTERS[b[1]] + (hit ? '' : ' (no bay has this name)') + '</b></div>'; }
  else if (clicked.src === 'area') { const b = AB[clicked.i]; p = PARTS[b[8]]; loc = LOCS[b[9]]; units = b[10]; kind = b[7]; sz = [b[4], b[6], b[5]]; }
  else { const c = byId(conts, clicked.cont); if (!c) return ''; const b = D.yard[c.src].boxes[clicked.i]; p = PARTS[b[7]]; loc = LOCS[b[8]]; units = b[9]; kind = b[6]; sz = [b[3], b[5], b[4]]; }
  return '<div class="sec">Clicked stock</div><div class="card"><b>' + esc(p[0]) + '</b><div class="dim">' + esc(p[1] || '') + '</div><div class="kv"><span>Fishbowl location</span><b>' + esc(loc) + '</b></div>' + extra + '<div class="kv"><span>This box</span><b>' + fmt(units) + ' units · ' + KIND[kind] + '</b></div>' +
    (kind === 3 ? '' : '<div class="kv"><span>Size</span><b>' + sz.map(v => (v * 12).toFixed(1)).join(' × ') + ' in</b></div>') + '<div class="kv"><span>Part on hand / committed</span><b>' + fmt(p[2]) + ' / ' + fmt(p[3]) + '</b></div></div>';
}
const levelsHtml = lv => '<div class="lvs">' + lv.map((e, i) => '<div class="lv"><span class="ll">' + LETTERS[i] + '</span><input type="number" data-f="level" data-i="' + i + '" step="0.25" min="0" max="40" value="' + ft(e) + '">' + (lv.length > 1 ? '<button class="x" data-act="lvDel" data-i="' + i + '" title="Remove level ' + LETTERS[i] + '">×</button>' : '') + '</div>').join('') + '</div>';
const moveHtml = (o, turn) => '<div class="sec">Where it is</div><div class="row"><label class="fld sm">X (ft, north +)' + numIn('x', ft(o.x), 0.5, -400, 600) + '</label><label class="fld sm">Z (ft, east +)' + numIn('z', ft(o.z), 0.5, -400, 600) + '</label>' + (turn || '') + '</div>' +
  '<div class="row nudge"><span class="dim">Nudge</span><button data-act="n" data-dx="-1" data-dz="0">◀ X</button><button data-act="n" data-dx="1" data-dz="0">X ▶</button><button data-act="n" data-dx="0" data-dz="-1">◀ Z</button><button data-act="n" data-dx="0" data-dz="1">Z ▶</button><select id="step"><option value="0.5">0.5 ft</option><option value="1" selected>1 ft</option><option value="5">5 ft</option></select></div>' +
  '<div class="row mvrow"><button class="mv' + (dragOn ? ' on' : '') + '" data-act="moveMode">' + (dragOn ? '✓ Done moving' : '✥ Move by dragging') + '</button><span class="dim">' + (dragOn ? 'Drag it in the model. It locks again when you press Done or pick something else.' : 'Locked. A drag in the model only turns the view.') + '</span></div>';
function nameScheme(r) {     // guess aisle letter, first number and direction from the bay names a rack has now
  const named = r.bay.map((b, s) => ({ s, m: /^([A-Z]+):(\d+)$/.exec(b.name || '') })).filter(x => x.m);
  if (!named.length) return { aisle: '', start: 1, dir: 'asc', mixed: false };
  const pre = named[0].m[1], mixed = named.some(x => x.m[1] !== pre), a = +named[0].m[2], z = +named[named.length - 1].m[2], dir = z < a ? 'desc' : 'asc';
  return { aisle: pre, start: dir === 'asc' ? a - named[0].s : z - (r.bays - 1 - named[named.length - 1].s), dir, mixed };
}
function renderRacks() {
  const list = '<details class="fold"' + (sel && (sel.kind === 'run' || sel.kind === 'bay') ? '' : ' open') + '><summary>All racks (' + runs.filter(r => !r.removed).length + ')</summary><div class="row"><select id="addType">' + types.map(x => opt(x.id, x.name, '')).join('') + '</select><button class="pri" data-act="addRun">+ Add rack</button></div><div class="list">' +
    runs.filter(r => !r.removed).map(r => { const t = typeOf(r); return '<div class="li' + (sel && sel.obj === r ? ' on' : '') + '" data-act="pick" data-k="run" data-id="' + r.id + '">' + swatch(t.beamColor || t.color) + '<span class="c1">' + esc(r.code) + '</span><span class="c2">' + esc(t.name) + '</span><span class="c3">' + r.bays + ' bays</span><span class="c4">' + fmt(r.stock.units) + ' u</span></div>'; }).join('') +
    runs.filter(r => r.removed).map(r => '<div class="li off">' + swatch('#555') + '<span class="c1">' + esc(r.code) + '</span><span class="c2">removed</span><button data-act="restore" data-k="run" data-id="' + r.id + '">Restore</button></div>').join('') + '</div></details>';
  if (!sel || (sel.kind !== 'run' && sel.kind !== 'bay')) return '<div class="how"><b>Racks</b><ol><li><b>Click a rack</b> to edit the whole row: type, height, levels, position, size, and its aisle letter and bay numbers.</li><li><b>Click it again on one bay</b> to give that bay its own type, height and levels.</li><li>To move a rack, press <b>Move by dragging</b> first. Until then a drag only turns the view, so nothing moves by accident.</li><li>Stock follows the <b>bay names</b>. Rename bays to the codes Fishbowl uses and the stock moves there by itself.</li></ol></div>' + list + stockCard();
  const r = sel.obj;
  if (sel.kind === 'bay') {
    const s = sel.s, b = r.bay[s], t = bayType(r, s), H = bayH(r, s), lv = bayLv(r, s), own = b.type || b.height != null || b.levels;
    return '<div class="hd"><button data-act="toRun" title="Back to the whole rack">◀ ' + esc(r.code) + '</button><span class="bayno">Bay ' + (s + 1) + ' of ' + r.bays + '</span><button data-act="bayPrev"' + (s ? '' : ' disabled') + '>‹</button><button data-act="bayNext"' + (s < r.bays - 1 ? '' : ' disabled') + '>›</button></div>' +
      '<label class="fld">Bay name (the Fishbowl bay code, like B:03)<input type="text" data-f="bname" value="' + esc(b.name) + '" placeholder="no name: holds no stock"></label>' +
      '<label class="fld">Rack type for this bay<select data-f="btype">' + opt('', 'Same as the rack (' + typeOf(r).name + ')', b.type || '') + types.map(x => opt(x.id, x.name, b.type || '')).join('') + '</select></label>' +
      '<div class="sec">Height <span class="dim">' + (b.height != null ? 'set on this bay' : 'from the ' + (b.type ? 'bay type' : 'rack')) + '</span></div><div class="row"><label class="fld sm">Uprights (ft)' + numIn('height', ft(H), 0.5, 2, 40) + '</label><input type="range" data-f="heightR" min="4" max="30" step="0.5" value="' + H + '" aria-label="Upright height"></div>' +
      '<div class="sec">Levels <span class="dim">' + (b.levels ? 'set on this bay' : 'from the ' + (b.type ? 'bay type' : 'rack')) + ' · ft above the floor</span></div>' + levelsHtml(lv) +
      '<div class="row"><button data-act="lvAdd">+ Add level</button><button data-act="bayClear"' + (own ? '' : ' disabled') + '>Use the rack\'s settings</button></div><div class="row"><button data-act="bayCopy">Copy these settings to every bay of ' + esc(r.code) + '</button></div>' +
      '<div id="info"></div>' + stockCard() + list;
  }
  const t = typeOf(r), H = heightOf(r), lv = levelsOf(r), ns = nameScheme(r), ownBays = r.bay.filter(b => b.type || b.height != null || b.levels).length;
  return '<div class="hd">' + swatch(t.beamColor || t.color) + '<input class="ttl" data-f="label" value="' + esc(r.label) + '" aria-label="Rack name"><span class="code">' + esc(r.code) + '</span></div>' +
    '<label class="fld">Rack type<select data-f="type">' + types.map(x => opt(x.id, x.name, r.type)).join('') + '</select></label><label class="chk"><input type="checkbox" id="typeSize"> Also take the new type\'s bay width and depth</label>' +
    '<div class="sec">Bays and names <span class="dim">stock follows these</span></div><div class="chips">' + r.bay.map((b, s) => '<button class="chip' + (b.type || b.height != null || b.levels ? ' own' : '') + (b.name && dupNames[b.name] ? ' dup' : '') + '" data-act="bay" data-s="' + s + '" title="Edit this bay">' + esc(b.name || '–') + '</button>').join('') + '</div>' +
    '<div class="row"><label class="fld xs">Aisle<input type="text" id="nmAisle" value="' + esc(ns.aisle) + '" maxlength="3"></label><label class="fld xs">First bay no.<input type="number" id="nmStart" value="' + ns.start + '" min="0" max="99" step="1"></label><label class="fld sm">Numbers run<select id="nmDir">' + opt('asc', r.axis === 'z' ? 'west → east' : 'south → north', ns.dir) + opt('desc', r.axis === 'z' ? 'east → west' : 'north → south', ns.dir) + '</select></label><button class="pri" data-act="names">Rename</button></div>' +
    '<div class="dim">' + (ns.mixed ? 'This rack mixes aisle letters; rename it bay by bay. ' : '') + (ownBays ? ownBays + ' bay' + (ownBays > 1 ? 's have' : ' has') + ' own settings (outlined). ' : '') + 'Click a bay to edit just that bay.</div>' +
    '<div class="sec">Height</div><div class="row"><label class="fld sm">Uprights (ft)' + numIn('height', ft(H), 0.5, 2, 40) + '</label><input type="range" data-f="heightR" min="4" max="30" step="0.5" value="' + H + '" aria-label="Upright height"></div>' +
    '<div class="sec">Levels <span class="dim">ft above the floor</span></div>' + levelsHtml(lv) + '<div class="row"><button data-act="lvAdd">+ Add level</button><button data-act="useType">Use type defaults</button></div>' +
    moveHtml(r, '<button data-act="rot" title="Turn the rack 90 degrees">Turn 90°</button>') +
    '<div class="sec">Size</div><div class="row"><label class="fld sm">Bays' + numIn('bays', r.bays, 1, 1, 40) + '</label><label class="fld sm">Bay width (ft)' + numIn('pitch', ft(r.pitch), 0.25, 1, 20) + '</label><label class="fld sm">Depth (ft)' + numIn('depth', ft(r.depth), 0.25, 1, 20) + '</label></div>' +
    '<label class="chk"><input type="checkbox" id="recvOn"' + (r.noRecv ? '' : ' checked') + '> Incoming stock can go on this rack (used by the forecast)</label>' +
    '<div id="info"></div><div class="row acts"><button data-act="dup">Duplicate</button><button data-act="orig">Reset rack</button><button class="danger" data-act="remove">Remove rack</button></div>' + stockCard() + list;
}
function renderAreas() {
  const locNames = Object.keys(AB.reduce((m, b) => { m[LOCS[b[9]]] = 1; return m; }, {})).sort();
  const list = '<div class="row"><button class="pri" data-act="addArea">+ Add area</button><span class="dim">lands where the camera is looking</span></div><div class="list">' + areas.filter(a => !a.removed).map(a => '<div class="li' + (sel && sel.obj === a ? ' on' : '') + '" data-act="pick" data-k="area" data-id="' + a.id + '">' + swatch(a.flag ? '#f0a020' : '#f2c230') + '<span class="c1 wide">' + esc(a.name) + '</span><span class="c2">' + (a.flag ? 'not located yet' : a.loc && a.loc !== a.name ? 'holds ' + esc(a.loc) : '') + '</span><span class="c4">' + fmt(a.stock.units) + ' u</span></div>').join('') +
    areas.filter(a => a.removed).map(a => '<div class="li off">' + swatch('#555') + '<span class="c1 wide">' + esc(a.name) + '</span><span class="c2">removed</span><button data-act="restore" data-k="area" data-id="' + a.id + '">Restore</button></div>').join('') + '</div>';
  if (!sel || sel.kind !== 'area') return '<div class="how"><b>Areas that hold material</b><div class="dim">Floor areas are the yellow outlines. Click one to move, resize or rename it, or choose which Fishbowl location it holds. Its stock moves with it.</div></div>' + list + stockCard();
  const a = sel.obj;
  return '<div class="hd">' + swatch('#f2c230') + '<input class="ttl" data-f="name" value="' + esc(a.name) + '" aria-label="Area name"></div>' +
    '<label class="fld">Holds Fishbowl location<select data-f="loc">' + opt('', '(nothing)', a.loc) + locNames.concat(a.loc && locNames.indexOf(a.loc) < 0 ? [a.loc] : []).map(n => opt(n, n, a.loc)).join('') + '</select></label>' + moveHtml(a) +
    '<div class="sec">Size</div><div class="row"><label class="fld sm">Width along X (ft)' + numIn('w', ft(a.w), 0.5, 1, 300) + '</label><label class="fld sm">Depth along Z (ft)' + numIn('d', ft(a.d), 0.5, 1, 300) + '</label></div>' +
    '<div id="info"></div><div class="row acts"><button data-act="dup">Duplicate</button><button class="danger" data-act="remove">Remove area</button></div>' + stockCard() + '<div class="sec">All areas</div>' + list;
}
function renderEquip() {
  const list = '<div class="row"><select id="addKind">' + Object.keys(EQ).map(k => opt(k, EQ[k].name, '')).join('') + '</select><button class="pri" data-act="addEquip">+ Add</button></div><div class="list">' + equip.filter(e => !e.removed).map(e => '<div class="li' + (sel && sel.obj === e ? ' on' : '') + '" data-act="pick" data-k="equip" data-id="' + e.id + '"><span class="c1 wide">' + esc(e.name) + '</span><span class="c2">' + esc((EQ[e.kind] || {}).name || '') + '</span></div>').join('') + '</div>';
  if (!sel || sel.kind !== 'equip') return '<div class="how"><b>Equipment</b><div class="dim">Forklifts, stackers, ladders, lockers, tool stations and the rest. The starting set is what the photos show, parked along the dock wall as placeholders. Pick one, press Move by dragging, and drag it to where it lives. Or add more.</div></div>' + list;
  const e = sel.obj;
  return '<div class="hd"><input class="ttl" data-f="name" value="' + esc(e.name) + '" aria-label="Equipment name"></div><label class="fld">Kind<select data-f="kind">' + Object.keys(EQ).map(k => opt(k, EQ[k].name, e.kind)).join('') + '</select></label>' +
    moveHtml(e, '<label class="fld xs">Facing (°)' + numIn('rot', e.rot, 15, -360, 360) + '</label>') + '<div class="row"><button data-act="turn" data-by="-90">⟲ 90°</button><button data-act="turn" data-by="-15">⟲ 15°</button><button data-act="turn" data-by="15">15° ⟳</button><button data-act="turn" data-by="90">90° ⟳</button></div>' +
    '<div class="row acts"><button data-act="dup">Duplicate</button><button class="danger" data-act="remove">Remove</button></div><div class="sec">All equipment</div>' + list;
}
function renderMore() {
  const tf = t => t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), lost = Object.keys(homeless).sort();
  return '<div class="sec first">View</div><div class="row"><label class="fld sm">Building walls<select id="wallMode">' + opt('cut', 'Cutaway (see inside)', view.walls) + opt('full', 'Full walls and roof', view.walls) + opt('low', 'Outline only', view.walls) + '</select></label><label class="chk"><input type="checkbox" id="shadowOn"' + (view.shadows ? ' checked' : '') + '> Shadows</label></div>' +
    '<div class="sec">Checks</div><div class="row"><label class="fld sm">Narrowest aisle before a warning (ft)<input type="number" id="cfgAisle" min="2" max="20" step="0.5" value="' + MIN_AISLE + '"></label><label class="fld sm">Clear height under the roof (ft)<input type="number" id="cfgClear" min="8" max="60" step="0.5" value="' + CLEAR + '"></label></div><div class="dim">If a rack is right but still warns, open it and press "This is how it is built".</div>' +
    '<div class="sec">Save your layout</div><div class="dim">' + (cloudMsg ? esc(cloudMsg) : 'Edits autosave to the shared cloud layout for everyone with access.') + '</div><div class="row"><button class="pri" data-act="cloudSave">Save now</button><button data-act="cloudReload">Reload from cloud</button><button class="danger" data-act="resetAll">Reset</button></div><div class="row"><button data-act="save">Download layout file</button><button data-act="load">Load a layout file</button></div><div class="dim">Cloud save keeps racks, areas, equipment, containers, received marks and SKU sizes after refresh. File download/load is a backup.</div>' +
    '<div class="sec">Stock without a home <span class="dim">' + lost.length + '</span></div>' + (lost.length ? '<div class="list">' + lost.slice(0, 60).map(k => '<div class="lg"><b>' + esc(k) + '</b> · ' + fmt(homeless[k].boxes) + ' boxes · ' + fmt(homeless[k].units) + ' units</div>').join('') + '</div><div class="dim">Give a bay or an area this name and the stock appears there.</div>' : '<div class="dim">Every Fishbowl location with stock has a bay or an area.</div>') +
    '<div class="sec">Rack types</div><div class="list">' + types.map(t => {
      const used = runs.filter(r => !r.removed && (r.type === t.id || r.bay.some(b => b.type === t.id))).length, open = openType === t.id;
      return '<div class="ty' + (open ? ' on' : '') + '"><div class="li" data-act="openType" data-id="' + esc(t.id) + '">' + swatch(t.beamColor || t.color) + '<span class="c1 wide">' + esc(t.name) + '</span><span class="c3">' + ft(t.height) + ' ft · ' + t.levels.length + ' levels</span><span class="c4">' + used + ' racks</span></div>' +
        (open ? '<div class="tyb"><label class="fld">Name<input type="text" data-tf="name" value="' + esc(t.name) + '"></label><div class="row"><label class="fld xs">Uprights<input type="color" data-tf="color" value="' + esc(t.color) + '"></label><label class="fld xs">Beams<input type="color" data-tf="beamColor" value="' + esc(t.beamColor || t.color) + '"></label><label class="fld sm">Build<select data-tf="structure">' + opt('beam', 'Uprights and beams', t.hangers ? 'x' : t.structure) + opt('hang', 'Beams with trim hangers', t.hangers ? 'hang' : '') + opt('cantilever', 'Cantilever arms', t.structure) + '</select></label></div>' +
          '<div class="row"><label class="fld sm">Default height (ft)<input type="number" data-tf="height" step="0.5" min="2" max="40" value="' + ft(t.height) + '"></label><label class="fld sm">Upright size (ft)<input type="number" data-tf="upright" step="0.05" min="0.1" max="1" value="' + ft(t.upright) + '"></label></div>' +
          '<label class="fld">Default levels (ft above the floor, comma separated)<input type="text" data-tf="levels" value="' + t.levels.map(ft).join(', ') + '"></label><div class="row acts"><button data-act="dupType">Copy as new type</button><button class="danger" data-act="delType"' + (used || types.length < 2 ? ' disabled title="In use"' : '') + '>Delete type</button></div></div>' : '') + '</div>';
    }).join('') + '</div>' +
    '<div class="sec">Changes <span class="dim">' + log.length + '</span></div><div class="dim">On the real site each line is saved with the name of whoever is logged in.</div><div class="list">' + (log.length ? log.slice(0, 150).map(l => '<div class="lg"><span class="tm">' + esc(tf(l.t)) + ' · You</span> ' + String(l.s || '') + '</div>').join('') : '<div class="dim">No changes yet.</div>') + '</div>';
}
function readouts() {
  const e = $('info'); if (!e || !sel) return; const o = sel.obj;
  if (sel.kind === 'run') { const over = o.height != null || o.levels != null, ws = warningsFor(o), fr = FC && FC.byRun[o.id];
    e.innerHTML = kv('Footprint', ft(lenOf(o)) + ' × ' + ft(o.depth) + ' ft') + kv('Stock on this rack', fmt(o.stock.boxes) + ' boxes · ' + fmt(o.stock.units) + ' units') + (fr ? kv('If received', '+' + fmt(fr.cartons) + ' boxes · ' + fmt(fr.beam) + ' ft of beam') : '') + ws.map(w => '<div class="msg ' + ({ ok:1, warn:1, bad:1, note:1 }[w[0]] ? w[0] : 'note') + '">' + esc(w[1]) + '</div>').join('') +
      (ws.some(w => w[2]) ? '<div class="row"><button data-act="asBuilt">This is how it is built: stop these warnings</button></div>' : o.ok ? '<div class="row"><button data-act="asBuilt">Turn the fit warnings back on</button></div>' : '');
    const rb = panel.querySelector('[data-act="useType"]'); if (rb) rb.disabled = !over; }
  else if (sel.kind === 'bay') { let n = 0, u = 0, lost = 0; (o.idx || []).forEach(i => { if (bayIndex[BAYKEYS[RB[i][0]]].s !== sel.s) return; if (rackBox(i)) { n++; u += RB[i][12]; } else lost++; });
    const bb = o.bay[sel.s], nm = bb.name, ki = nm ? BAYKEYS.indexOf(nm) : -1, need = ki >= 0 ? needLv[ki] || 0 : 0, lv = bayLv(o, sel.s), tb = o.ok ? 0 : ((o.tightBy || {})[sel.s] || 0) - ((tightBy0[o.id] || {})[sel.s] || 0), fr = FC && FC.byRun[o.id];
    const how = ki >= 0 && lv.length > placedN[ki] ? 'Letters ' + LETTERS[lv.length - 1] + ' to ' + LETTERS[need - 1] + ' share the top level.' : 'Stock is squeezed onto the levels drawn.';
    e.innerHTML = kv('Stock in this bay', fmt(n) + ' boxes · ' + fmt(u) + ' units') + (lost ? '<div class="msg bad">' + lost + ' boxes are on a level this bay does not have.</div>' : '') + (tb > 0 ? '<div class="msg warn">' + tb + ' more boxes here do not fit under the level above or the ' + CLEAR + ' ft ceiling. Box sizes in the model are estimates.</div>' : '') +
      (need > lv.length ? (bb.ok ? '<div class="msg note">Fishbowl uses levels A to ' + LETTERS[need - 1] + ' in this bay and it has ' + lv.length + '. ' + how + ' Marked as built.</div><div class="row"><button data-act="bayOk">Turn this warning back on</button></div>'
        : '<div class="msg warn">Fishbowl uses levels A to ' + LETTERS[need - 1] + ' in this bay, but it has ' + lv.length + '. ' + how + ' Give the bay ' + need + ' levels and each box goes to its own letter.</div><div class="row"><button data-act="bayOk">It really has ' + lv.length + ' level' + (lv.length > 1 ? 's' : '') + ': stop this warning</button></div>') : '') +
      (nm && dupNames[nm] ? '<div class="msg bad">Another bay is also called ' + esc(nm) + '.</div>' : '') + (fr ? '<div class="dim">The forecast puts ' + fmt(fr.cartons) + ' incoming boxes on this rack.</div>' : ''); }
  else if (sel.kind === 'area') e.innerHTML = '<div class="kv"><span>Stock here</span><b>' + fmt(o.stock.boxes) + ' boxes · ' + fmt(o.stock.units) + ' units</b></div>' + (o.flag ? '<div class="msg warn">Nobody has said where this is yet. Drag it into the building.</div>' : '');
  const hn = panel.querySelector('[data-f="height"]'), hr = panel.querySelector('[data-f="heightR"]');
  if (hn && hr && (sel.kind === 'run' || sel.kind === 'bay')) { const H = sel.kind === 'run' ? heightOf(o) : bayH(o, sel.s); if (document.activeElement !== hn) hn.value = ft(H); if (document.activeElement !== hr) hr.value = H; }
  const xi = panel.querySelector('[data-f="x"]'), zi = panel.querySelector('[data-f="z"]'); if (xi && document.activeElement !== xi) xi.value = ft(o.x); if (zi && document.activeElement !== zi) zi.value = ft(o.z);
}
let rendering = false;
function render() {
  rendering = true;
  try { panel.innerHTML = tab === 'racks' ? renderRacks() : tab === 'areas' ? renderAreas() : tab === 'equip' ? renderEquip() : tab === 'conts' ? renderConts() : tab === 'skus' ? renderSkus() : renderMore(); } finally { rendering = false; }
  readouts(); chrome(); invalidate(false);
}

// ===== SKU box sizes, containers on order, receiving, and the "if received" forecast into open rack space =====
const IN3 = 1.6387064e-5, POS_FT = 4.5;          // one cubic inch in cubic metres; beam length of one pallet position (ft)
const kv = (a, b) => '<div class="kv"><span>' + a + '</span><b>' + b + '</b></div>';
const bar = (v, col) => '<div class="pb"><div style="width:' + Math.max(0, Math.min(100, v || 0)).toFixed(1) + '%;background:' + col + '"></div></div>';

// ---------------------------------------------------------------- SKU sizes
// SKU0 is what the model starts with: load-planner cartons first, then Fishbowl boxes that hold exactly one unit. "skus" holds only what the user changed or added.
const SKU0 = {};
PACK.list.forEach(P => {
  const first = {}; P.boxes.forEach(b => { if (!first[b[0]]) first[b[0]] = [b[4] - b[1], b[5] - b[2], b[6] - b[3]]; });
  P.items.forEach((it, i) => { if (SKU0[it[0]] || !first[i]) return; const d = first[i].sort((a, b) => b - a).map(v => r2(v / 2.54)); SKU0[it[0]] = { l: d[0], w: d[1], h: d[2], boxes: 1, pcs: it[8] || 1, desc: it[2], model: it[1], color: it[3], cat: it[5], src: 'load planner' }; });
});
const fbSize = (pi, kind, u, a, b, c) => { const p = PARTS[pi]; if (kind !== 0 || u !== 1 || SKU0[p[0]]) return; const d = [a, b, c].sort((x, y) => y - x).map(v => r2(v * 12)); SKU0[p[0]] = { l: d[0], w: d[1], h: d[2], boxes: 1, pcs: 1, desc: p[1] || '', model: '', color: '', cat: 8, src: 'Fishbowl model' }; };
RB.forEach(b => fbSize(b[10], b[9], b[12], b[6], b[7], b[8])); AB.forEach(b => fbSize(b[8], b[7], b[10], b[4], b[5], b[6]));
PARTS.forEach(p => { if (!SKU0[p[0]]) SKU0[p[0]] = { l: 0, w: 0, h: 0, boxes: 1, pcs: 1, desc: p[1] || '', model: '', color: '', cat: 8, src: 'no size yet' }; });
const skuEff = k => { const b = SKU0[k], e = skus[k]; return b || e ? Object.assign({ l: 0, w: 0, h: 0, boxes: 1, pcs: 1, desc: '', model: '', color: '', cat: 8, src: 'added here' }, b, e) : null; };
const skuOk = s => !!s && s.l > 0 && s.w > 0 && s.h > 0;
const skuCbm = s => s.l * s.w * s.h * IN3;                       // one box
const skuUnitCbm = s => skuCbm(s) * s.boxes / s.pcs;             // one unit
const boxesFor = (s, qty) => Math.ceil(qty * s.boxes / s.pcs - 1e-9);
const skuDL = document.createElement('datalist'); skuDL.id = 'skuList'; document.body.appendChild(skuDL);
function refreshSkuList() { skuDL.innerHTML = Object.keys(Object.assign({}, SKU0, skus)).sort().map(k => '<option value="' + esc(k) + '">').join(''); }
refreshSkuList();

// ---------------------------------------------------------------- containers on order: packed here with a simple wall / column / stack rule (for display and a fill estimate)
function packOrder(lines) {
  const K = PACK.container, items = [], list = []; let cbm = 0, nosize = 0;
  lines.forEach(ln => {
    const s = skuEff(ln.sku) || { l: 0, w: 0, h: 0, boxes: 1, pcs: 1 }, ok = skuOk(s), n = ok ? boxesFor(s, ln.qty) : 0, c1 = ok ? skuCbm(s) : 0, i = items.length;
    items.push([ln.sku, s.model || '', s.desc || '', s.color || '', ln.qty, s.cat == null ? 8 : s.cat, r2(c1 * PACK.dens), 1, s.pcs || 1, n, c1, ok ? '' : 'no size']);
    if (!ok) { nosize++; return; }
    const d = [s.l, s.w, s.h].map(v => v * 2.54).sort((a, b) => b - a); cbm += n * c1;      // boxes lie flat, long side along the container
    for (let k = 0; k < n; k++) list.push({ i, x: d[0], z: d[1], y: d[2] });
  });
  const boxes = [], R1 = v => Math.round(v * 10) / 10, big = list.filter(c => c.x > K.L || c.z > K.W || c.y > K.H).length;
  const left = list.filter(c => c.x <= K.L && c.z <= K.W && c.y <= K.H).sort((a, b) => b.x - a.x || b.z - a.z || b.y - a.y);
  const place = (c, xx, y, z, edge) => { boxes.push(edge ? [c.i, R1(xx), R1(y), R1(z), R1(xx + c.x), R1(y + c.z), R1(z + c.y)] : [c.i, R1(xx), R1(y), R1(z), R1(xx + c.x), R1(y + c.y), R1(z + c.z)]); };
  let x0 = 0;
  for (;;) {
    const fi = left.findIndex(c => c.x <= K.L - x0 + 0.01); if (fi < 0) break;
    const t = left[fi].x; let z = 0;                                   // one wall of thickness t across the container
    for (;;) {
      let edge = false, bi = left.findIndex(c => c.x <= t + 0.01 && c.z <= K.W - z + 0.01);
      if (bi < 0) { edge = true; bi = left.findIndex(c => c.x <= t + 0.01 && c.y <= K.W - z + 0.01 && c.z <= K.H + 0.01); if (bi < 0) break; }      // nothing fits flat in what is left of the width: stand boxes on edge there
      const bz = edge ? left[bi].y : left[bi].z; let xx = x0;
      for (;;) {                                                        // columns one behind the other inside the wall
        const ci = left.findIndex(c => c.x <= x0 + t - xx + 0.01 && (edge ? c.y <= bz + 0.01 && c.z <= K.H + 0.01 : c.z <= bz + 0.01)); if (ci < 0) break;
        const cb = left.splice(ci, 1)[0], cw = edge ? cb.y : cb.z; let y = edge ? cb.z : cb.y; place(cb, xx, 0, z, edge);
        for (let k = 0; k < left.length;) { const c = left[k], w = edge ? c.y : c.z, h = edge ? c.z : c.y; if (c.x <= cb.x + 0.01 && w <= cw + 0.01 && y + h <= K.H + 0.01) { place(c, xx, y, z, edge); y += h; left.splice(k, 1); } else k++; }
        xx += cb.x;
      }
      z += bz;
    }
    x0 += t;
  }
  return { no: 0, items, boxes, cbm: r2(cbm), kg: Math.round(cbm * PACK.dens), notfit: left.length + big, nosize, used: x0 };
}
const packCache = {};
const dirtyPacks = () => { Object.keys(packCache).forEach(k => { delete packCache[k]; }); };
function contPack(c) { return c.kind === 'incoming' ? PACK.list[c.src] : packCache[c.id] || (packCache[c.id] = packOrder(c.lines || [])); }
const isIn = c => c.kind !== 'yard';
const pending = () => conts.filter(c => isIn(c) && !c.removed && !c.received);
const contEdited = c => contPack(c).items.filter(it => skus[it[0]]).length;
// the boxes a container brings, grouped by SKU, at the sizes on the SKUs tab: [{ sku, n, dm:[a,b,c] ft longest first, cbm per box }]
function contCartons(c) {
  const out = [];
  contPack(c).items.forEach(it => {
    const s = skuEff(it[0]); if (!skuOk(s)) return;
    const mine = c.kind === 'order' || !!skus[it[0]], n = mine ? boxesFor(s, it[4]) : it[9]; if (!n) return;
    out.push({ sku: it[0], n, dm: [s.l / 12, s.w / 12, s.h / 12].sort((a, b) => b - a), cbm: mine ? skuCbm(s) : it[10] });
  });
  return out;
}
const contCbm = c => contCartons(c).reduce((s, g) => s + g.n * g.cbm, 0);
const yardUnits = c => D.yard[c.src].boxes.reduce((s, b) => s + b[9], 0);

// ---------------------------------------------------------------- "if received": open rack space, and where the incoming boxes would go
const fcRoot = new THREE.Group(); sc.add(fcRoot);
let FC = null;
const fcVis = () => { fcRoot.visible = view.fc && view.walls !== 'full'; invalidate(); };
// every stretch of beam (or run of cantilever arms) that can take stock, with the stock already on it
function rackGaps() {
  const occ = {};
  runs.forEach(r => { if (r.removed) return; (r.idx || []).forEach(i => { if (RB[i][9] === 2) return; const w = rackBox(i); if (!w) return; const c = r.axis === 'z' ? w[2] - r.z : w[0] - r.x, h = (r.axis === 'z' ? w[5] : w[3]) / 2, k = r.id + '|' + w[7] + '|' + w[6]; (occ[k] = occ[k] || []).push([c - h, c + h]); }); });
  const gaps = [], frac = fcFillPct / 100; let total = 0;
  runs.forEach((r, ri) => {
    if (r.removed || r.status === 'unmapped' || r.noRecv) return;
    for (let s = 0; s < r.bays;) {
      const t = bayType(r, s), lv = bayLv(r, s), cant = t.structure === 'cantilever'; let e = s + 1;
      if (cant) while (e < r.bays && bayType(r, e).structure === 'cantilever' && bayLv(r, e).join() === lv.join()) e++;      // long stock can span the arms of a whole cantilever run
      let H = 1e9; for (let k = s; k < e; k++) H = Math.min(H, bayH(r, k));
      const m = cant ? 0.2 : t.upright / 2 + 0.08, a0 = s * r.pitch + m, a1 = e * r.pitch - m;
      lv.forEach((y, li) => {
        if (y > H + 0.01) return;
        const next = lv[li + 1], base = y + (cant && y > 0.05 ? 0.33 : 0), top = next != null && next <= H + 0.01 ? next - (cant ? 0.05 : 0.4) : base + Math.min(CLEAR - 1.5 - base, H >= 12 ? 5 : 2), h = top - base;
        if (h < 0.4) return;
        let iv = []; for (let k = s; k < e; k++) { const o = occ[r.id + '|' + k + '|' + li]; if (o) iv = iv.concat(o); }
        iv.sort((p, q) => p[0] - q[0]); let cur = a0; total += a1 - a0;
        const free = []; iv.forEach(v => { if (v[0] - 0.15 > cur) free.push([cur, v[0] - 0.15]); cur = Math.max(cur, v[1] + 0.15); }); if (a1 > cur) free.push([cur, a1]);
        free.forEach(f => { const w = Math.min(f[1], a1) - f[0]; if (w >= 1) gaps.push({ r, ri, li, a: f[0], w, cap: w * frac, w0: w, fresh: true, d: r.depth, y: base, h }); });
      });
      s = e;
    }
  });
  gaps.sort((p, q) => p.ri - q.ri || p.a - q.a || p.li - q.li);
  return { gaps, total };
}
// how a box footprint a x b (ft) sits flat in an open space: whichever way round gets more boxes per foot of beam
function fitFlat(g, a, b, lim) {
  let best = null;
  [[a, b], [b, a]].forEach(o => { const al = o[0], dp = o[1]; if (al > lim + 1e-6 || dp > g.d + 0.5) return; const nd = Math.max(1, Math.floor((g.d + 0.05) / dp)), sc = nd / al; if (!best || sc > best.sc) best = { al, dp, nd, sc }; });
  return best;
}
function forecast() {
  clearGroup(fcRoot); FC = null; fcVis();
  const list = pending().filter(c => c.fc); if (!list.length) return;
  const G = rackGaps(), gaps = G.gaps, frac = fcFillPct / 100, geo = new Geo(), edges = [], cc = new THREE.Color(), white = new THREE.Color(0xffffff); geo.C = [];
  const res = { total: G.total, open0: 0, pos0: 0, pos1: 0, per: [], byRun: {}, cartons: 0, placed: 0, cbm: 0, cbmPlaced: 0, beam: 0, nosize: 0 };
  gaps.forEach(g => { res.open0 += g.w0; res.pos0 += Math.floor(g.w0 / POS_FT); });
  list.forEach(c => {
    const pc = { id: c.id, name: c.name, cartons: 0, placed: 0, cbm: 0, cbmPlaced: 0, beam: 0, miss: [] }, groups = {};
    cc.setHex(CSHELL[c.shell % CSHELL.length]).lerp(white, 0.45).convertSRGBToLinear(); res.nosize += contPack(c).nosize || 0;
    // boxes with the same footprint share stacks, whatever the SKU, the way mixed flat-pack is stacked on a pallet
    contCartons(c).forEach(gp => { pc.cartons += gp.n; pc.cbm += gp.n * gp.cbm; const k = gp.dm[0].toFixed(1) + 'x' + gp.dm[1].toFixed(1), g2 = groups[k] = groups[k] || { a: 0, b: 0, items: [] }; g2.a = Math.max(g2.a, gp.dm[0]); g2.b = Math.max(g2.b, gp.dm[1]); for (let q = 0; q < gp.n; q++) g2.items.push(gp); });
    Object.keys(groups).map(k => groups[k]).sort((p, q) => q.a - p.a || q.items.length - p.items.length).forEach(g2 => {
      const its = g2.items.sort((p, q) => q.dm[2] - p.dm[2]); let at = 0;                 // thick boxes at the bottom
      for (let gi = 0; gi < gaps.length && at < its.length; gi++) {
        const g = gaps[gi], lim = g.fresh ? g.w : Math.min(g.w, g.cap); if (lim < g2.b || its[at].dm[2] > g.h) continue;      // a long box may take a whole empty bay; otherwise stay inside the fill allowance
        const f = fitFlat(g, g2.a, g2.b, lim); if (!f) continue;
        const r = g.r, cols = Math.max(1, Math.floor(Math.min(g.w, g.cap) / f.al + 1e-6)), dOff = Math.max(0, (g.d - f.nd * f.dp) / 2), sx = (r.axis === 'z' ? f.dp : f.al) - 0.04, sz = (r.axis === 'z' ? f.al : f.dp) - 0.04, br = res.byRun[r.id] = res.byRun[r.id] || { cartons: 0, beam: 0 }; let nc = 0;
        for (let col = 0; col < cols && at < its.length; col++) { nc++;
          for (let di = 0; di < f.nd && at < its.length; di++) { let y = 0;
            while (at < its.length && y + its[at].dm[2] <= g.h + 1e-6) { const it = its[at++], th = it.dm[2], p = toWorld(r, g.a + col * f.al + f.al / 2, dOff + di * f.dp + f.dp / 2), yy = g.y + y + th / 2; geo.box(p[0], yy, p[1], sx, th - 0.03, sz); for (let v = 0; v < 36; v++) geo.C.push(cc.r, cc.g, cc.b); edges.push([p[0], yy, p[1], sx, th - 0.03, sz]); y += th; pc.placed++; pc.cbmPlaced += it.cbm; br.cartons++; } } }
        const used = nc * f.al + 0.08; g.a += used; g.w -= used; g.cap -= used; g.fresh = false; pc.beam += used; br.beam += used;
      }
      if (at < its.length) { const m = {}, why = gaps.some(g => its[at].dm[2] <= g.h && fitFlat(g, g2.a, g2.b, g.w0)) ? 'no open space left' : 'too long or too big for any open rack space'; for (let q = at; q < its.length; q++) { const it = its[q], e = m[it.sku] = m[it.sku] || { sku: it.sku, n: 0, cbm: 0, why }; e.n++; e.cbm += it.cbm; } Object.keys(m).forEach(k => pc.miss.push(m[k])); }
    });
    res.per.push(pc); res.cartons += pc.cartons; res.placed += pc.placed; res.cbm += pc.cbm; res.cbmPlaced += pc.cbmPlaced; res.beam += pc.beam;
  });
  gaps.forEach(g => { res.pos1 += Math.floor((g.fresh ? g.w : Math.max(0, Math.min(g.w, g.cap / frac))) / POS_FT); });
  const m = geo.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.86 }), { layer: 'inv' }, 'recv');
  if (m) { m.userData.ownMat = true; m.visible = layerOn.inv; fcRoot.add(m); const e = new THREE.LineSegments(edgesGeo(edges), lineMat(0xd8f6ff, 0.95)); e.userData.layer = 'inv'; e.visible = layerOn.inv; fcRoot.add(e); }
  res.boxes = edges; FC = res; fcVis();
}
function fcCard() {
  const P = pending(); if (!P.length) return '';
  let h = '<div class="card fc"><b>If received: where would it go?</b><div class="dim">Tick containers to drop their boxes into the open rack space. They show in the model as pale boxes with light edges.</div>' +
    P.map(c => '<label class="chk"><input type="checkbox" data-fc="' + c.id + '"' + (c.fc ? ' checked' : '') + '> ' + esc(c.name) + ' <span class="dim">' + contCbm(c).toFixed(1) + ' CBM' + (c.eta ? ' · ETA ' + esc(c.eta) : '') + '</span></label>').join('') +
    '<div class="row"><button data-act="fcAll">Tick all</button><button data-act="fcNone"' + (P.some(c => c.fc) ? '' : ' disabled') + '>Clear</button><label class="fld xs" title="How full each open space may be packed. Lower it to leave room for pallets and reach.">Fill to %<input type="number" id="fcFill" min="40" max="100" step="5" value="' + fcFillPct + '"></label><label class="chk"><input type="checkbox" id="fcShow"' + (view.fc ? ' checked' : '') + '> Show in model</label></div>';
  if (FC) {
    const used0 = FC.total - FC.open0, miss = []; FC.per.forEach(p => p.miss.forEach(x => miss.push(x)));
    const mb = miss.reduce((s, x) => s + x.n, 0), mc = miss.reduce((s, x) => s + x.cbm, 0), top = Object.keys(FC.byRun).map(id => [byId(runs, +id), FC.byRun[id]]).filter(x => x[0]).sort((a, b) => b[1].beam - a[1].beam);
    h += kv('Boxes that find rack space', fmt(FC.placed) + ' of ' + fmt(FC.cartons) + ' · ' + FC.cbmPlaced.toFixed(1) + ' CBM') +
      kv('Open pallet positions', fmt(FC.pos0) + ' now → ' + fmt(FC.pos1) + ' after') + bar(FC.pos0 ? (FC.pos0 - FC.pos1) / FC.pos0 * 100 : 0, '#7fd4f0') +
      kv('Rack face in use', (FC.total ? used0 / FC.total * 100 : 0).toFixed(0) + '% now → ' + (FC.total ? (used0 + FC.beam) / FC.total * 100 : 0).toFixed(0) + '% after') +
      kv('Beam length taken', fmt(FC.beam) + ' of ' + fmt(FC.open0) + ' ft open') +
      FC.per.map(p => '<div class="kv"><span>' + esc(p.name) + '</span><b>' + fmt(p.placed) + ' of ' + fmt(p.cartons) + ' boxes · ≈ ' + Math.ceil(p.beam / POS_FT) + ' positions</b></div>').join('') +
      (top.length ? '<div class="dim">Goes to: ' + top.slice(0, 8).map(x => esc(x[0].code) + ' ' + fmt(x[1].cartons)).join(' · ') + (top.length > 8 ? ' · …' : '') + '</div>' : '') +
      (mb ? '<div class="msg bad">' + fmt(mb) + ' boxes (' + mc.toFixed(1) + ' CBM) find no rack space: ' + miss.slice(0, 5).map(x => esc(x.sku) + ' ×' + x.n + ' (' + x.why + ')').join('; ') + (miss.length > 5 ? '; and ' + (miss.length - 5) + ' more SKUs' : '') + '.</div>' : '<div class="msg ok">Everything ticked finds rack space.</div>') +
      (FC.nosize ? '<div class="msg warn">' + FC.nosize + ' lines have no box size yet and are left out.</div>' : '') +
      '<div class="dim">One pallet position = ' + POS_FT + ' ft of open beam. Boxes go in flat, same-size boxes stacked together, rack by rack in the order the containers are listed. It is an estimate of space, not a put-away plan.</div>';
  }
  return h + '</div>';
}

// ---------------------------------------------------------------- Containers tab
const shellSw = c => swatch('#' + CSHELL[c.shell % CSHELL.length].toString(16).padStart(6, '0'));
function contStats(c) {
  if (c.kind === 'yard') { const y = D.yard[c.src]; return kv('Fishbowl location', esc(y.loc)) + kv('Stock', y.boxes.length + ' boxes · ' + fmt(yardUnits(c)) + ' units') + kv('Floor length used', y.used + ' of ' + CL.toFixed(1) + ' ft') + '<div class="dim">Fishbowl says what is in this container, not how it is stacked. The stacking shown is only for display.</div>'; }
  const p = contPack(c), K = PACK.container, pcs = p.items.reduce((s, i) => s + i[4], 0), ctn = p.items.reduce((s, i) => s + i[9], 0), ed = c.kind === 'incoming' ? contEdited(c) : 0, f = FC && FC.per.find(x => x.id === c.id);
  return (c.kind === 'incoming' ? kv('Load plan', esc(PACK.order)) : '') + kv(esc(K.name), p.cbm.toFixed(1) + ' of ' + K.cbm + ' CBM · ' + (p.cbm / K.cbm * 100).toFixed(1) + '%') + bar(p.cbm / K.cbm * 100, p.cbm > K.cbm ? '#ff5a5a' : '#4ea1ff') +
    kv('Est. weight (' + PACK.dens + ' kg/CBM)', fmt(p.kg) + ' kg · ' + (p.kg / K.kg * 100).toFixed(1) + '%') + bar(p.kg / K.kg * 100, '#d9a45b') + kv('Contents', p.items.length + ' SKU lines · ' + fmt(pcs) + ' pcs · ' + fmt(ctn) + ' boxes') +
    (c.kind === 'order' ? (p.notfit ? '<div class="msg ' + (p.cbm / K.cbm > 0.73 ? 'bad' : 'warn') + '">' + fmt(p.notfit) + ' boxes are left over with the simple stacking used here. By volume the load is ' + (p.cbm / K.cbm * 100).toFixed(0) + '% of the container; the planner loads so far run 46 to 73%. ' + (p.cbm / K.cbm > 0.73 ? 'Move some lines to another container.' : 'It may still fit: check it in the load planner.') + '</div>' : '') + (p.nosize ? '<div class="msg warn">' + p.nosize + ' line' + (p.nosize > 1 ? 's have' : ' has') + ' no box size yet, so ' + (p.nosize > 1 ? 'they are' : 'it is') + ' not packed or counted. Set the size on the SKUs tab.</div>' : '') + (p.items.length ? '<div class="dim">Packed here with a simple stacking rule so you can see the fill. The load planner packs tighter.</div>' : '')
      : (p.notfit ? '<div class="msg bad">' + p.notfit + ' units did not fit in the load plan.</div>' : '') + (ed ? '<div class="msg warn">' + ed + ' SKU' + (ed > 1 ? 's' : '') + ' here ha' + (ed > 1 ? 've' : 's') + ' an edited size. The picture is still the load planner\'s. The forecast uses your sizes (' + contCbm(c).toFixed(1) + ' CBM). <button data-act="repack">Repack with my sizes</button></div>' : '')) +
    (f ? kv('If received', fmt(f.placed) + ' of ' + fmt(f.cartons) + ' boxes find rack space · ≈ ' + Math.ceil(f.beam / POS_FT) + ' positions') : '');
}
let itemQ = '';
function contItems(c) {
  const p = contPack(c), q = itemQ.trim().toUpperCase(), ord = c.kind === 'order', rows = p.items.map((it, i) => [it, i]).filter(x => !q || x[0][0].toUpperCase().indexOf(q) >= 0 || x[0][1].toUpperCase().indexOf(q) >= 0 || x[0][2].toUpperCase().indexOf(q) >= 0);
  if (!p.items.length) return '<div class="dim">Nothing on it yet. Add a SKU and a quantity above.</div>';
  return '<table class="items"><tr><th>SKU</th><th>Qty</th>' + (ord ? '<th>Boxes</th>' : '') + '<th>CBM</th>' + (ord ? '<th></th>' : '') + '</tr>' + rows.slice(0, 80).map(x => { const it = x[0];
    return '<tr><td data-act="item" data-sku="' + esc(it[0]) + '" title="Find this SKU">' + swatch('#' + packColor(it).toString(16).padStart(6, '0')) + esc(it[0]) + '<div class="dim">' + esc(it[2]).slice(0, 70) + '</div></td><td>' + (ord ? '<input type="number" data-lq="' + x[1] + '" min="1" step="1" value="' + it[4] + '" aria-label="Quantity">' : it[4]) + '</td>' + (ord ? '<td>' + (it[11] ? '<span class="bad">no size</span>' : it[9]) + '</td>' : '') + '<td>' + (it[10] * it[9]).toFixed(2) + '</td>' + (ord ? '<td><button class="x" data-act="lnDel" data-i="' + x[1] + '" title="Remove this line">×</button></td>' : '') + '</tr>'; }).join('') + '</table>' + (rows.length > 80 ? '<div class="dim">… ' + (rows.length - 80) + ' more lines. Type in the filter to narrow.</div>' : '');
}
function renderConts() {
  const row = c => '<div class="li' + (sel && sel.obj === c ? ' on' : '') + (c.hidden ? ' off' : '') + '" data-act="pick" data-k="cont" data-id="' + c.id + '">' + shellSw(c) + '<span class="c1 wide">' + esc(c.name) + '</span><span class="c2">' + esc(c.hidden ? 'hidden' : c.status + (c.eta ? ' · ' + c.eta : '')) + '</span><span class="c4">' + (c.kind === 'yard' ? fmt(yardUnits(c)) + ' u' : contPack(c).cbm.toFixed(0) + ' CBM') + '</span></div>';
  const live = conts.filter(c => !c.removed && !c.received), rec = conts.filter(c => c.received && !c.removed);
  const list = '<div class="sec">On site now <span class="dim">stock from Fishbowl</span></div><div class="list">' + live.filter(c => c.kind === 'yard').map(row).join('') + '</div>' +
    '<div class="sec">On order and incoming <span class="dim">' + live.filter(isIn).length + '</span></div><div class="row"><button class="pri" data-act="newOrder">+ New container on order</button></div><div class="list">' + live.filter(isIn).map(row).join('') + '</div>' +
    '<details class="fold"' + (rec.length ? '' : ' hidden') + '><summary>Received (' + rec.length + ')</summary><div class="dim">Received containers leave the model. Their stock comes back as rack stock with the next Fishbowl update.</div><div class="list">' + rec.map(c => '<div class="li off">' + shellSw(c) + '<span class="c1 wide">' + esc(c.name) + '</span><span class="c2">received ' + esc(c.recvAt || '') + '</span><button data-act="unrecv" data-id="' + c.id + '">Bring back</button></div>').join('') + '</div></details>';
  const pm = '<label class="fld sm">Colour boxes<select id="packMode">' + opt('cat', 'by category', view.packMode) + opt('sku', 'by SKU', view.packMode) + '</select></label>';
  if (!sel || sel.kind !== 'cont') return '<div class="how"><b>Containers</b><div class="dim">On site: the three on the ramp. On order and incoming: the packed loads from the planner plus any you build here. Tick them below to see the rack space they need. Mark one received when it is unloaded and it leaves the model.</div></div>' + fcCard() + list + '<div class="row" style="margin-top:10px">' + pm + '</div>' + stockCard();
  const c = sel.obj, n = contCount(c), shown = c.shown == null ? n : c.shown, inn = isIn(c), ord = c.kind === 'order';
  return '<div class="hd">' + shellSw(c) + '<input class="ttl" data-f="name" value="' + esc(c.name) + '" aria-label="Container name"></div>' +
    moveHtml(c, '<button data-act="turn" data-by="90">Turn 90°</button>') +
    '<label class="fld">Status<select data-f="status">' + (ord ? ['On order'] : []).concat(['Incoming', 'Arrived, in the truck court', 'On the ramp', 'At a dock door', 'Unloaded']).map(s => opt(s, s, c.status)).join('') + '</select></label>' +
    (ord ? '<div class="row"><label class="fld sm">Order or PO reference<input type="text" data-f="po" value="' + esc(c.po || '') + '" maxlength="40"></label><label class="fld sm">Expected (ETA)<input type="date" data-f="eta" value="' + esc(c.eta || '') + '"></label></div>' : '') +
    '<div id="info">' + contStats(c) + '</div>' +
    (inn ? '<label class="chk"><input type="checkbox" data-fc="' + c.id + '"' + (c.fc ? ' checked' : '') + '> Include in the "if received" forecast</label><div class="row"><button class="pri" data-act="recv" title="It is unloaded and will be in the next Fishbowl update">✓ Mark received</button><span class="dim">takes it out of the model</span></div>' : '') +
    '<div class="row"><button data-act="ramp">Put on the ramp</button><button data-act="look">Look inside</button><button data-act="close">' + (c.closed ? 'Open it up' : 'Close it up') + '</button></div>' +
    '<label class="fld">Load sequence: first <b id="seqv">' + shown + '</b> of ' + n + ' boxes<input type="range" data-f="seq" min="0" max="' + n + '" value="' + shown + '"></label>' +
    (ord ? '<div class="sec">What is on it <span class="dim">' + c.lines.length + ' lines</span></div><div class="row"><label class="fld sm">SKU<input type="text" id="lnSku" list="skuList" placeholder="type or pick a SKU" maxlength="40"></label><label class="fld xs">Qty<input type="number" id="lnQty" min="1" step="1" value="1"></label><button class="pri" data-act="lnAdd">Add</button></div>' +
      '<details class="fold paste"><summary>Paste many lines</summary><textarea id="lnText" rows="4" placeholder="SKU and quantity, one per line.&#10;Paste two columns straight from a spreadsheet."></textarea><div class="row"><button data-act="lnPaste">Add these lines</button></div></details>' : inn ? '<div class="sec">Packing list</div>' : '') +
    (inn ? '<div class="row">' + pm + '<label class="fld sm">Filter<input type="text" id="itemQ" value="' + esc(itemQ) + '" placeholder="SKU, model, words"></label></div><div id="items">' + contItems(c) + '</div>' : '') +
    '<div class="row acts"><button data-act="hide">' + (c.hidden ? 'Show' : 'Hide') + ' container</button>' + (ord ? '<button class="danger" data-act="remove">Delete this order</button>' : '') + '</div>' + stockCard() + list;
}

// ---------------------------------------------------------------- SKUs tab
let skuQ = '', openSku = null, skuOnly = false;
function skuTable() {
  const q = skuQ.trim().toUpperCase(), used = {}; pending().forEach(c => contPack(c).items.forEach(it => { used[it[0]] = 1; }));
  const keys = Object.keys(Object.assign({}, SKU0, skus)).filter(k => (!skuOnly || skus[k]) && (!q || k.toUpperCase().indexOf(q) >= 0 || (skuEff(k).desc || '').toUpperCase().indexOf(q) >= 0));
  keys.sort((a, b) => (skus[b] ? 1 : 0) - (skus[a] ? 1 : 0) || (used[b] ? 1 : 0) - (used[a] ? 1 : 0) || (a < b ? -1 : 1));
  return '<div class="dim">' + keys.length + ' SKUs' + (Object.keys(skus).length ? ' · ' + Object.keys(skus).length + ' edited (blue dot)' : '') + '. Click one to edit it.</div><table class="items"><tr><th>SKU</th><th>Box (in)</th><th>Boxes</th><th>CBM / unit</th></tr>' + keys.slice(0, 60).map(k => { const s = skuEff(k);
    return '<tr data-act="sku" data-sku="' + esc(k) + '"' + (k === openSku ? ' class="on"' : '') + '><td>' + (skus[k] ? '<b class="ed">●</b> ' : '') + esc(k) + '<div class="dim">' + esc(s.desc || '').slice(0, 60) + '</div></td><td>' + (skuOk(s) ? [s.l, s.w, s.h].map(v => +v.toFixed(1)).join(' × ') : '<span class="bad">not set</span>') + '</td><td>' + (s.boxes > 1 ? s.boxes + ' per unit' : s.pcs > 1 ? s.pcs + ' units in 1' : '1') + '</td><td>' + (skuOk(s) ? skuUnitCbm(s).toFixed(3) : '–') + '</td></tr>'; }).join('') + '</table>' + (keys.length > 60 ? '<div class="dim">… ' + (keys.length - 60) + ' more. Type in Find to narrow.</div>' : '');
}
const skuInfo = s => skuOk(s) ? kv('One box', skuCbm(s).toFixed(4) + ' CBM · ' + [s.l, s.w, s.h].map(v => (v / 12).toFixed(2)).join(' × ') + ' ft') + kv('One unit', s.boxes + ' box' + (s.boxes > 1 ? 'es' : '') + (s.pcs > 1 ? ' shared by ' + s.pcs + ' units' : '') + ' · ' + skuUnitCbm(s).toFixed(4) + ' CBM') + kv('A 40 ft high cube holds, by volume', '≈ ' + fmt(Math.floor(PACK.container.cbm / skuUnitCbm(s))) + ' units') : '<div class="msg warn">Set the box length, width and height.</div>';
function renderSkus() {
  let ed = ''; const s = openSku && skuEff(openSku);
  if (s) { const b = SKU0[openSku], ni = (f, v, step, max) => '<input type="number" data-sf="' + f + '" min="0" max="' + max + '" step="' + step + '" value="' + v + '">';
    ed = '<div class="card sku"><div class="hd"><b class="ttl">' + esc(openSku) + '</b><button data-act="skuClose">Close</button></div>' + (b ? '<div class="dim">' + esc(s.desc || '') + '</div>' : '<label class="fld">Description<input type="text" data-sf="desc" value="' + esc(s.desc || '') + '" maxlength="80"></label>') +
      '<div class="row"><label class="fld sm">Box length (in)' + ni('l', s.l, 0.25, 720) + '</label><label class="fld sm">Width (in)' + ni('w', s.w, 0.25, 720) + '</label><label class="fld sm">Height (in)' + ni('h', s.h, 0.25, 720) + '</label></div>' +
      '<div class="row"><label class="fld sm" title="Type a CBM here to scale the box to it">CBM per box' + ni('cbm', skuOk(s) ? +skuCbm(s).toFixed(4) : 0, 0.001, 80) + '</label><label class="fld sm" title="For a SKU that ships as several boxes">Boxes per unit' + ni('boxes', s.boxes, 1, 99) + '</label><label class="fld sm" title="For small parts packed several to a box">Units per box' + ni('pcs', s.pcs, 1, 9999) + '</label></div>' +
      '<div id="skuInfo">' + skuInfo(s) + '</div><div class="dim">Size it started with: ' + (b && skuOk(b) ? [b.l, b.w, b.h].join(' × ') + ' in (' + b.src + ')' : 'none') + '.</div>' +
      '<div class="row acts">' + (b ? '<button data-act="skuReset"' + (skus[openSku] ? '' : ' disabled') + '>Back to the original size</button>' : '<button class="danger" data-act="skuDel">Delete this SKU</button>') + '</div></div>'; }
  return '<div class="how"><b>SKU sizes</b><div class="dim">The box each SKU ships in. Changing L/W/H updates the 3D cartons in containers right away (incoming loads that use that SKU are repacked with your sizes) and autosaves with the layout. Rack stock still keeps Fishbowl box sizes. For a SKU that ships as several boxes, set one box size and boxes-per-unit.</div></div>' + ed +
    '<div class="row"><label class="fld sm">Find<input type="text" id="skuQ" value="' + esc(skuQ) + '" placeholder="SKU or words"></label><label class="chk"><input type="checkbox" id="skuOnly"' + (skuOnly ? ' checked' : '') + '> Edited only</label></div>' +
    '<div class="row"><label class="fld sm">A SKU that is not listed<input type="text" id="skuNew" placeholder="e.g. 160100" maxlength="40"></label><button class="pri" data-act="skuAdd">+ Add SKU</button></div><div id="skuTbl">' + skuTable() + '</div>' +
    '<div class="dim" style="margin-top:8px">Rack stock keeps Fishbowl sizes. Container cartons and the receiving forecast use the sizes you set here.</div>';
}

// ---------------------------------------------------------------- actions
function planChanged(c) { if (c) { delete packCache[c.id]; buildCont(c); } refreshSel(); invalidate(); commit(); if ($('q').value) search($('q').value); render(); }
function repackIncoming(c) {
  if (!c || c.kind !== 'incoming') return;
  const m = {}, lines = [];
  PACK.list[c.src].items.forEach(it => { if (m[it[0]]) m[it[0]].qty += it[4]; else lines.push(m[it[0]] = { sku: it[0], qty: it[4] }); });
  c.kind = 'order'; c.lines = lines; c.po = c.po || PACK.order; delete packCache[c.id];
}
function contHasSku(c, sku) {
  if (!c || !sku) return false;
  if (c.kind === 'order') return (c.lines || []).some(ln => ln.sku === sku);
  if (c.kind === 'incoming') return contPack(c).items.some(it => it[0] === sku);
  return false;
}
let skuLiveTimer = null;
function skuChanged(doCommit) {
  dirtyPacks();
  const k = openSku;
  conts.forEach(c => {
    if (c.removed || c.received) return;
    if (c.kind === 'order') { buildCont(c); return; }
    if (c.kind === 'incoming' && k && contHasSku(c, k) && skus[k] && skuOk(skuEff(k))) { repackIncoming(c); buildCont(c); }
  });
  refreshSel(); invalidate();
  if (doCommit !== false) commit();
}
function editSku(el, final) {
  const k = openSku, f = el.dataset.sf, s = skuEff(k); if (!s) return;
  if (f === 'desc') { skus[k] = Object.assign({}, skus[k], { desc: el.value.slice(0, 80) }); if (final) { commit(); render(); } return; }
  const v = parseFloat(el.value); if (!isFinite(v) || v < 0) { if (final) render(); return; }
  const e = { l: s.l, w: s.w, h: s.h, boxes: s.boxes, pcs: s.pcs }, b = SKU0[k];
  if (f === 'cbm') { if (!final || !(v > 0)) return; const cur = skuCbm(s); if (cur > 0) { const q = Math.cbrt(v / cur); e.l = r2(s.l * q); e.w = r2(s.w * q); e.h = r2(s.h * q); } else e.l = e.w = e.h = r2(Math.cbrt(v / IN3)); }
  else if (f === 'boxes' || f === 'pcs') e[f] = Math.max(1, Math.round(v)); else e[f] = r2(Math.min(v, 720));
  if (b && e.l === b.l && e.w === b.w && e.h === b.h && e.boxes === b.boxes && e.pcs === b.pcs) delete skus[k]; else skus[k] = Object.assign({}, skus[k], e);
  if (final) { if (skuLiveTimer) { clearTimeout(skuLiveTimer); skuLiveTimer = null; } skuChanged(true); render(); }
  else {
    const d = $('skuInfo'); if (d) d.innerHTML = skuInfo(skuEff(k));
    if (f !== 'cbm') { if (skuLiveTimer) clearTimeout(skuLiveTimer); skuLiveTimer = setTimeout(() => { skuLiveTimer = null; skuChanged(false); }, 140); }
  }
}
function addLines(c, pairs) {
  let n = 0; pairs.forEach(p => { const k = String(p[0] || '').trim().toUpperCase().slice(0, 40), q = Math.round(p[1]); if (!k || !(q > 0) || /^(SKU|PART|ITEM)( ?#| NUMBER| NO\.?)?$/.test(k)) return; if (!skuEff(k)) skus[k] = { l: 0, w: 0, h: 0, boxes: 1, pcs: 1, desc: '' }; const ex = c.lines.find(l => l.sku === k); if (ex) ex.qty += q; else c.lines.push({ sku: k, qty: q }); n++; });
  if (n) { refreshSkuList(); planChanged(c); } return n;
}
function planInput(el) {
  if (el.id === 'skuQ') { skuQ = el.value; const d = $('skuTbl'); if (d) d.innerHTML = skuTable(); return true; }
  if (el.dataset.sf) { if (el.dataset.sf !== 'cbm') editSku(el, false); return true; }
  return el.id === 'lnSku' || el.id === 'lnQty' || el.id === 'lnText' || el.id === 'skuNew' || el.id === 'fcFill' || !!el.dataset.lq;
}
function planChange(el) {
  if (el.dataset.fc) { const c = byId(conts, +el.dataset.fc); if (c) { c.fc = el.checked; commit(); render(); } return true; }
  if (el.id === 'fcFill') { fcFillPct = Math.round(num(el.value, 40, 100, fcFillPct)); commit(); render(); return true; }
  if (el.id === 'fcShow') { view.fc = el.checked; fcVis(); return true; }
  if (el.id === 'skuOnly') { skuOnly = el.checked; render(); return true; }
  if (el.id === 'recvOn') { if (sel && sel.kind === 'run') { sel.obj.noRecv = !el.checked; commit(); readouts(); } return true; }
  if (el.id === 'cfgAisle') { MIN_AISLE = num(el.value, 2, 20, MIN_AISLE); refreshSel(); commit(); render(); return true; }
  if (el.id === 'cfgClear') { CLEAR = num(el.value, 8, 60, CLEAR); runs.forEach(buildRun); invalidate(); commit(); render(); return true; }
  if (el.dataset.sf) { editSku(el, true); return true; }
  if (el.dataset.lq) { if (sel && sel.kind === 'cont' && sel.obj.lines) { const ln = sel.obj.lines[+el.dataset.lq]; if (ln) { ln.qty = Math.round(num(el.value, 1, 1e6, ln.qty)); planChanged(sel.obj); } } return true; }
  return el.id === 'lnSku' || el.id === 'lnQty' || el.id === 'lnText' || el.id === 'skuNew' || el.id === 'skuQ';
}
function planClick(act, el) {
  if (act === 'newOrder') {
    let n = 1; while (conts.some(c => c.name === 'On order ' + n)) n++;
    const k = conts.filter(c => c.kind === 'order').length, slot = SITE.incoming.find(p => !conts.some(c => !c.removed && !c.received && !c.hidden && Math.hypot(c.x - p[0], c.z - p[1]) < 6)) || [20 + 12 * (k % 12), -70];
    const c = { id: nextId++, kind: 'order', src: -1, name: 'On order ' + n, x: slot[0], z: slot[1], rot: -90, shell: (3 + conts.length) % CSHELL.length, status: 'On order', closed: false, hidden: false, removed: false, received: false, fc: true, po: '', eta: '', lines: [] };
    conts.push(c); buildCont(c); invalidate(); commit(); select('cont', c, 0, true); return true;
  }
  if (act === 'fcAll' || act === 'fcNone') { pending().forEach(c => { c.fc = act === 'fcAll'; }); commit(); render(); return true; }
  if (act === 'unrecv') { const c = byId(conts, +el.dataset.id); if (c) { c.received = false; c.recvAt = ''; buildCont(c); invalidate(); commit(); select('cont', c, 0, true); } return true; }
  if (act === 'sku') { openSku = openSku === el.dataset.sku ? null : el.dataset.sku; render(); panel.scrollTop = 0; return true; }
  if (act === 'skuClose') { openSku = null; render(); return true; }
  if (act === 'skuAdd') { const k = $('skuNew').value.trim().toUpperCase(); if (!k) return true; if (!skuEff(k)) { skus[k] = { l: 0, w: 0, h: 0, boxes: 1, pcs: 1, desc: '' }; refreshSkuList(); commit(); } openSku = k; skuQ = ''; render(); return true; }
  if (act === 'skuReset' || act === 'skuDel') { delete skus[openSku]; if (act === 'skuDel') { openSku = null; refreshSkuList(); } skuChanged(true); render(); return true; }
  if (act === 'moveMode') { if (sel) { moveMode(!dragOn); refreshSel(); render(); } return true; }
  if (!sel) return false; const o = sel.obj;
  if (act === 'asBuilt' && sel.kind === 'run') { o.ok = !o.ok; refreshSel(); commit(); readouts(); return true; }
  if (act === 'bayOk' && sel.kind === 'bay') { const b = o.bay[sel.s]; b.ok = !b.ok; commit(); readouts(); return true; }
  if (sel.kind !== 'cont') return false;
  if (act === 'recv') { o.received = true; o.fc = false; o.recvAt = new Date().toISOString().slice(0, 10); o.status = 'Unloaded'; sel = null; moveMode(false); buildCont(o); refreshSel(); invalidate(); commit(); if ($('q').value) search($('q').value); render(); return true; }
  if (act === 'repack') { const m = {}, lines = []; PACK.list[o.src].items.forEach(it => { if (m[it[0]]) m[it[0]].qty += it[4]; else lines.push(m[it[0]] = { sku: it[0], qty: it[4] }); }); o.kind = 'order'; o.lines = lines; o.po = o.po || PACK.order; clicked = null; planChanged(o); return true; }
  if (act === 'lnAdd') { if (!addLines(o, [[$('lnSku').value, num($('lnQty').value, 1, 1e6, 1)]])) { showErr('Type a SKU first.'); setTimeout(() => showErr(''), 3000); } return true; }
  if (act === 'lnPaste') { const pairs = $('lnText').value.split(/\r?\n/).map(t => { const a = t.trim().split(/[\t,;]+|\s{2,}/).map(x => x.trim()).filter(Boolean); if (a.length === 1) { const m = /^(\S+)\s+([\d.]+)$/.exec(a[0]); return m ? [m[1], +m[2]] : [a[0], 1]; } const qi = a.findIndex((x, i) => i > 0 && /^[\d.,]+$/.test(x)); return [a[0], qi > 0 ? parseFloat(a[qi].replace(/,/g, '')) : 1]; }); if (!addLines(o, pairs)) { showErr('No lines found. Put a SKU and a quantity on each line.'); setTimeout(() => showErr(''), 4000); } return true; }
  if (act === 'lnDel') { o.lines.splice(+el.dataset.i, 1); clicked = null; planChanged(o); return true; }
  return false;
}

// ===== edits, actions, mouse and keyboard, search, save/load, start-up =====
let dragOn = false;      // moving by dragging is locked until Move is pressed
function moveMode(on) { dragOn = !!on; const b = $('moveBanner'); if (b) b.style.display = dragOn ? 'flex' : 'none'; }
function after(structural, renamed) {
  if (renamed) rebuildStockOwners(); else rebuild(sel);
  refreshSel(); if ($('q').value) search($('q').value);
  if (structural) render(); else { readouts(); chrome(); }
}
function levelEdit(lv, el, final) {
  const i = +el.dataset.i, lo = i ? lv[i - 1] + 0.25 : 0, hi = i < lv.length - 1 ? lv[i + 1] - 0.25 : 40, v = r2(num(el.value, final ? lo : 0, final ? hi : 40, lv[i]));
  if (final) el.value = ft(v); else if (v < lo || v > hi) return null;
  const out = lv.slice(); out[i] = v; return out;
}
function editRun(r, f, el, final) {
  let structural = false, renamed = false;
  if (f === 'label') r.label = el.value.slice(0, 80) || r.code;
  else if (f === 'height' || f === 'heightR') r.height = num(el.value, 2, 40, heightOf(r));
  else if (f === 'level') { const lv = levelEdit(levelsOf(r), el, final); if (!lv) return; r.levels = lv; }
  else if (f === 'x') r.x = r2(num(el.value, -400, 600, r.x)); else if (f === 'z') r.z = r2(num(el.value, -400, 600, r.z));
  else if (f === 'bays') { r.bays = Math.round(num(el.value, 1, 40, r.bays)); fixBays(r); renamed = true; structural = true; }
  else if (f === 'pitch') r.pitch = r2(num(el.value, 1, 20, r.pitch)); else if (f === 'depth') r.depth = r2(num(el.value, 1, 20, r.depth));
  else if (f === 'type') { if (!final) return; const t = typeById(el.value), sz = $('typeSize') && $('typeSize').checked; r.type = t.id; r.height = null; r.levels = null; if (sz) { const len = lenOf(r); r.depth = t.depth || r.depth; r.pitch = t.bayWidth || r.pitch; r.bays = Math.max(1, Math.round(len / r.pitch)); fixBays(r); renamed = true; } structural = true; }
  else return;
  after(structural && final, renamed); if (final) commit();
}
function editBay(r, s, f, el, final) {
  const b = r.bay[s]; let structural = false, renamed = false;
  if (f === 'bname') { if (!final) return; b.name = el.value.trim().toUpperCase().slice(0, 14); renamed = true; structural = true; }
  else if (f === 'btype') { if (!final) return; b.type = el.value || null; b.height = null; b.levels = null; structural = true; }
  else if (f === 'height' || f === 'heightR') b.height = num(el.value, 2, 40, bayH(r, s));
  else if (f === 'level') { const lv = levelEdit(bayLv(r, s), el, final); if (!lv) return; b.levels = lv; }
  else return;
  after(structural && final, renamed); if (final) commit();
}
function editOther(k, o, f, el, final) {
  let structural = false, renamed = false;
  if (f === 'name') o.name = el.value.slice(0, 60) || o.name;
  else if (f === 'x') o.x = r2(num(el.value, -400, 600, o.x)); else if (f === 'z') o.z = r2(num(el.value, -400, 600, o.z));
  else if (k === 'area' && f === 'w') o.w = r2(num(el.value, 1, 300, o.w)); else if (k === 'area' && f === 'd') o.d = r2(num(el.value, 1, 300, o.d));
  else if (k === 'area' && f === 'loc') { if (!final) return; o.loc = el.value; renamed = true; structural = true; }
  else if (k === 'equip' && f === 'kind') { if (!final) return; o.kind = el.value; structural = true; }
  else if (f === 'rot') o.rot = Math.round(num(el.value, -360, 360, o.rot));
  else if (k === 'cont' && f === 'status') { if (!final) return; o.status = el.value; }
  else if (k === 'cont' && (f === 'po' || f === 'eta')) { if (!final) return; o[f] = el.value.slice(0, 40); structural = true; }
  else if (k === 'cont' && f === 'seq') { const n = contCount(o), v = Math.round(num(el.value, 0, n, n)); o.shown = v >= n ? null : v; const sv = $('seqv'); if (sv) sv.textContent = v; buildCont(o); invalidate(); if ($('q').value) search($('q').value); return; }
  else return;
  after(structural && final, renamed); if (final) commit();
}
function editType(el, final) {
  const t = types.find(x => x.id === openType); if (!t) return; const f = el.dataset.tf;
  if (f === 'name') t.name = el.value.slice(0, 60) || t.name; else if (f === 'color') t.color = el.value; else if (f === 'beamColor') t.beamColor = el.value;
  else if (f === 'structure') { t.structure = el.value === 'cantilever' ? 'cantilever' : 'beam'; t.hangers = el.value === 'hang'; }
  else if (f === 'height') t.height = num(el.value, 2, 40, t.height); else if (f === 'upright') t.upright = num(el.value, 0.1, 1, t.upright);
  else if (f === 'levels') { const a = parseLevels(el.value); if (a.length) t.levels = a; if (final) el.value = t.levels.map(ft).join(', '); }
  runs.forEach(r => { if (r.type === t.id || r.bay.some(b => b.type === t.id)) buildRun(r); }); refreshSel(); chrome(); invalidate();
  if (final) { commit(); if (f === 'name' || f === 'color' || f === 'beamColor' || f === 'structure') render(); }
}
function onField(el, final) {
  if (rendering) return;
  if (el.dataset.tf) return editType(el, final);
  const f = el.dataset.f; if (!f || !sel) return;
  if (sel.kind === 'run') editRun(sel.obj, f, el, final); else if (sel.kind === 'bay') editBay(sel.obj, sel.s, f, el, final); else editOther(sel.kind, sel.obj, f, el, final);
}
panel.addEventListener('input', e => { const el = e.target; if (rendering) return; if (planInput(el)) return; if (el.id === 'itemQ') { itemQ = el.value; const d = $('items'); if (d && sel && sel.kind === 'cont') d.innerHTML = contItems(sel.obj); return; } if (el.tagName !== 'SELECT') onField(el, false); });
panel.addEventListener('change', e => {
  if (rendering) return; const el = e.target;
  if (planChange(el)) return;
  if (el.id === 'packMode') { view.packMode = el.value; conts.forEach(c => { if (isIn(c)) buildCont(c); }); invalidate(); render(); return; }
  if (el.id === 'wallMode') { setWalls(el.value); fcVis(); return; }
  if (el.id === 'shadowOn') { view.shadows = el.checked; sun.castShadow = el.checked; sc.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); invalidate(); return; }
  onField(el, true);
});
const cameraSpot = () => [snap(ctl.target.x), snap(ctl.target.z)];
panel.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return; const act = el.dataset.act;
  if (planClick(act, el)) return;
  if (act === 'pick') { select(el.dataset.k, byId(LISTS[el.dataset.k](), +el.dataset.id), 0, true); return; }
  if (act === 'restore') { const k = el.dataset.k, o = byId(LISTS[k](), +el.dataset.id); o.removed = false; if (k === 'run' || k === 'area') rebuildStockOwners(); else rebuild({ kind: k, obj: o }); commit(); select(k, o, 0, true); return; }
  if (act === 'addRun') { const t = typeById($('addType').value), p = cameraSpot(); let n = 1; while (runs.some(r => r.code === 'NEW-' + n)) n++;
    const r = { id: nextId++, code: 'NEW-' + n, label: 'New rack ' + n, type: t.id, x: p[0], z: p[1], axis: 'z', bays: 3, pitch: t.bayWidth || 9, depth: t.depth || 4, backMax: false, status: 'planned', height: null, levels: null, removed: false, bay: [] };
    fixBays(r); runs.push(r); rebuildStockOwners(); commit(); select('run', r); return; }
  if (act === 'addArea') { const p = cameraSpot(), a = { id: nextId++, name: 'New area', loc: '', x: p[0], z: p[1], w: 10, d: 10, flag: '', removed: false }; areas.push(a); rebuildStockOwners(); commit(); select('area', a); return; }
  if (act === 'addEquip') { const k = $('addKind').value, p = cameraSpot(), q = { id: nextId++, kind: k, name: EQ[k].name, x: p[0], z: p[1], rot: 0, removed: false }; equip.push(q); buildEquip(q); invalidate(); commit(); select('equip', q); return; }
  if (act === 'openType') { openType = openType === el.dataset.id ? null : el.dataset.id; render(); return; }
  if (act === 'dupType') { const t = types.find(x => x.id === openType), c = clone(t); let n = 2; while (types.some(x => x.id === t.id + '_' + n)) n++; c.id = t.id + '_' + n; c.name = t.name + ' (copy)'; types.push(c); openType = c.id; commit(); render(); return; }
  if (act === 'delType') { types = types.filter(x => x.id !== openType); openType = null; commit(); render(); return; }
  if (act === 'cloudSave') { cloudSave(true); return; }
  if (act === 'cloudReload') { cloudLoad(); return; }
  if (act === 'save') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([getState()], { type: 'application/json' })); a.download = 'warehouse-layout-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove(); return; }
  if (act === 'load') { $('file').click(); return; }
  if (act === 'resetAll') { if (getState() !== INITIAL) { setState(INITIAL); commit(); render(); } return; }
  if (act === 'item') { $('q').value = el.dataset.sku; search(el.dataset.sku); return; }
  if (!sel) return; const o = sel.obj, k = sel.kind;
  if (act === 'n') { const s = parseFloat($('step').value) || 1; o.x = r2(o.x + s * +el.dataset.dx); o.z = r2(o.z + s * +el.dataset.dz); after(false); commit(); return; }
  if (act === 'remove') { o.removed = true; const kk = k; sel = null; if (kk === 'run' || kk === 'area') rebuildStockOwners(); else rebuild({ kind: kk, obj: o }); refreshSel(); commit(); if ($('q').value) search($('q').value); render(); return; }
  if (act === 'turn') { o.rot = ((o.rot + +el.dataset.by + 540) % 360) - 180; after(true); commit(); return; }
  if (act === 'dup') {
    if (k === 'run') { let n = 2; while (runs.some(x => x.code === o.code + '-' + n)) n++; const c = JSON.parse(getState()).runs.find(x => x.id === o.id); c.id = nextId++; c.code = o.code + '-' + n; c.label = o.label + ' (copy)'; c.status = 'planned'; c.bay.forEach(b => { b.name = ''; }); if (o.axis === 'z') c.x = r2(o.x + o.depth + MIN_AISLE); else c.z = r2(o.z + o.depth + MIN_AISLE); runs.push(c); rebuildStockOwners(); commit(); select('run', c); }
    else if (k === 'area') { const c = { id: nextId++, name: o.name + ' (copy)', loc: '', x: r2(o.x + o.w + 2), z: o.z, w: o.w, d: o.d, flag: '', removed: false }; areas.push(c); rebuildStockOwners(); commit(); select('area', c); }
    else if (k === 'equip') { const c = { id: nextId++, kind: o.kind, name: o.name + ' (copy)', x: r2(o.x + (EQ[o.kind] || EQ.pallets).w + 2), z: o.z, rot: o.rot, removed: false }; equip.push(c); buildEquip(c); invalidate(); commit(); select('equip', c); }
    return;
  }
  if (k === 'run' || k === 'bay') {
    const s = sel.s, getLv = () => k === 'bay' ? bayLv(o, s) : levelsOf(o), setLv = lv => { if (k === 'bay') o.bay[s].levels = lv; else o.levels = lv; };
    if (act === 'lvAdd') {       // add on top while there is room under the uprights; otherwise share the same height between one more level
      let lv = getLv().slice(); const last = lv[lv.length - 1], step = lv.length > 1 ? last - lv[lv.length - 2] : 6, H = k === 'bay' ? bayH(o, s) : heightOf(o);
      if (last + step <= H - 1.5) lv.push(r2(last + step)); else { const n = lv.length, a = lv[0], b = Math.max(last, a + 2); lv = []; for (let i = 0; i <= n; i++) lv.push(Math.round((a + (b - a) * i / n) * 4) / 4); }
      setLv(lv); after(true); commit(); return; }
    if (act === 'lvDel') { const lv = getLv().slice(); lv.splice(+el.dataset.i, 1); setLv(lv); after(true); commit(); return; }
    if (act === 'useType') { o.height = null; o.levels = null; after(true); commit(); return; }
    if (act === 'rot') { const q = rectOf(o), cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, len = lenOf(o); o.axis = o.axis === 'z' ? 'x' : 'z'; if (o.axis === 'z') { o.x = snap(cx - o.depth / 2); o.z = snap(cz - len / 2); } else { o.x = snap(cx - len / 2); o.z = snap(cz - o.depth / 2); } after(true); commit(); return; }
    if (act === 'orig') { const p = JSON.parse(INITIAL).runs.find(x => x.id === o.id); if (!p) return; Object.assign(o, p); after(true, true); commit(); return; }
    if (act === 'names') { const aisle = $('nmAisle').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), start = Math.round(num($('nmStart').value, 0, 99, 1)), dir = $('nmDir').value; o.bay.forEach((b, i) => { b.name = aisle ? aisle + ':' + pad2(start + (dir === 'asc' ? i : o.bays - 1 - i)) : ''; }); after(true, true); commit(); return; }
    if (act === 'bay') { select('bay', o, +el.dataset.s); return; }
    if (act === 'toRun') { select('run', o); return; }
    if (act === 'bayPrev' || act === 'bayNext') { select('bay', o, s + (act === 'bayNext' ? 1 : -1)); return; }
    if (act === 'bayClear') { const b = o.bay[s]; b.type = null; b.height = null; b.levels = null; after(true); commit(); return; }
    if (act === 'bayCopy') { const b = o.bay[s]; o.bay.forEach(x => { x.type = b.type; x.height = b.height; x.levels = b.levels ? b.levels.slice() : null; }); after(true); commit(); return; }
  }
  if (k === 'cont') {
    if (act === 'ramp') { const free = SITE.rampSlots.find(p => !conts.some(c => c !== o && !c.removed && !c.hidden && !c.received && Math.hypot(c.x - p[0], c.z - p[1]) < 6)); if (!free) { showErr('The ramp is full: move a container off it first.'); setTimeout(() => showErr(''), 4000); return; } o.x = free[0]; o.z = free[1]; o.rot = -90; o.status = 'On the ramp'; after(true); commit(); const f = foot(sel); moveTo(new THREE.Vector3(f.cx, 0, f.cz)); return; }
    if (act === 'close') { o.closed = !o.closed; after(true); commit(); return; }
    if (act === 'hide') { o.hidden = !o.hidden; after(true); commit(); return; }
    if (act === 'look') { const t = o.rot * Math.PI / 180, dx = Math.cos(t), dz = -Math.sin(t); ctl.target.set(o.x, 3, o.z); cam.position.set(o.x - dx * 22 - dz * 30, 34, o.z - dz * 22 + dx * 30); ctl.update(); invalidate(false); return; }
  }
});
$('file').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
  rd.onload = () => { try { const st = JSON.parse(rd.result); if (!st.runs || !st.types || !st.areas) throw new Error('this is not a layout file'); st.conts = (st.conts || []).filter(c => c.kind !== 'order' || Array.isArray(c.lines)); st.equip = st.equip || []; st.conts = st.conts || []; st.nextId = st.nextId || 5000; setState(JSON.stringify(st)); commit(); render(); } catch (x) { showErr('Could not load that file: ' + x.message); } e.target.value = ''; };
  rd.readAsText(f);
});
['racks', 'areas', 'equip', 'conts', 'skus', 'more'].forEach(k => { $('tab-' + k).onclick = () => { tab = k; render(); }; });
$('undo').onclick = undo; $('moveDone').onclick = () => { moveMode(false); refreshSel(); render(); };
$('hide').onclick = () => { const p = $('panel'); p.classList.toggle('shut'); $('hide').textContent = p.classList.contains('shut') ? '‹ Edit' : 'Hide ›'; fitView(); };

// ---------------------------------------------------------------- views and navigation
const CX = 70, CZ = 75;
function topView() { cam.position.set(CX - 10, 470, CZ - 9.99); ctl.target.set(CX - 10, 0, CZ - 10); ctl.update(); invalidate(false); }
function isoView() { cam.position.set(CX - 150, 170, CZ + 215); ctl.target.set(CX - 6, 0, CZ + 6); ctl.update(); invalidate(false); }
function insideView() { cam.position.set(18, 62, 148); ctl.target.set(78, 6, 60); ctl.update(); invalidate(false); }
function fitView() { const p = $('panel'), open = !p.classList.contains('shut'), off = open && innerWidth > 700 ? (p.offsetWidth + 16) / 2 : 0; cam.aspect = innerWidth / innerHeight; cam.setViewOffset(innerWidth, innerHeight, off, 0, innerWidth, innerHeight); document.body.classList.toggle('wide', !open); invalidate(false); }
$('top').onclick = topView; $('iso').onclick = isoView; $('in').onclick = insideView;
const ray = new THREE.Raycaster(), mv = new THREE.Vector2(), groundPl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function setRay(cx, cy) { const rc = dom.getBoundingClientRect(); mv.set((cx - rc.left) / rc.width * 2 - 1, -(cy - rc.top) / rc.height * 2 + 1); ray.setFromCamera(mv, cam); }
function groundPoint(cx, cy) { setRay(cx, cy); const p = new THREE.Vector3(); return ray.ray.intersectPlane(groundPl, p) ? p : null; }
function pickAt(cx, cy) { setRay(cx, cy); const a = []; [runsRoot, areasRoot, equipRoot, contRoot].forEach(root => { if (root.visible) root.traverse(o => { if (o.isMesh && o.userData.sel && o.visible) a.push(o); }); }); return ray.intersectObjects(a, false)[0] || null; }
function hitsSelected(cx, cy) {
  if (!sel || !sel.obj.g) return false;
  setRay(cx, cy);
  const a = []; sel.obj.g.traverse(o => { if (o.isMesh && o.userData.sel && o.visible) a.push(o); }); selG.traverse(o => { if (o.userData.plate) a.push(o); });
  if (ray.intersectObjects(a, false).length > 0) return true;
  const p = groundPoint(cx, cy); if (!p) return false;
  const f = foot(sel), r = Math.hypot(f.w / 2 + 2.5, f.d / 2 + 2.5);
  return Math.hypot(p.x - f.cx, p.z - f.cz) <= r;
}
const moveTo = p => { const d = p.clone().sub(ctl.target); ctl.target.add(d); cam.position.add(d); ctl.update(); invalidate(false); };
const slotAt = (r, p) => Math.max(0, Math.min(r.bays - 1, Math.floor((r.axis === 'z' ? p.z - r.z : p.x - r.x) / r.pitch)));
let down = null, drag = null;
dom.addEventListener('pointerdown', e => {
  down = [e.clientX, e.clientY]; invalidate(false); if (e.button !== 0) return;
  if (e.shiftKey || e.ctrlKey || e.metaKey) { ctl.mouseButtons.LEFT = THREE.MOUSE.PAN; return; }
  ctl.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  if (dragOn && hitsSelected(e.clientX, e.clientY)) { const p = groundPoint(e.clientX, e.clientY); if (p) { const o = sel.obj, own = sel.kind === 'equip' || sel.kind === 'cont'; drag = { p0: p, x0: o.x, z0: o.z, dx: 0, dz: 0, moved: false, own }; ctl.enabled = false; try { e.preventDefault(); e.stopPropagation(); dom.setPointerCapture(e.pointerId); } catch (x) {} } }
}, true);
dom.addEventListener('pointermove', e => {
  if (drag) {
    const p = groundPoint(e.clientX, e.clientY); if (!p) return; const dx = snap(p.x - drag.p0.x), dz = snap(p.z - drag.p0.z);
    if (dx !== drag.dx || dz !== drag.dz) { drag.dx = dx; drag.dz = dz; drag.moved = true; const g = sel.obj.g; if (drag.own) g.position.set(drag.x0 + dx, 0, drag.z0 + dz); else g.position.set(dx, 0, dz); selG.position.set(dx, 0, dz);
      const xi = panel.querySelector('[data-f="x"]'), zi = panel.querySelector('[data-f="z"]'); if (xi) xi.value = ft(drag.x0 + dx); if (zi) zi.value = ft(drag.z0 + dz); invalidate(); }
    return;
  }
  if (!e.buttons) dom.style.cursor = dragOn && hitsSelected(e.clientX, e.clientY) ? 'move' : '';
});
dom.addEventListener('pointerup', e => {
  invalidate(false);
  if (drag) {
    const d = drag; drag = null; ctl.enabled = true; try { dom.releasePointerCapture(e.pointerId); } catch (x) {}
    if (d.moved) { const o = sel.obj; if (!d.own) o.g.position.set(0, 0, 0); if (d.dx || d.dz) { o.x = r2(d.x0 + d.dx); o.z = r2(d.z0 + d.dz); if (sel.kind === 'area' && o.flag === 'unlocated' && inside(o.x + o.w / 2, o.z + o.d / 2)) o.flag = ''; after(false); commit(); } else { rebuild(sel); refreshSel(); } down = null; return; }
  }
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || e.button !== 0) return;
  const h = pickAt(e.clientX, e.clientY);
  if (!h) { clicked = null; select(null); return; }
  const ud = h.object.userData, obj = byId(LISTS[ud.sel](), ud.id); if (!obj) return;
  clicked = ud.idx ? { src: ud.src, i: ud.idx[Math.floor(h.faceIndex / 12)], cont: ud.sel === 'cont' ? obj.id : null } : null;
  if (ud.sel === 'run') { const same = sel && (sel.kind === 'run' || sel.kind === 'bay') && sel.obj === obj; if (same || e.altKey) select('bay', obj, slotAt(obj, h.point)); else select('run', obj); }
  else select(ud.sel, obj);
});
dom.addEventListener('dblclick', e => { const p = groundPoint(e.clientX, e.clientY); if (p) moveTo(p); });
dom.addEventListener('wheel', e => { invalidate(false); const p = groundPoint(e.clientX, e.clientY); if (!p || e.deltaY >= 0) return; const off = p.clone().sub(ctl.target).multiplyScalar(0.12); ctl.target.add(off); cam.position.add(off); }, { capture: true, passive: true });
const KD = new Set(), typing = e => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing(e)) { e.preventDefault(); undo(); return; }
  if (typing(e)) return; const k = e.key.toLowerCase();
  if (k === 'escape') { if (dragOn) { moveMode(false); refreshSel(); render(); return; } if (sel && sel.kind === 'bay') select('run', sel.obj); else { clicked = null; select(null); } return; }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e'].indexOf(k) >= 0) { KD.add(k); if (k.indexOf('arrow') === 0) e.preventDefault(); }
  if (k === 'r' && !e.repeat) isoView();
});
addEventListener('keyup', e => KD.delete(e.key.toLowerCase())); addEventListener('blur', () => KD.clear());
let lastT = performance.now();
function keyMove() {
  const t = performance.now(), dt = Math.min(0.1, (t - lastT) / 1000); lastT = t; if (!KD.size) return;
  const fw = new THREE.Vector3(); cam.getWorldDirection(fw); fw.y = 0; if (fw.lengthSq() < 1e-6) fw.set(0, 0, -1); fw.normalize();
  const rt = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)), sp = Math.max(8, cam.position.distanceTo(ctl.target) * 0.8) * dt, m = new THREE.Vector3();
  if (KD.has('w') || KD.has('arrowup')) m.add(fw); if (KD.has('s') || KD.has('arrowdown')) m.sub(fw); if (KD.has('d') || KD.has('arrowright')) m.add(rt); if (KD.has('a') || KD.has('arrowleft')) m.sub(rt); if (KD.has('e')) m.y += 1; if (KD.has('q')) m.y -= 1;
  if (m.lengthSq()) { m.normalize().multiplyScalar(sp); ctl.target.add(m); cam.position.add(m); }
}
addEventListener('resize', () => { R.setSize(innerWidth, innerHeight); fitView(); });
[['lRun', 'run'], ['lAisle', 'aisle'], ['lBay', 'bay'], ['lZone', 'zone'], ['lInv', 'inv'], ['lEq', 'equip']].forEach(p => { $(p[0]).addEventListener('change', e => { layerOn[p[1]] = e.target.checked; applyLayers(); }); });

// ---------------------------------------------------------------- search: racks, floor areas, containers on site and incoming cartons
let HL = null, hitRows = []; const HM = new THREE.MeshBasicMaterial({ color: 0xffe600 });
function search(q) {
  if (HL) { sc.remove(HL); HL.geometry.dispose(); HL = null; }
  q = (q || '').trim().toUpperCase(); const res = $('sres'), lst = $('slist');
  invMats.forEach(m => { m.color.copy(m.userData.base); if (q) m.color.multiplyScalar(0.22); }); conts.forEach(c => { if (c.mat) c.mat.color.setScalar(q ? 0.22 : 1); });
  invalidate(false);
  if (!q) { res.textContent = ''; lst.style.display = 'none'; return; }
  const hits = [], has = s => String(s || '').toUpperCase().indexOf(q) >= 0, pm = pi => has(PARTS[pi][0]) || has(PARTS[pi][1]);
  RB.forEach((b, i) => { if (pm(b[10]) || has(LOCS[b[11]]) || has(BAYKEYS[b[0]])) hits.push({ where: LOCS[b[11]], part: PARTS[b[10]][0], u: b[12], w: rackBox(i), rot: 0, mark: b[9] === 3 ? 1.6 : 1.03, go: { src: 'rack', i } }); });
  AB.forEach((b, j) => { if (pm(b[8]) || has(LOCS[b[9]])) hits.push({ where: LOCS[b[9]], part: PARTS[b[8]][0], u: b[10], w: areaBox(j), rot: 0, mark: b[7] === 3 ? 1.6 : 1.03, go: { src: 'area', i: j } }); });
  conts.forEach(c => {
    if (c.removed || c.received) return; const vis = !c.hidden && !c.closed, at = (k) => { if (!vis || (c.shown != null && k >= c.shown)) return null; const l = contLocal(c, k), p = contWorld(c, l); return [p[0], p[1], p[2], l[3], l[4], l[5]]; };
    if (c.kind === 'yard') D.yard[c.src].boxes.forEach((b, k) => { if (pm(b[7]) || has(LOCS[b[8]])) hits.push({ where: c.name, part: PARTS[b[7]][0], u: b[9], w: at(k), rot: c.rot, mark: 1.03, go: { src: 'yard', i: k, cont: c.id } }); });
    else { const P = contPack(c); P.boxes.forEach((bx, k) => { const it = P.items[bx[0]]; if (has(it[0]) || has(it[1]) || has(it[2]) || has(c.name)) hits.push({ where: c.name, part: it[0], u: it[7] ? it[8] : 1, w: at(k), rot: c.rot, mark: 1.03, go: { src: 'pack', i: k, cont: c.id } }); }); }
  });
  const placed = hits.filter(h => h.w);
  if (placed.length) { HL = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), HM, placed.length); const o = new THREE.Object3D(); placed.forEach((h, k) => { o.position.set(h.w[0], h.w[1], h.w[2]); o.rotation.set(0, h.rot * Math.PI / 180, 0); o.scale.set(h.w[3] * h.mark, h.w[4] * h.mark, h.w[5] * h.mark); o.updateMatrix(); HL.setMatrixAt(k, o.matrix); }); sc.add(HL); }
  const by = {}; hits.forEach(h => { const k = h.where + '|' + h.part, r = by[k] = by[k] || { where: h.where, part: h.part, u: 0, h, gone: 0 }; r.u += h.u; if (!h.w) r.gone = 1; });
  hitRows = Object.keys(by).map(k => by[k]).sort((a, b) => b.u - a.u); const np = {}; hits.forEach(h => { np[h.part] = 1; });
  res.textContent = hits.length + ' boxes/markers · ' + Object.keys(np).length + ' parts · ' + fmt(hitRows.reduce((s, r) => s + r.u, 0)) + ' units';
  lst.innerHTML = hitRows.slice(0, 40).map((r, k) => '<div class="sr" data-k="' + k + '">' + esc(r.where) + ' · ' + esc(r.part) + ' · <b>' + fmt(r.u) + '</b> u' + (r.gone ? ' <span class="bad">[not shown]</span>' : '') + '</div>').join('') + (hitRows.length > 40 ? '<div class="dim">… ' + (hitRows.length - 40) + ' more</div>' : '');
  lst.style.display = 'block';
}
$('slist').addEventListener('click', e => {
  const el = e.target.closest('.sr'); if (!el) return; const h = hitRows[+el.dataset.k].h; clicked = h.go;
  if (h.w) { ctl.target.set(h.w[0], h.w[1], h.w[2]); cam.position.set(h.w[0] - 12, h.w[1] + 10, h.w[2] + 14); ctl.update(); invalidate(false); }
  if (h.go.src === 'rack') { const hit = bayIndex[BAYKEYS[RB[h.go.i][0]]]; if (hit) select('run', hit.r); else { tab = 'more'; select(null); } }
  else if (h.go.src === 'area') { const b = AB[h.go.i], list = areaIndex[LOCS[b[9]]]; if (list) select('area', list[abOrd[h.go.i]] || list[0]); else { tab = 'more'; select(null); } }
  else select('cont', byId(conts, h.go.cont));
});
$('q').addEventListener('input', e => search(e.target.value));

// ---------------------------------------------------------------- start
equip = seedEquipment(); conts = seedContainers();
reindex(); initLetterOffsets();
buildSite(); buildWalls(); buildAll();
INITIAL = committed = getState(); lastLost = lostTotal();
fitView(); isoView(); render();
cloudLoad();
window.EDITOR = { get runs() { return runs; }, get areas() { return areas; }, get equip() { return equip; }, get conts() { return conts; }, get types() { return types; }, get sel() { return sel; }, get homeless() { return homeless; }, get log() { return log; },
  select: (kind, key, s) => { const list = LISTS[kind](), o = list.find(x => (x.code || x.name) === key); select(kind, o, s || 0, true); }, undo, getState, topView, isoView, insideView, cam, ctl, R, sun, sc, rackBox, areaBox, rectOf, foot, setWalls, lostTotal,
  proj: (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam), rc = dom.getBoundingClientRect(); return [rc.left + (v.x + 1) / 2 * rc.width, rc.top + (1 - v.y) / 2 * rc.height]; }, dbg: { warningsFor, needLv, placedN, tight0, BAYKEYS, bayLv, rackGaps, forecast, contPack, contCartons, skuEff, SKU0, packOrder, get FC() { return FC; }, get skus() { return skus; }, get dragOn() { return dragOn; } }, ready: true };
let frame = 0;
(function loop() { requestAnimationFrame(loop); keyMove(); const moved = ctl.update(); if (moved || dirty || KD.size || (++frame % 45 === 0)) { dirty = false; R.render(sc, cam); } })();

} catch (e) { showErr('Error: ' + e.message); console.error(e); }
})();

