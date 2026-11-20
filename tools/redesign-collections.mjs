// redesign-collections.mjs, The Run House.
//
// Two collections the site redesign has pages for and the store did not
// (owner go, 2026-11-19):
//
//  1. NEUTRAL RUNNING SHOES  /collections/neutral-running-shoes
//     Smart: TAG = neutral AND TYPE contains "Shoes" AND in stock. 1,044 active
//     products already carry the neutral tag, so nothing is tagged for this.
//
//  2. TEAM SUNGLASSES  /collections/team-sunglasses, plus one per league
//     (nfl-, nba-, mlb-, nhl-team-sunglasses) for the design's "pick your
//     league" chips. Knockaround's licensed styles carry no tag of their own;
//     they are identified by the TITLE starting with a full team name from the
//     lists below (or "Super Bowl"), then given "team sunglasses" plus a
//     league tag. ADD ONLY: no tag is ever removed, and a rollback file lists
//     every product touched. Smart rules on those tags, in stock only.
//
// A collection whose handle already exists is never touched. New ones are
// published to the Online Store only (not Facebook, Google, POS or Shop).
// Dry run by default.
//   node tools/redesign-collections.mjs            # dry run
//   node tools/redesign-collections.mjs --apply
//
// House style: no em dashes.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const E = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const SHOP = E.SHOP_URL.replace(/^https?:\/\//, '');
const APPLY = process.argv.includes('--apply');
const tok = (await (await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }) })).json()).access_token;
async function gql(query, variables) {
  for (let t = 0; t < 6; t++) {
    const r = await (await fetch(`https://${SHOP}/admin/api/2026-01/graphql.json`, { method: 'POST',
      headers: { 'X-Shopify-Access-Token': tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json();
    if (r.data && !(r.errors && r.errors.length)) return r.data;
    await new Promise((x) => setTimeout(x, 2000 * (t + 1)));
  }
  throw new Error('graphql failed');
}

export const LEAGUES = {
  nfl: ['Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills', 'Carolina Panthers', 'Chicago Bears', 'Cincinnati Bengals', 'Cleveland Browns', 'Dallas Cowboys', 'Denver Broncos', 'Detroit Lions', 'Green Bay Packers', 'Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Kansas City Chiefs', 'Las Vegas Raiders', 'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins', 'Minnesota Vikings', 'New England Patriots', 'New Orleans Saints', 'New York Giants', 'New York Jets', 'Philadelphia Eagles', 'Pittsburgh Steelers', 'San Francisco 49ers', 'Seattle Seahawks', 'Tampa Bay Buccaneers', 'Tennessee Titans', 'Washington Commanders', 'Super Bowl'],
  nba: ['Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets', 'Chicago Bulls', 'Cleveland Cavaliers', 'Dallas Mavericks', 'Denver Nuggets', 'Detroit Pistons', 'Golden State Warriors', 'Houston Rockets', 'Indiana Pacers', 'LA Clippers', 'Los Angeles Lakers', 'Memphis Grizzlies', 'Miami Heat', 'Milwaukee Bucks', 'Minnesota Timberwolves', 'New Orleans Pelicans', 'New York Knicks', 'Oklahoma City Thunder', 'Orlando Magic', 'Philadelphia 76ers', 'Phoenix Suns', 'Portland Trail Blazers', 'Sacramento Kings', 'San Antonio Spurs', 'Toronto Raptors', 'Utah Jazz', 'Washington Wizards'],
  mlb: ['Arizona Diamondbacks', 'Atlanta Braves', 'Baltimore Orioles', 'Boston Red Sox', 'Chicago Cubs', 'Chicago White Sox', 'Cincinnati Reds', 'Cleveland Guardians', 'Colorado Rockies', 'Detroit Tigers', 'Houston Astros', 'Kansas City Royals', 'Los Angeles Angels', 'Los Angeles Dodgers', 'Miami Marlins', 'Milwaukee Brewers', 'Minnesota Twins', 'New York Mets', 'New York Yankees', 'Oakland Athletics', 'Philadelphia Phillies', 'Pittsburgh Pirates', 'San Diego Padres', 'San Francisco Giants', 'Seattle Mariners', 'St. Louis Cardinals', 'Tampa Bay Rays', 'Texas Rangers', 'Toronto Blue Jays', 'Washington Nationals'],
  nhl: ['Anaheim Ducks', 'Boston Bruins', 'Buffalo Sabres', 'Calgary Flames', 'Carolina Hurricanes', 'Chicago Blackhawks', 'Colorado Avalanche', 'Columbus Blue Jackets', 'Dallas Stars', 'Detroit Red Wings', 'Edmonton Oilers', 'Florida Panthers', 'LA Kings', 'Los Angeles Kings', 'Minnesota Wild', 'Montreal Canadiens', 'Nashville Predators', 'New Jersey Devils', 'New York Islanders', 'New York Rangers', 'Ottawa Senators', 'Philadelphia Flyers', 'Pittsburgh Penguins', 'San Jose Sharks', 'Seattle Kraken', 'St. Louis Blues', 'Tampa Bay Lightning', 'Toronto Maple Leafs', 'Utah Hockey Club', 'Vancouver Canucks', 'Vegas Golden Knights', 'Washington Capitals', 'Winnipeg Jets'],
};
// Pure: the league a Knockaround title belongs to, or null.
export function leagueOf(title) {
  const t = String(title || '').trim();
  for (const [lg, teams] of Object.entries(LEAGUES)) if (teams.some((n) => t === n || t.startsWith(n + ' '))) return lg;
  return null;
}

const COLLECTIONS = [
  { handle: 'neutral-running-shoes', title: 'Neutral Running Shoes',
    descriptionHtml: '<p>Everyday neutral running shoes from Brooks, HOKA, Saucony, ASICS, New Balance, On and PUMA. Daily trainers for runners who do not need added support, from light and quick to soft and protective.</p>',
    rules: [{ column: 'TAG', relation: 'EQUALS', condition: 'neutral' }, { column: 'TYPE', relation: 'CONTAINS', condition: 'Shoes' }, { column: 'VARIANT_INVENTORY', relation: 'GREATER_THAN', condition: '0' }] },
  { handle: 'team-sunglasses', title: 'Team Sunglasses',
    descriptionHtml: '<p>Officially licensed NFL, NBA, MLB and NHL sunglasses from Knockaround. Pick your league, then your team.</p>',
    rules: [{ column: 'TAG', relation: 'EQUALS', condition: 'team sunglasses' }, { column: 'VARIANT_INVENTORY', relation: 'GREATER_THAN', condition: '0' }] },
  ...['nfl', 'nba', 'mlb', 'nhl'].map((lg) => ({ handle: lg + '-team-sunglasses', title: lg.toUpperCase() + ' Team Sunglasses',
    descriptionHtml: '<p>Officially licensed ' + lg.toUpperCase() + ' sunglasses from Knockaround.</p>',
    rules: [{ column: 'TAG', relation: 'EQUALS', condition: lg + ' sunglasses' }, { column: 'VARIANT_INVENTORY', relation: 'GREATER_THAN', condition: '0' }] })),
];

// 1. The Knockaround team products and the tags each still needs.
const tagPlan = [];
let after = null;
do {
  const d = await gql(`query($a:String){ products(first:250, after:$a, query:"vendor:Knockaround"){ pageInfo{ hasNextPage endCursor } nodes{ id title tags } } }`, { a: after });
  for (const p of d.products.nodes) {
    const lg = leagueOf(p.title);
    if (!lg) continue;
    const want = ['team sunglasses', lg + ' sunglasses'].filter((t) => !p.tags.includes(t));
    if (want.length) tagPlan.push({ id: p.id, title: p.title, league: lg, add: want });
  }
  after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
} while (after);
const byLg = {}; tagPlan.forEach((t) => { byLg[t.league] = (byLg[t.league] || 0) + 1; });
console.log(`team products to tag: ${tagPlan.length}`, JSON.stringify(byLg));
console.log('  e.g. ' + tagPlan.slice(0, 5).map((t) => t.title + ' [' + t.league + ']').join(' | '));

// 2. Which collections already exist (never touched).
const existing = new Set();
for (const c of COLLECTIONS) { const d = await gql(`query($h:String!){ collectionByHandle(handle:$h){ id } }`, { h: c.handle }); if (d.collectionByHandle) existing.add(c.handle); }
for (const c of COLLECTIONS) console.log(`  ${existing.has(c.handle) ? 'exists, left alone' : 'CREATE'}  /collections/${c.handle}  ${c.title}`);
if (!APPLY) { console.log('dry run: nothing written. Add --apply to write.'); process.exit(0); }

const file = path.join(ROOT, `redesign-collections-rollback-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ tagsAdded: tagPlan.map(({ id, title, add }) => ({ id, title, add })) }, null, 1));
console.log('rollback saved:', path.basename(file));
let tagged = 0;
for (const t of tagPlan) {
  const d = await gql(`mutation($id:ID!,$tags:[String!]!){ tagsAdd(id:$id, tags:$tags){ userErrors{ message } } }`, { id: t.id, tags: t.add });
  if (d.tagsAdd.userErrors.length) console.log('TAG FAILED', t.title, JSON.stringify(d.tagsAdd.userErrors)); else tagged++;
}
console.log(`tagged ${tagged} of ${tagPlan.length}`);
const pubs = await gql(`{ publications(first:20){ nodes{ id name } } }`);
const online = pubs.publications.nodes.find((p) => /online store/i.test(p.name));
for (const c of COLLECTIONS) {
  if (existing.has(c.handle)) continue;
  const d = await gql(`mutation($input: CollectionInput!){ collectionCreate(input:$input){ collection{ id handle } userErrors{ field message } } }`,
    { input: { handle: c.handle, title: c.title, descriptionHtml: c.descriptionHtml, sortOrder: 'BEST_SELLING', ruleSet: { appliedDisjunctively: false, rules: c.rules } } });
  const e = d.collectionCreate.userErrors;
  if (e.length) { console.log('CREATE FAILED', c.handle, JSON.stringify(e)); continue; }
  const id = d.collectionCreate.collection.id;
  if (online) await gql(`mutation($id:ID!,$input:[PublicationInput!]!){ publishablePublish(id:$id, input:$input){ userErrors{ message } } }`, { id, input: [{ publicationId: online.id }] });
  console.log('created + published to Online Store:', c.handle);
}
