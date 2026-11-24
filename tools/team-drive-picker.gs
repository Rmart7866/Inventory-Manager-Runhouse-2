/**
 * tools/team-drive-picker.gs, The Run House (2026-11-24). NOT run by node:
 * this is the Apps Script deployed as a web app in the Google account that
 * can see the team logo folder. Paste it into script.google.com, add the
 * Drive API service, set the DRIVE_KEY script property, deploy as Web app
 * (Execute as: Me, Who has access: Anyone). The Worker's DRIVE_SCRIPT_URL is
 * that deployment's /exec URL and its DRIVE_KEY the same key.
 *
 * Team stores: "From Drive" on the staff page. READ ONLY, and only for the
 * team logo folder and what is inside it. Only our Worker calls it, with a
 * key kept in Script properties (never in this code).
 *
 * Needs the Drive API service turned on: in the editor, Services (+) >
 * Drive API > Add. It answers a whole search in one request, where the plain
 * DriveApp calls looked each file up one at a time (17 s for "canton").
 */
var ROOT = '1MDZXODwl3BeglppGIEEggpwCjY4Fbab0';
var MAX_RESULTS = 60;
var MAX_FILE = 25 * 1024 * 1024;
var FOLDER = 'application/vnd.google-apps.folder';
var ALL = { supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'allDrives' };

function doGet(e) {
  var p = (e && e.parameter) || {};
  var key = PropertiesService.getScriptProperties().getProperty('DRIVE_KEY');
  if (!key || p.key !== key) return out({ error: 'not allowed' });
  if (typeof Drive === 'undefined') return out({ error: 'Turn on the Drive API service in the script editor (Services, Drive API, Add).' });
  try {
    if (p.action === 'list') return out(list(p.folder || ROOT));
    if (p.action === 'search') return out(search(String(p.q || '')));
    if (p.action === 'thumb') return out(thumb(p.id));
    if (p.action === 'file') return out(file(p.id));
    return out({ error: 'unknown action' });
  } catch (err) {
    return out({ error: String((err && err.message) || err).slice(0, 200) });
  }
}

function out(o) {
  var t = ContentService.createTextOutput(JSON.stringify(o));
  t.setMimeType(ContentService.MimeType.JSON);
  return t;
}

function opts(extra) {
  var o = {};
  for (var k in ALL) o[k] = ALL[k];
  for (var j in extra) o[j] = extra[j];
  return o;
}

// Every folder under the logo folder: { id: [name, parentId] }. Built from ONE
// listing of every folder the account can see (a few requests of 1000), then
// kept for 6 hours, split across cache entries because one holds ~100 KB.
var TREE = null;
function tree(fresh) {
  if (TREE && !fresh) return TREE;
  var cache = CacheService.getScriptCache();
  if (!fresh) {
    var n = Number(cache.get('tree_n') || 0);
    if (n) {
      var keys = [];
      for (var k = 0; k < n; k++) keys.push('tree_' + k);
      var parts = cache.getAll(keys), json = '', whole = true;
      for (var m = 0; m < n; m++) { if (parts['tree_' + m] == null) { whole = false; break; } json += parts['tree_' + m]; }
      if (whole) { TREE = JSON.parse(json); return TREE; }
    }
  }
  var all = {}, token = null;
  do {
    var r = Drive.Files.list(opts({ q: "mimeType = '" + FOLDER + "' and trashed = false", fields: 'nextPageToken, files(id, name, parents)', pageSize: 1000, pageToken: token }));
    (r.files || []).forEach(function (f) { all[f.id] = [f.name, (f.parents || [])[0] || null]; });
    token = r.nextPageToken;
  } while (token);
  // Keep only the folders whose chain of parents reaches ROOT.
  TREE = {};
  TREE[ROOT] = ['Team logos', null];
  var verdict = {};
  verdict[ROOT] = true;
  var under = function (id) {
    var chain = [], cur = id;
    for (var d = 0; cur && d < 20; d++) {
      if (verdict.hasOwnProperty(cur)) break;
      chain.push(cur);
      cur = all[cur] ? all[cur][1] : null;
    }
    var v = !!(cur && verdict[cur]);
    for (var i = 0; i < chain.length; i++) verdict[chain[i]] = v;
    return v;
  };
  for (var id in all) if (under(id)) TREE[id] = all[id];
  saveTree();
  return TREE;
}
function saveTree() {
  var json = JSON.stringify(TREE), size = 90000, put = {}, n = 0;
  for (var i = 0; i < json.length; i += size) put['tree_' + (n++)] = json.slice(i, i + size);
  put.tree_n = String(n);
  CacheService.getScriptCache().putAll(put, 21600);
}

// Is this parent folder under the logo folder? A folder made since the tree
// was built triggers ONE rebuild, so a new team folder still works at once.
var REBUILT = false;
function inTree(parentId) {
  var t = tree();
  if (t.hasOwnProperty(parentId)) return true;
  if (REBUILT) return false;
  REBUILT = true;
  return tree(true).hasOwnProperty(parentId);
}
function pathFrom(parentId) {
  var t = tree(), names = [], id = parentId;
  for (var d = 0; id && id !== ROOT && t[id] && d < 20; d++) { names.unshift(t[id][0]); id = t[id][1]; }
  return names.join(' / ');
}
// "thumb" is Drive's own small preview link, sized to 240 px, so the page can
// show every result's picture at once instead of asking for each file (each
// of those took 2 to 6 s and came back as the whole logo, 2026-11-24).
function info(f) {
  var t = f.thumbnailLink ? String(f.thumbnailLink).replace(/=s\d+$/, '=s240') : '';
  return { id: f.id, name: f.name, mime: f.mimeType, size: Number(f.size || 0), updated: f.modifiedTime, thumb: t };
}
var FIELDS = 'nextPageToken, files(id, name, mimeType, size, modifiedTime, parents, thumbnailLink)';

// One folder's contents, for browsing.
function list(id) {
  if (id !== ROOT && !inTree(id)) return { error: 'not in the team folder' };
  var folders = [], files = [], token = null;
  do {
    var r = Drive.Files.list(opts({ q: "'" + id + "' in parents and trashed = false", fields: FIELDS, pageSize: 1000, pageToken: token }));
    (r.files || []).forEach(function (f) {
      if (f.mimeType === FOLDER) folders.push({ id: f.id, name: f.name });
      else files.push(info(f));
    });
    token = r.nextPageToken;
  } while (token);
  folders.sort(function (a, b) { return a.name.localeCompare(b.name); });
  files.sort(function (a, b) { return a.name.localeCompare(b.name); });
  var t = tree(), path = [], cur = id;
  for (var d = 0; cur && d < 20; d++) {
    path.unshift({ id: cur, name: cur === ROOT ? 'Team logos' : (t[cur] ? t[cur][0] : '') });
    if (cur === ROOT || !t[cur]) break;
    cur = t[cur][1];
  }
  return { folder: id, path: path, folders: folders, files: files };
}

// Every word typed must be in the name; the first word goes to Drive's own
// index, the rest are checked here, and only files under the logo folder count.
function search(q) {
  var words = q.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 0; });
  if (!words.length) return { files: [] };
  var first = words[0].split('\\').join('\\\\').split("'").join("\\'");
  var hits = [], token = null, pages = 0;
  do {
    var r = Drive.Files.list(opts({ q: "name contains '" + first + "' and trashed = false and mimeType != '" + FOLDER + "'", fields: FIELDS, pageSize: 500, pageToken: token }));
    (r.files || []).forEach(function (f) {
      if (hits.length >= MAX_RESULTS) return;
      var n = f.name.toLowerCase();
      for (var i = 0; i < words.length; i++) if (n.indexOf(words[i]) < 0) return;
      var parent = (f.parents || []).filter(function (p) { return tree().hasOwnProperty(p); })[0];
      if (!parent) return;
      var x = info(f);
      x.where = pathFrom(parent);
      hits.push(x);
    });
    token = r.nextPageToken;
    pages++;
  } while (token && hits.length < MAX_RESULTS && pages < 4);
  // Folders whose name has every word typed, from the remembered tree, so a
  // search for a team shows its folders as well as its files (no extra call).
  var t = tree(), folders = [];
  for (var id in t) {
    if (id === ROOT) continue;
    var fn = String(t[id][0]).toLowerCase(), ok = true;
    for (var k = 0; k < words.length; k++) if (fn.indexOf(words[k]) < 0) { ok = false; break; }
    if (ok) folders.push({ id: id, name: t[id][0], where: pathFrom(t[id][1]) });
    if (folders.length >= 30) break;
  }
  folders.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return { files: hits, folders: folders };
}

function fileOk(id) {
  var f = Drive.Files.get(id, { fields: 'id, name, mimeType, size, parents', supportsAllDrives: true });
  var ok = (f.parents || []).some(function (p) { return inTree(p); });
  return ok ? f : null;
}

function thumb(id) {
  if (!fileOk(id)) return { error: 'not in the team folder' };
  var b = DriveApp.getFileById(id).getThumbnail();
  if (!b) return { none: true };
  return { mime: b.getContentType() || 'image/png', data: Utilities.base64Encode(b.getBytes()) };
}

function file(id) {
  var f = fileOk(id);
  if (!f) return { error: 'not in the team folder' };
  if (Number(f.size || 0) > MAX_FILE) return { error: 'too big for a logo (' + Math.round(Number(f.size) / 1048576) + ' MB)' };
  return { name: f.name, mime: f.mimeType, data: Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()) };
}

// Run this from the editor: builds the folder tree fresh and times a search.
function testSearch() {
  var t0 = Date.now();
  Logger.log(Object.keys(tree(true)).length + ' folders in the logo folder, listed in ' + (Date.now() - t0) + ' ms');
  t0 = Date.now();
  var r = search('canton');
  Logger.log(r.files.length + ' found for canton in ' + (Date.now() - t0) + ' ms');
}
