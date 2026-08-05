// Exercise the fixed ON scraper logic without a browser. Stubs just enough DOM
// to build one apparel product group and one headerless group, then checks that
// apparel sizes survive, that the headerless group is skipped rather than given
// an invented ladder, and that naming/gender/handles behave.
import fs from 'node:fs';
import vm from 'node:vm';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content.js');

// --- the smallest DOM that satisfies the selectors content.js uses -----------
class El {
  constructor(cls = '', text = '', attrs = {}, tag = 'div') { this.cls = cls.split(' ').filter(Boolean); this.text = text; this.kids = []; this.attrs = attrs; this.tag = tag; }
  add(...k) { this.kids.push(...k); return this; }
  get textContent() { return this.text || this.kids.map((k) => k.textContent).join(' '); }
  getAttribute(n) { return this.attrs[n] ?? null; }
  _all(out = []) { for (const k of this.kids) { out.push(k); k._all(out); } return out; }
  matches(sel) {
    // supports "tag", ".a.b", "tag.a", "[title*=X]"
    const m = sel.match(/^\[title\*="?([^"\]]+)"?\]$/);
    if (m) return String(this.attrs.title || '').includes(m[1]);
    const tagPart = sel.split('.')[0];
    if (tagPart && tagPart !== this.tag) return false;
    return sel.split('.').slice(1).filter(Boolean).every((c) => this.cls.includes(c));
  }
  querySelectorAll(sel) {
    const parts = sel.trim().split(/\s+/);
    let pool = this._all();
    if (parts.length === 1) return pool.filter((e) => e.matches(parts[0]));
    // descendant chain: filter progressively
    let cur = [this];
    for (const p of parts) cur = cur.flatMap((n) => n._all().filter((e) => e.matches(p)));
    return cur;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function sizeHeader(labels) {
  const row = new El('row header');
  for (const l of labels) {
    const col = new El('column');
    const cnt = new El('size-cnt');
    cnt.add(new El('always-visible-size-type', l));
    col.add(cnt);
    row.add(col);
  }
  return row;
}
function fabricRow(colorText, styleId, statuses) {
  const row = new El('row product-fabric');
  const pft = new El('product-fabric-text');
  pft.add(new El('strong', colorText, {}, 'p'), new El('', styleId, {}, 'p'));
  row.add(pft);
  for (const s of statuses) {
    const prod = new El('product');
    const hdr = new El('product-header');
    hdr.add(new El('', s, {}, 'span'));
    prod.add(hdr);
    row.add(prod);
  }
  return row;
}
function group(title, header, rows) {
  const g = new El('product-group-cnt');
  const gh = new El('product-group-header');
  gh.add(new El('title', title));
  g.add(gh);
  if (header) g.add(header);
  g.add(...rows);
  return g;
}

// women's apparel: word sizes, and a group whose header cannot be read
const APPAREL_SIZES = ['X-Small', 'Small', 'Medium', 'Large', 'X-Large'];
const g1 = group('3" Core Shorts', sizeHeader(APPAREL_SIZES), [
  fabricRow('Black', '1WF10130553', ['In Stock', 'Low Stock', 'No Stock', 'Very Low Stock', 'In Stock']),
]);
const g2 = group('PTR | Studio Jacket', null, [fabricRow('Ember', '1WG10440553', ['In Stock'])]);
const g3 = group('Cloudmonster 2', sizeHeader(['5', '5.5', '6']), [
  fabricRow('Eclipse | Black', '3WF10123334', ['In Stock', 'No Stock', 'Low Stock']),
]);
const ALL = [g1, g2, g3];

const root = new El('root');
root.add(...ALL);

const alerts = [];
const sandbox = {
  console: { log() {}, warn() {}, error() {}, info() {} },
  alert: (m) => alerts.push(m),
  window: { location: { href: 'https://backstage.on-running.com/' }, addEventListener() {} },
  location: { href: 'https://backstage.on-running.com/' },
  MutationObserver: class { observe() {} disconnect() {} },
  document: {
    querySelectorAll: (sel) => (sel === '.product-group-cnt' ? ALL : root.querySelectorAll(sel)),
    querySelector: (sel) => root.querySelector(sel),
    createElement: () => new El(),
    addEventListener() {},
    body: { appendChild() {} },
    readyState: 'complete',
  },
  chrome: { runtime: { onMessage: { addListener() {} } } },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// class declarations do not attach to globalThis in a script, so export them
vm.runInContext(
  fs.readFileSync(SRC, 'utf8') +
    '\n;globalThis.ONRunningInventoryExtractor = ONRunningInventoryExtractor;' +
    '\n;globalThis.UnifiedShopifyConverter = UnifiedShopifyConverter;' +
    '\n;globalThis.onProductDatabase = onProductDatabase;',
  sandbox
);

const X = new sandbox.ONRunningInventoryExtractor();
const inv = X.extractFromONStructure();

let fails = 0;
const check = (msg, cond, extra) => {
  if (cond) console.log('  ok    ' + msg);
  else { fails++; console.log('  FAIL  ' + msg + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};

console.log('\nApparel sizes survive the scrape');
const shorts = inv.filter((r) => r.productName.includes('Core Shorts'));
check('5 rows for the shorts colorway, not 21', shorts.length === 5, shorts.length);
check('sizes are the words the portal showed', JSON.stringify(shorts.map((r) => r.sizeUS)) === JSON.stringify(APPAREL_SIZES), shorts.map((r) => r.sizeUS));
check('no shoe size anywhere in the apparel rows', !shorts.some((r) => /^\d+(\.\d)?$/.test(r.sizeUS)));
check('stock lands on the right size (Small = Low Stock = 5)', shorts.find((r) => r.sizeUS === 'Small').quantity === 5);
check('Medium is No Stock = 0', shorts.find((r) => r.sizeUS === 'Medium').quantity === 0);

console.log('\nA group with no readable header is skipped, not invented');
check('no rows emitted for the Studio Jacket', !inv.some((r) => r.productName.includes('Studio Jacket')));
check('the skip is surfaced to the user', alerts.length === 1 && /Studio Jacket/.test(alerts[0]), alerts);

console.log('\nFootwear still works exactly as before');
const shoes = inv.filter((r) => r.productName === 'Cloudmonster 2');
check('3 shoe rows', shoes.length === 3, shoes.length);
check('numeric sizes preserved', JSON.stringify(shoes.map((r) => r.sizeUS)) === JSON.stringify(['5', '5.5', '6']), shoes.map((r) => r.sizeUS));
check('gender from the 3WF code is Women\'s', shoes[0].gender === "Women's", shoes[0].gender);

console.log('\nNaming: apparel never borrows a shoe record');
const info = sandbox.getONProductInfo('3" Core Shorts', '1WF10130553');
check('shorts do NOT match a footwear model', info === sandbox.onProductDatabase['default'], info && info.name);
check('a real shoe name still matches', sandbox.getONProductInfo('Cloudmonster 2', '3WF10123334').name !== undefined);
const conv = new sandbox.UnifiedShopifyConverter('ON Running');
const title = conv.generateProductTitle({ productName: '3" Core Shorts', styleId: '1WF10130553', colorName: 'Black', gender: "Women's" });
check('title keeps the garment name', /Core Shorts/.test(title) && !/Cloud/.test(title), title);

console.log('\nHandles are legal Shopify handles');
const h1 = conv.generateHandle({ productName: '3" Core Shorts', styleId: '1WF10130553', colorCode: 'BLA', gender: "Women's" });
const h2 = conv.generateHandle({ productName: 'PTR | Studio Jacket', styleId: '1WG10440553', colorCode: 'EMB', gender: "Women's" });
check('no quote in the handle', /^[a-z0-9-]+$/.test(h1), h1);
check('no pipe in the handle', /^[a-z0-9-]+$/.test(h2), h2);

console.log('\nGender comes from the article code, not a shoe-size guess');
check('1WE is women', sandbox.inferGenderFromStyleId('1WE11860553') === "Women's");
check('1ME is men', sandbox.inferGenderFromStyleId('1ME11460069') === "Men's");
check('3MF is men', sandbox.inferGenderFromStyleId('3MF10121043') === "Men's");
check('word sizes tell us nothing', sandbox.inferGenderFromSizes(['X-Small', 'Small', '2X-Large']) === null);
check('shoe sizes still work', sandbox.inferGenderFromSizes(['5', '5.5', '6']) === "Women's");

console.log('\nApparel product types match the store vocabulary');
for (const [name, want] of [['3" Core Shorts', 'Shorts'], ['Performance Bra', 'Sports Bras'], ['Club Hoodie', 'Hoodies'],
  ['Performance Tights', 'Tights/Leggings'], ['Focus-T', 'T-Shirts'], ['Climate Shirt Half-Zip', 'Half-Zips'], ['Weather Vest', 'Vests']])
  check(`${name} -> ${want}`, conv.apparelProductType(name) === want, conv.apparelProductType(name));

console.log('');
if (fails) { console.log(`FAILED: ${fails}`); process.exit(1); }
console.log('ON scraper apparel handling OK.\n');
