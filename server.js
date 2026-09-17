require('dotenv').config();

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3050);
const RAW_VAULT_ENV = String(process.env.OBSIDIAN_VAULT || '').trim().replace(/^['"]|['"]$/g, '');
const PROJECT_DIR = path.resolve(__dirname);

function isPlaceholderVault(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\\/g, '/');
  return !normalized || normalized === 'c:/path/to/obsidianvault' || normalized.includes('path/to/obsidianvault');
}

function detectVaultPath(startDir) {
  let current = path.resolve(startDir);
  for (let i = 0; i < 8; i += 1) {
    try {
      if (fs.existsSync(path.join(current, '.obsidian'))) return current;
    } catch {}
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return '';
}

const AUTO_VAULT_PATH = detectVaultPath(PROJECT_DIR);
const VAULT_ENV = isPlaceholderVault(RAW_VAULT_ENV) ? AUTO_VAULT_PATH : RAW_VAULT_ENV;
const VAULT_PATH = path.resolve(VAULT_ENV || '.');
const configuredBooksDir = String(process.env.BOOKS_DIR || 'Books').trim();
let BOOKS_DIR_NAME = configuredBooksDir;
if (isPlaceholderVault(RAW_VAULT_ENV) && AUTO_VAULT_PATH) {
  const relProject = path.relative(AUTO_VAULT_PATH, PROJECT_DIR);
  const projectBase = path.basename(PROJECT_DIR).toLowerCase();
  if (relProject && (projectBase === 'книги' || projectBase === 'books')) BOOKS_DIR_NAME = relProject;
}
const BOOKS_DIR = path.join(VAULT_PATH, BOOKS_DIR_NAME || 'Books');
const PDF_DIR = path.join(VAULT_PATH, process.env.PDF_DIR || 'Attachments', 'Books');
const ACHIEVEMENTS_FILE = path.join(VAULT_PATH, process.env.ACHIEVEMENTS_FILE || 'Achievements.md');
const BOOKROOM_DIR = path.join(VAULT_PATH, process.env.BOOKROOM_DIR || 'Bookroom');
const TOPICS_DIR = path.join(BOOKROOM_DIR, process.env.TOPICS_DIR || 'Topics');
const ACHIEVEMENTS_DIR = path.join(BOOKROOM_DIR, process.env.ACHIEVEMENTS_DIR || 'Achievements');
const FOLDERS_DIR = path.join(BOOKROOM_DIR, process.env.FOLDERS_DIR || 'Folders');
const GRAPH_FILE = path.join(VAULT_PATH, process.env.GRAPH_FILE || 'Bookroom/Graph.md');
const INDEX_FILE = path.join(VAULT_PATH, process.env.INDEX_FILE || 'Bookroom/Index.md');
const CANVAS_FILE = path.join(VAULT_PATH, process.env.CANVAS_FILE || 'Bookroom/Network.canvas');
const UPLOAD_TMP = path.join(__dirname, '.tmp');
const APP_CONFIG = {
  title: process.env.APP_TITLE || 'Bookroom',
  userName: process.env.USER_NAME || '',
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'ru',
  defaultTheme: process.env.DEFAULT_THEME || 'dark'
};

if (!VAULT_ENV) {
  console.error('Не найден Obsidian Vault. Укажи OBSIDIAN_VAULT в .env или запусти проект внутри Vault.');
  process.exit(1);
}

console.log(`Vault detected: ${VAULT_PATH}`);
console.log(`Books directory: ${BOOKS_DIR}`);

const app = express();
const eventClients = new Set();
let eventTimer = null;
function broadcastChange() {
  for (const res of eventClients) res.write(`data: ${JSON.stringify({ ts: Date.now() })}\n\n`);
}
function scheduleBroadcast() {
  clearTimeout(eventTimer);
  eventTimer = setTimeout(broadcastChange, 120);
}
const upload = multer({
  dest: UPLOAD_TMP,
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || path.extname(file.originalname).toLowerCase() === '.pdf';
    cb(ok ? null : new Error('Only PDF files are allowed.'), ok);
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/pdfjs', express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build')));
app.use('/pdf', express.static(PDF_DIR, { fallthrough: false, dotfiles: 'deny' }));

function safeName(name, fallback = `book-${Date.now()}`) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || fallback;
}

function safeFolder(folder) {
  const normalized = String(folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const parts = normalized.split('/').filter(Boolean).map(part => safeName(part, 'General'));
  return parts.join('/').slice(0, 240);
}

function slugify(text) {
  return safeName(text)
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || `book-${Date.now()}`;
}

function yamlValue(value) {
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(String(value ?? ''));
}

function normalizeTagName(value) {
  return String(value || '')
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-zа-я0-9_\-/]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function isSystemTag(tag) {
  const value = String(tag || '').toLowerCase();
  return value === 'book' || value === 'bookroom' || value.startsWith('status/') || value.startsWith('topic/') || value.startsWith('folder/');
}

function userTags(tags) {
  return normalizeTags(tags).filter(tag => !isSystemTag(tag));
}

function parseFrontmatter(text) {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  const data = {};
  if (!match) return { data, body: text };

  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      try { data[key] = JSON.parse(value); continue; } catch { /* fall through */ }
    }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      try { data[key] = value.startsWith('"') ? JSON.parse(value) : value.slice(1, -1); } catch { data[key] = value.slice(1, -1); }
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      data[key] = Number(value);
    } else {
      data[key] = value;
    }
  }
  return { data, body: text.slice(match[0].length) };
}

function today() { return new Date().toISOString().slice(0, 10); }

function buildMarkdown(book, body = '') {
  const cleanTags = userTags(book.tags);
  const systemTags = [
    'bookroom',
    'book',
    `status/${book.status || 'planned'}`,
    ...(cleanTags.map(tag => `topic/${tag}`)),
    ...normalizeFolders(book.folders ?? book.folder).map(folder => `folder/${normalizeTagName(folder.replace(/\//g, '-'))}`)
  ];
  const tags = [...new Set([...cleanTags, ...systemTags])];
  const generated = generatedBookLinks(book);
  return [
    '---',
    `title: ${yamlValue(book.title)}`,
    `author: ${yamlValue(book.author || '')}`,
    `progress: ${Math.round(book.progress ?? 0)}`,
    `pages: ${Number(book.pages || 0)}`,
    `currentPage: ${Number(book.currentPage || 0)}`,
    `status: ${yamlValue(book.status || 'planned')}`,
    `folders: ${yamlValue(normalizeFolders(book.folders ?? book.folder))}`,
    `tags: ${yamlValue(tags)}`,
    `pdf: ${yamlValue(book.pdf || '')}`,
    `added: ${yamlValue(book.added || today())}`,
    `lastRead: ${yamlValue(book.lastRead || today())}`,
    '---',
    '',
    mergeGeneratedSection(body, generated)
  ].join('\n');
}

const GENERATED_START = '<!-- BOOKROOM:START -->';
const GENERATED_END = '<!-- BOOKROOM:END -->';

function mergeGeneratedSection(body, section) {
  const cleanBody = String(body || '');
  const block = `${GENERATED_START}\n${section.trim()}\n${GENERATED_END}`;
  const re = new RegExp(`${GENERATED_START}[\\s\\S]*?${GENERATED_END}`);
  return re.test(cleanBody) ? cleanBody.replace(re, block) : `${cleanBody.trimEnd()}${cleanBody.trim() ? '\n\n' : ''}${block}\n`;
}

function vaultRelative(fullPath) {
  return path.relative(VAULT_PATH, fullPath).split(path.sep).join('/');
}

function wikiLink(vaultRelativePath, label) {
  const clean = String(vaultRelativePath).replace(/\.md$/i, '').split('\\').join('/');
  return `[[${clean}${label ? `|${String(label).replace(/[\[\]]/g, '')}` : ''}]]`;
}

function bookVaultPath(book) {
  return vaultRelative(path.join(BOOKS_DIR, book.file));
}

function achievementVaultPath(id) {
  return vaultRelative(path.join(ACHIEVEMENTS_DIR, `${id}.md`));
}

function topicVaultPath(id) {
  return vaultRelative(path.join(TOPICS_DIR, `${id}.md`));
}

function folderVaultPath(folder) {
  return vaultRelative(path.join(FOLDERS_DIR, `${normalizeTagName(folder || 'general')}.md`));
}

function generatedBookLinks(book) {
  const topicLinks = directionDefsForBook(book).map(d => wikiLink(topicVaultPath(d.id), d.label));
  const achievementLinks = achievementListCache(book).map(a => wikiLink(achievementVaultPath(a.id), a.title));
  const folderLinks = normalizeFolders(book.folders ?? book.folder).map(folder => wikiLink(folderVaultPath(folder), folder));
  const lines = [
    '### Bookroom',
    `- ${book.status === 'completed' ? '🏁' : '📚'} Status: **${book.status}**`,
    folderLinks.length ? `- Collections: ${folderLinks.join(', ')}` : '',
    topicLinks.length ? `- Topics: ${topicLinks.join(', ')}` : '',
    achievementLinks.length ? `- Achievements: ${achievementLinks.join(', ')}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

// This is intentionally a small pure helper used while writing the note.
// It is replaced by the full calculated achievement list once the definitions exist.
function achievementListCache(book) {
  const groups = Array.isArray(ACHIEVEMENT_DEFS) ? ACHIEVEMENT_DEFS : [];
  return groups.filter(a => a.kind === 'tagCompleted' && hasAnyTag(book, a.tags));
}

function directionDefsForBook(book) {
  return DIRECTION_DEFS.filter(d => hasAnyTag(book, d.tags));
}

function normalizeTags(tags) {
  const values = Array.isArray(tags) ? tags : String(tags || '').split(',');
  return [...new Set(values.map(normalizeTagName).filter(Boolean))];
}

function encodeKey(relativeFile) {
  return Buffer.from(relativeFile, 'utf8').toString('base64url');
}

function decodeKey(key) {
  try { return Buffer.from(String(key), 'base64url').toString('utf8'); } catch { return ''; }
}

function pdfServeUrl(pdfPath) {
  try {
    const absolute = path.resolve(VAULT_PATH, String(pdfPath).replace(/[/\\]/g, path.sep));
    if (!isPathInsideOrEqual(PDF_DIR, absolute)) return '';
    const rel = path.relative(PDF_DIR, absolute).split(path.sep).join('/');
    return '/pdf/' + rel.split('/').map(encodeURIComponent).join('/');
  } catch { return ''; }
}

function normalizeFolders(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(raw.map(safeFolder).filter(Boolean))];
}

function normalizeBook(fileName, data) {
  const relative = fileName.split(path.sep).join('/');
  const base = path.basename(fileName, '.md');
  const progress = Math.max(0, Math.min(100, Number(data.progress || 0)));
  const pages = Math.max(0, Number(data.pages || 0));
  let currentPage = Math.max(0, Number(data.currentPage || 0));
  if (pages) currentPage = Math.min(pages, currentPage);
  let status = data.status || (progress >= 100 ? 'completed' : progress > 0 ? 'reading' : 'planned');
  if (progress >= 100) status = 'completed';

  return {
    key: encodeKey(relative),
    id: relative,
    file: relative,
    title: data.title || base,
    author: data.author || '',
    progress,
    pages,
    currentPage,
    status,
    folders: normalizeFolders(data.folders ?? data.folder ?? path.dirname(relative).replace(/\\/g, '/').replace(/^\.$/, '')),
    folder: normalizeFolders(data.folders ?? data.folder ?? path.dirname(relative).replace(/\\/g, '/').replace(/^\.$/, ''))[0] || '',
    tags: userTags(data.tags),
    pdf: data.pdf || '',
    pdfUrl: data.pdf ? pdfServeUrl(data.pdf) : '',
    added: data.added || '',
    lastRead: data.lastRead || ''
  };
}

async function ensureVault() {
  await fsp.mkdir(BOOKS_DIR, { recursive: true });
  await fsp.mkdir(PDF_DIR, { recursive: true });
  await fsp.mkdir(UPLOAD_TMP, { recursive: true });
  await fsp.mkdir(BOOKROOM_DIR, { recursive: true });
  await fsp.mkdir(TOPICS_DIR, { recursive: true });
  await fsp.mkdir(ACHIEVEMENTS_DIR, { recursive: true });
  await fsp.mkdir(FOLDERS_DIR, { recursive: true });
  try { await fsp.access(ACHIEVEMENTS_FILE); }
  catch { await fsp.writeFile(ACHIEVEMENTS_FILE, '# Achievements\n\nNo achievements yet.\n', 'utf8'); }
}

async function walkMarkdown(dir, output = []) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const embeddedAppDir = path.resolve(dir) === path.resolve(PROJECT_DIR);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.tmp' || entry.name === '.logs') continue;
      await walkMarkdown(full, output);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      if (embeddedAppDir && entry.name.toLowerCase() === 'readme.md') continue;
      output.push(full);
    }
  }
  return output;
}

function relativeBookPath(fullPath) {
  return path.relative(BOOKS_DIR, fullPath);
}

function resolveBookByKey(key) {
  const relative = decodeKey(key).replace(/\\/g, '/');
  if (!relative || relative.startsWith('../') || relative.includes('/../') || path.isAbsolute(relative)) throw new Error('Invalid book key.');
  const filePath = path.resolve(BOOKS_DIR, relative);
  if (!isPathInsideOrEqual(BOOKS_DIR, filePath) || !filePath.toLowerCase().endsWith('.md')) throw new Error('Invalid book path.');
  return { relative, filePath };
}

async function readBooks() {
  const files = await walkMarkdown(BOOKS_DIR);
  const result = [];
  for (const filePath of files) {
    const text = await fsp.readFile(filePath, 'utf8');
    const { data } = parseFrontmatter(text);
    result.push(normalizeBook(relativeBookPath(filePath), data));
  }
  result.sort((a, b) => (b.lastRead || b.added || '').localeCompare(a.lastRead || a.added || ''));
  return result;
}

async function readFolders() {
  await fsp.mkdir(FOLDERS_DIR, { recursive: true });
  const entries = await fsp.readdir(FOLDERS_DIR, { withFileTypes: true });
  const folders = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
    const full = path.join(FOLDERS_DIR, entry.name);
    const text = await fsp.readFile(full, 'utf8');
    const { data } = parseFrontmatter(text);
    const name = String(data.name || data.title || entry.name.replace(/\.md$/i, '')).trim();
    if (name) folders.push({ id: entry.name.replace(/\.md$/i, ''), name });
  }
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

function folderFileForName(name) {
  return path.join(FOLDERS_DIR, `${normalizeTagName(name)}.md`);
}

const DIRECTION_DEFS = [
  { id:'programming', label:'Programmer', icon:'💻', tags:['programming','software','tech','coding'], target:3, text:'Завершить 3 книги по программированию и технологиям.' },
  { id:'frontend', label:'Frontend Wizard', icon:'🪄', tags:['frontend','web','html','css','javascript','react','vue'], target:3, text:'Завершить 3 книги по frontend и Web.' },
  { id:'backend', label:'Backend Architect', icon:'🧱', tags:['backend','api','nodejs','databases'], target:3, text:'Завершить 3 книги по backend, API и базам данных.' },
  { id:'cybersecurity', label:'Cyber Sentinel', icon:'🛡️', tags:['cybersecurity','security','infosec','networking'], target:3, text:'Завершить 3 книги по безопасности и сетям.' },
  { id:'ai', label:'AI Explorer', icon:'🤖', tags:['ai','ml','machine-learning','deep-learning'], target:3, text:'Завершить 3 книги по AI / ML.' },
  { id:'gamedev', label:'Game Master', icon:'🎮', tags:['gamedev','game-development','game-dev'], target:3, text:'Завершить 3 книги по разработке игр.' },
  { id:'science', label:'Gordon Freeman', icon:'⚛️', tags:['physics','science','math','mathematics','chemistry','biology'], target:2, text:'Завершить 2 книги по физике, математике или естественным наукам.' },
  { id:'history', label:'Хранитель времени', icon:'🏛️', tags:['history','historical','archaeology'], target:3, text:'Завершить 3 книги по истории и прошлому.' },
  { id:'philosophy', label:'Philosopher', icon:'🧠', tags:['philosophy','logic','ethics'], target:3, text:'Завершить 3 книги по философии, логике или этике.' },
  { id:'linguistics', label:'Linguist', icon:'🗣️', tags:['linguistics','language','languages','translation'], target:3, text:'Завершить 3 книги по языкам, лингвистике или переводу.' },
  { id:'psychology', label:'Mind Reader', icon:'🧠', tags:['psychology','neuroscience','self-development'], target:3, text:'Завершить 3 книги о мышлении, психологии или саморазвитии.' },
  { id:'business', label:'Entrepreneur', icon:'📈', tags:['business','entrepreneurship','startup','career'], target:3, text:'Завершить 3 книги по бизнесу, карьере или стартапам.' },
  { id:'finance', label:'Market Mind', icon:'💰', tags:['finance','economics','investing'], target:3, text:'Завершить 3 книги по финансам, экономике или инвестициям.' },
  { id:'design', label:'Designer', icon:'🎨', tags:['design','ui','ux','art'], target:3, text:'Завершить 3 книги по дизайну, UI/UX или искусству.' },
  { id:'literature', label:'Story Keeper', icon:'📚', tags:['fiction','literature','novel','poetry','biography'], target:5, text:'Завершить 5 художественных или литературных книг.' },
  { id:'devops', label:'DevOps Runner', icon:'⚙️', tags:['devops','docker','linux','cloud','operating-systems'], target:3, text:'Завершить 3 книги по DevOps, Linux и инфраструктуре.' },
  { id:'data-science', label:'Data Scientist', icon:'📊', tags:['data-science','data-analysis','statistics','math','mathematics'], target:3, text:'Завершить 3 книги по данным, статистике или анализу.' },
  { id:'robotics', label:'Robot Builder', icon:'🦾', tags:['robotics','ai','computer-vision','programming'], target:3, text:'Завершить 3 книги по робототехнике и интеллектуальным системам.' },
  { id:'productivity', label:'Time Keeper', icon:'⏱️', tags:['productivity','self-development','career','education'], target:3, text:'Завершить 3 книги о продуктивности, обучении и развитии.' },
  { id:'communication', label:'Communicator', icon:'💬', tags:['communication','leadership','management','psychology'], target:3, text:'Завершить 3 книги о коммуникации, лидерстве и управлении.' },
  { id:'marketing', label:'Product Mind', icon:'📣', tags:['marketing','product','sales','business'], target:3, text:'Завершить 3 книги о продукте, маркетинге или продажах.' },
  { id:'sociology', label:'Society Observer', icon:'🔎', tags:['sociology','anthropology','geography','history'], target:3, text:'Завершить 3 книги об обществе, культуре и человеческих сообществах.' }
];

const TAG_GROUPS_PLACEHOLDER = {
  programming:['programming','software','tech','coding'], frontend:['frontend','web','html','css','javascript','react','vue'], backend:['backend','api','nodejs','databases'], cybersecurity:['cybersecurity','security','infosec','networking'], ai:['ai','ml','machine-learning','deep-learning'], gamedev:['gamedev','game-development','game-dev'], science:['physics','science','math','mathematics','chemistry','biology'], history:['history','historical','archaeology'], philosophy:['philosophy','logic','ethics'], linguistics:['linguistics','language','languages','translation'], psychology:['psychology','neuroscience','self-development'], business:['business','entrepreneurship','startup','career'], finance:['finance','economics','investing'], design:['design','ui','ux','art'], literature:['fiction','literature','novel','poetry','biography'], devops:['devops','docker','linux','cloud','operating-systems'], 'data-science':['data-science','data-analysis','statistics','math','mathematics'], robotics:['robotics','ai','computer-vision','programming'], productivity:['productivity','self-development','career','education'], communication:['communication','leadership','management','psychology'], marketing:['marketing','product','sales','business'], sociology:['sociology','anthropology','geography','history']
};

const ACHIEVEMENT_DEFS = [
  { id:'first-step', icon:'🚀', title_ru:'Первый шаг', title_en:'First Step', text_ru:'Начать читать первую книгу.', text_en:'Start reading your first book.', kind:'global', target:1 },
  { id:'lambda-reader', icon:'λ', title_ru:'Читатель Лямбды', title_en:'Lambda Reader', text_ru:'Начать 3 книги.', text_en:'Start 3 books.', kind:'global', target:3 },
  { id:'black-mesa', icon:'⚛️', title_ru:'Чёрная Меза', title_en:'Black Mesa', text_ru:'Начать 5 книг.', text_en:'Start 5 books.', kind:'global', target:5 },
  { id:'freeman-route', icon:'🔬', title_ru:'Маршрут Фримена', title_en:"Freeman's Route", text_ru:'Прочитать 500 страниц.', text_en:'Read 500 pages.', kind:'pages', target:500 },
  { id:'headcrab-snack', icon:'🦀', title_ru:'Перекус для хедкраба', title_en:'Headcrab Snack', text_ru:'Прочитать 100 страниц.', text_en:'Read 100 pages.', kind:'pages', target:100 },
  { id:'lambda-1000', icon:'λ', title_ru:'Точка Лямбда', title_en:'Lambda Point', text_ru:'Прочитать 1 000 страниц.', text_en:'Read 1,000 pages.', kind:'pages', target:1000 },
  { id:'city-17', icon:'🏙️', title_ru:'Читатель из Сити-17', title_en:'Citizen of City 17', text_ru:'Прочитать 2 500 страниц.', text_en:'Read 2,500 pages.', kind:'pages', target:2500 },
  { id:'freeman-5000', icon:'🕶️', title_ru:'Не совсем обычный учёный', title_en:'Not Just Any Scientist', text_ru:'Прочитать 5 000 страниц.', text_en:'Read 5,000 pages.', kind:'pages', target:5000 },
  { id:'still-reading', icon:'🎧', title_ru:'Ещё читаю', title_en:'Still Reading', text_ru:'Дойти до 10% хотя бы в 5 книгах.', text_en:'Reach 10% in at least 5 books.', kind:'startedMany', target:5 },
  { id:'bookworm', icon:'📖', title_ru:'Книжный червь', title_en:'Bookworm', text_ru:'Завершить 1 книгу.', text_en:'Finish 1 book.', kind:'completed', target:1 },
  { id:'aperture-test', icon:'🧪', title_ru:'Испытание Апертуры', title_en:'Aperture Test Subject', text_ru:'Завершить 3 книги.', text_en:'Finish 3 books.', kind:'completed', target:3 },
  { id:'five-books', icon:'🏆', title_ru:'Пять книг', title_en:'Five Books', text_ru:'Завершить 5 книг.', text_en:'Finish 5 books.', kind:'completed', target:5 },
  { id:'ten-books', icon:'🎖️', title_ru:'Десять из десяти', title_en:'Ten Out of Ten', text_ru:'Завершить 10 книг.', text_en:'Finish 10 books.', kind:'completed', target:10 },
  { id:'still-alive', icon:'💙', title_ru:'Живой после теста', title_en:'Still Alive', text_ru:'Завершить книгу с PDF.', text_en:'Finish a book with a PDF attached.', kind:'completedPdf', target:1 },
  { id:'companion-cube', icon:'⬜', title_ru:'Куб-компаньон', title_en:'Companion Cube', text_ru:'Добавить 3 книги в одну коллекцию.', text_en:'Put 3 books into one collection.', kind:'maxFolder', target:3 },
  { id:'playlist-complete', icon:'📚', title_ru:'Коллекционный зал', title_en:'Collection Complete', text_ru:'Завершить 3 книги в одной коллекции.', text_en:'Finish 3 books in one collection.', kind:'completedFolder', target:3 },
  ...[
    ['programming','Протоколы Рэйвенхолма','Ravenholm Protocols','Завершить 2 книги по программированию и технологиям.','Finish 2 programming and technology books.',2,'💻'],
    ['frontend','Лаборатория интерфейсов Апертуры','Aperture UI Lab','Завершить 3 книги по фронтенду и веб-разработке.','Finish 3 frontend and Web books.',3,'🪄'],
    ['backend','Архитектура Лямбды','Lambda Architecture','Завершить 3 книги по бэкенду, API и базам данных.','Finish 3 backend, API and database books.',3,'🧱'],
    ['cybersecurity','Безопасность Чёрной Мезы','Black Mesa Security','Завершить 3 книги по безопасности и сетям.','Finish 3 security and networking books.',3,'🛡️'],
    ['ai','Исследовательское крыло ГЛаДОС','GLaDOS Research Wing','Завершить 3 книги по ИИ и машинному обучению.','Finish 3 AI / ML books.',3,'🤖'],
    ['gamedev','Ученик движка Исход','Source Engine Apprentice','Завершить 3 книги по разработке игр.','Finish 3 game development books.',3,'🎮'],
    ['science','Исследования Фримена','Freeman Research','Завершить 2 книги по физике, математике или естественным наукам.','Finish 2 science, math or physics books.',2,'⚛️'],
    ['history','Хранитель времени','Keeper of Time','Завершить 3 книги по истории и прошлому.','Finish 3 history books.',3,'🏛️'],
    ['philosophy','Вопросы вортигонта','Vortigaunt Questions','Завершить 3 книги по философии, логике или этике.','Finish 3 philosophy, logic or ethics books.',3,'🧠'],
    ['linguistics','Языковая лаборатория','Language Lab','Завершить 3 книги по языкам, лингвистике или переводу.','Finish 3 language, linguistics or translation books.',3,'🗣️'],
    ['psychology','Портал разума','Mind Portal','Завершить 3 книги о мышлении, психологии или саморазвитии.','Finish 3 psychology and self-development books.',3,'🧠'],
    ['business','Экономика костюма ЭОЗ','HEV Economics','Завершить 3 книги по бизнесу, карьере или стартапам.','Finish 3 business, career or startup books.',3,'📈'],
    ['finance','Фримен на рынке','Market Freeman','Завершить 3 книги по финансам, экономике или инвестициям.','Finish 3 finance, economics or investing books.',3,'💰'],
    ['design','Портал дизайна','Portal of Design','Завершить 3 книги по дизайну, UI/UX или искусству.','Finish 3 design, UI/UX or art books.',3,'🎨'],
    ['literature','История продолжается','The Story Continues','Завершить 5 художественных или литературных книг.','Finish 5 fiction or literature books.',5,'📚'],
    ['devops','Инфраструктура Альянса','Combine Infrastructure','Завершить 3 книги по DevOps, Linux и инфраструктуре.','Finish 3 DevOps, Linux or infrastructure books.',3,'⚙️'],
    ['data-science','Данные Апертуры','Data Aperture','Завершить 3 книги по данным, статистике или анализу.','Finish 3 data, statistics or analysis books.',3,'📊'],
    ['robotics','Робототехническая лаборатория','Robot Lab','Завершить 3 книги по робототехнике и интеллектуальным системам.','Finish 3 robotics and intelligent systems books.',3,'🦾'],
    ['productivity','Разведка глав','Scout the Chapters','Завершить 3 книги о продуктивности, обучении и развитии.','Finish 3 books about productivity, learning and growth.',3,'⏱️'],
    ['communication','Медик! Связь','Medic! Communication','Завершить 3 книги о коммуникации, лидерстве и управлении.','Finish 3 communication, leadership and management books.',3,'💬'],
    ['marketing','Продукт всё ещё жив','The Product Is Still Alive','Завершить 3 книги о продукте, маркетинге или продажах.','Finish 3 product, marketing or sales books.',3,'📣'],
    ['sociology','Никакой пощады невежеству','No Mercy for Ignorance','Завершить 3 книги об обществе, культуре и человеческих сообществах.','Finish 3 sociology, anthropology, geography or history books.',3,'🔎']
  ].map(([id,tr,te,xr,xe,target,icon])=>({id,icon,title_ru:tr,title_en:te,text_ru:xr,text_en:xe,kind:'tagCompleted',tags:[...(TAG_GROUPS_PLACEHOLDER[id]||[])],target})),
  { id:'polymath', icon:'🧩', title_ru:'Полимат', title_en:'Polymath', text_ru:'Завершить книги минимум в 5 разных тематических группах.', text_en:'Finish books across at least 5 different topic groups.', kind:'categories', target:5 },
  { id:'chapter-two', icon:'📚', title_ru:'Глава вторая', title_en:'Chapter Two', text_ru:'Начать читать 10 книг.', text_en:'Start reading 10 books.', kind:'global', target:10 },
  { id:'chapter-three', icon:'📚', title_ru:'Глава третья', title_en:'Chapter Three', text_ru:'Начать читать 20 книг.', text_en:'Start reading 20 books.', kind:'global', target:20 },
  { id:'portal-scholar', icon:'🌀', title_ru:'Учёный Апертуры', title_en:'Aperture Scholar', text_ru:'Завершить 10 книг.', text_en:'Finish 10 books.', kind:'completed', target:10 },
  { id:'portal-veteran', icon:'🌀', title_ru:'Ветеран испытаний', title_en:'Test Chamber Veteran', text_ru:'Завершить 25 книг.', text_en:'Finish 25 books.', kind:'completed', target:25 },
  { id:'source-scholar', icon:'🔧', title_ru:'Ученик движка Исход', title_en:'Source Scholar', text_ru:'Завершить 15 книг.', text_en:'Finish 15 books.', kind:'completed', target:15 },
  { id:'valve-time', icon:'⏳', title_ru:'Время по-валвовски', title_en:'Valve Time', text_ru:'Дойти до 50% хотя бы в 10 книгах.', text_en:'Reach 50% in at least 10 books.', kind:'progressCount', minProgress:50, target:10 },
  { id:'half-life', icon:'λ', title_ru:'Период полураспада', title_en:'Half-Life', text_ru:'Дойти до 50% хотя бы в 5 книгах.', text_en:'Reach 50% in at least 5 books.', kind:'progressCount', minProgress:50, target:5 },
  { id:'xen-expedition', icon:'🛸', title_ru:'Экспедиция на Зен', title_en:'Xen Expedition', text_ru:'Прочитать 2 000 страниц.', text_en:'Read 2,000 pages.', kind:'pages', target:2000 },
  { id:'xen-return', icon:'🛸', title_ru:'Возвращение с Зена', title_en:'Return from Xen', text_ru:'Прочитать 10 000 страниц.', text_en:'Read 10,000 pages.', kind:'pages', target:10000 },
  { id:'city17-tour', icon:'🏙️', title_ru:'Экскурсия по Сити-17', title_en:'City 17 Tour', text_ru:'Прочитать 3 500 страниц.', text_en:'Read 3,500 pages.', kind:'pages', target:3500 },
  { id:'ravenholm', icon:'🕯️', title_ru:'Ночь в Рэйвенхолме', title_en:'Night in Ravenholm', text_ru:'Дойти до 100% хотя бы в 5 книгах.', text_en:'Finish at least 5 books.', kind:'completed', target:5 },
  { id:'white-forest', icon:'🌲', title_ru:'Белый лес', title_en:'White Forest', text_ru:'Завершить 7 книг.', text_en:'Finish 7 books.', kind:'completed', target:7 },
  { id:'freeman-archive', icon:'🕶️', title_ru:'Архив Фримена', title_en:"Freeman's Archive", text_ru:'Накопить 25 000 прочитанных страниц.', text_en:'Read 25,000 pages.', kind:'pages', target:25000 },
  { id:'hev-suit', icon:'🦺', title_ru:'Костюм ЭОЗ активирован', title_en:'HEV Suit Online', text_ru:'Начать читать 3 книги и держать прогресс выше нуля.', text_en:'Start 3 books and keep their progress above zero.', kind:'global', target:3 },
  { id:'gravity-knowledge', icon:'🧲', title_ru:'Гравитация знаний', title_en:'Gravity of Knowledge', text_ru:'Прочитать 7 500 страниц.', text_en:'Read 7,500 pages.', kind:'pages', target:7500 },
  { id:'dog-approved', icon:'🤖', title_ru:'Одобрено Догом', title_en:'Dog Approved', text_ru:'Добавить 5 книг в коллекции.', text_en:'Place 5 books into collections.', kind:'shelvedBooks', target:5 },
  { id:'combine-shelter', icon:'🛡️', title_ru:'Укрытие от Альянса', title_en:'Combine Shelter', text_ru:'Добавить 10 книг в коллекции.', text_en:'Place 10 books into collections.', kind:'shelvedBooks', target:10 },
  { id:'aperture-archive', icon:'🧪', title_ru:'Архив испытаний', title_en:'Aperture Archive', text_ru:'Создать 3 разные коллекции, используя их для книг.', text_en:'Use 3 different collections for books.', kind:'folderCount', target:3 },
  { id:'playlist-master', icon:'📋', title_ru:'Мастер плейлистов', title_en:'Playlist Master', text_ru:'Использовать 5 разных коллекций.', text_en:'Use 5 different collections.', kind:'folderCount', target:5 },
  { id:'weighted-cube', icon:'⬜', title_ru:'Куб знаний', title_en:'Weighted Knowledge Cube', text_ru:'Добавить одну книгу сразу в 2 коллекции.', text_en:'Put one book into 2 collections.', kind:'multiCollection', target:2 },
  { id:'multiworld', icon:'🧭', title_ru:'Между мирами', title_en:'Between Worlds', text_ru:'Добавить одну книгу сразу в 3 коллекции.', text_en:'Put one book into 3 collections.', kind:'multiCollection', target:3 },
  { id:'tf2-scout', icon:'🏃', title_ru:'Скаут', title_en:'Scout', text_ru:'Дойти до 10% хотя бы в 10 книгах.', text_en:'Reach 10% in at least 10 books.', kind:'progressCount', minProgress:10, target:10 },
  { id:'tf2-medic', icon:'💉', title_ru:'Медик!', title_en:'Medic!', text_ru:'Завершить 12 книг.', text_en:'Finish 12 books.', kind:'completed', target:12 },
  { id:'tf2-engineer', icon:'🔨', title_ru:'Инженер', title_en:'Engineer', text_ru:'Довести до 100% 15 книг.', text_en:'Finish 15 books.', kind:'completed', target:15 },
  { id:'tf2-spy', icon:'🕵️', title_ru:'Шпион', title_en:'Spy', text_ru:'Накопить 15 разных пользовательских тегов.', text_en:'Collect 15 different user tags.', kind:'uniqueTags', target:15 },
  { id:'tf2-heavy', icon:'📕', title_ru:'Тяжёлый читатель', title_en:'Heavy Reader', text_ru:'Прочитать 15 000 страниц.', text_en:'Read 15,000 pages.', kind:'pages', target:15000 },
  { id:'black-mesa-clearance', icon:'🔐', title_ru:'Допуск Чёрной Мезы', title_en:'Black Mesa Clearance', text_ru:'Завершить книги в 5 разных тематических направлениях.', text_en:'Finish books across 5 topic groups.', kind:'categories', target:5 },
  { id:'lambda-stack', icon:'λ', title_ru:'Стек Лямбды', title_en:'Lambda Stack', text_ru:'Завершить 20 книг.', text_en:'Finish 20 books.', kind:'completed', target:20 },
  { id:'vortigaunt', icon:'🔮', title_ru:'Совет вортигонта', title_en:'Vortigaunt Counsel', text_ru:'Завершить книги в 8 разных тематических направлениях.', text_en:'Finish books across 8 topic groups.', kind:'categories', target:8 },
  { id:'zen-reader', icon:'🧘', title_ru:'Дзен-читатель', title_en:'Zen Reader', text_ru:'Прочитать 30 000 страниц.', text_en:'Read 30,000 pages.', kind:'pages', target:30000 },
  { id:'library-keeper', icon:'🗝️', title_ru:'Хранитель библиотеки', title_en:'Library Keeper', text_ru:'Добавить 50 книг.', text_en:'Have 50 books in the library.', kind:'booksTotal', target:50 },
  { id:'library-lord', icon:'👑', title_ru:'Повелитель полок', title_en:'Lord of the Shelves', text_ru:'Добавить 100 книг.', text_en:'Have 100 books in the library.', kind:'booksTotal', target:100 },
  { id:'pdf-harvester', icon:'📄', title_ru:'Собиратель PDF', title_en:'PDF Harvester', text_ru:'Добавить PDF к 10 книгам.', text_en:'Attach PDFs to 10 books.', kind:'booksWithPdf', target:10 },
  { id:'pdf-veteran', icon:'📑', title_ru:'Ветеран PDF', title_en:'PDF Veteran', text_ru:'Иметь PDF у 25 книг.', text_en:'Have PDFs attached to 25 books.', kind:'booksWithPdf', target:25 },
  { id:'author-collector', icon:'✒️', title_ru:'Коллекционер авторов', title_en:'Author Collector', text_ru:'Собрать книги минимум 10 разных авторов.', text_en:'Collect books from at least 10 authors.', kind:'uniqueAuthors', target:10 },
  { id:'topic-tourist', icon:'🗺️', title_ru:'Турист по темам', title_en:'Topic Tourist', text_ru:'Завершить книги в 10 разных тематических направлениях.', text_en:'Finish books across 10 topic groups.', kind:'categories', target:10 },
  { id:'tag-smuggler', icon:'🏷️', title_ru:'Контрабандист тегов', title_en:'Tag Smuggler', text_ru:'Собрать 25 разных пользовательских тегов.', text_en:'Collect 25 different user tags.', kind:'uniqueTags', target:25 },
  { id:'tag-baron', icon:'🎖️', title_ru:'Барон тегов', title_en:'Tag Baron', text_ru:'Собрать 40 разных пользовательских тегов.', text_en:'Collect 40 different user tags.', kind:'uniqueTags', target:40 },
  { id:'rich-metadata', icon:'🧬', title_ru:'Генетик метаданных', title_en:'Metadata Geneticist', text_ru:'Иметь 10 книг минимум с 3 тегами каждая.', text_en:'Have 10 books with at least 3 tags each.', kind:'tagRichBooks', minTags:3, target:10 },
  { id:'long-haul', icon:'📜', title_ru:'Дальний забег', title_en:'Long Haul', text_ru:'Иметь 5 книг объёмом 500+ страниц.', text_en:'Have 5 books with 500+ pages.', kind:'longBooks', minPages:500, target:5 },
  { id:'deep-dive', icon:'🤿', title_ru:'Глубокое погружение', title_en:'Deep Dive', text_ru:'Дойти до 1000-й страницы в одной книге.', text_en:'Reach page 1,000 in a single book.', kind:'maxSingleBookPages', target:1000 },
  { id:'chapter-one-hundred', icon:'💯', title_ru:'Глава за главой', title_en:'Page Hundred', text_ru:'Дойти до 100% хотя бы в 10 книгах.', text_en:'Finish at least 10 books.', kind:'completed', target:10 },
  { id:'alyx-cache', icon:'🧰', title_ru:'Схрон Аликс', title_en:"Alyx's Cache", text_ru:'Добавить PDF к 5 книгам и поместить их в коллекции.', text_en:'Attach PDFs to 5 books and place them in collections.', kind:'booksWithPdfAndFolder', target:5 },
  { id:'borealis', icon:'🚢', title_ru:'Борей', title_en:'Borealis', text_ru:'Иметь 30 книг в библиотеке.', text_en:'Have 30 books in the library.', kind:'booksTotal', target:30 },
  { id:'antlion', icon:'🐜', title_ru:'Рабочий муравьин-лев', title_en:'Antlion Worker', text_ru:'Начать 15 книг.', text_en:'Start 15 books.', kind:'global', target:15 },
  { id:'strider-step', icon:'🦵', title_ru:'Шаг страйдера', title_en:'Strider Step', text_ru:'Прочитать 4 000 страниц.', text_en:'Read 4,000 pages.', kind:'pages', target:4000 },
  { id:'hounds-eye', icon:'👁️', title_ru:"Взгляд хундия", title_en:"Houndeye's Gaze", text_ru:'Дойти до 25% хотя бы в 15 книгах.', text_en:'Reach 25% in at least 15 books.', kind:'progressCount', minProgress:25, target:15 },
  { id:'lamarr', icon:'🕷️', title_ru:'Ламарр одобряет', title_en:'Lamarr Approves', text_ru:'Прочитать 750 страниц.', text_en:'Read 750 pages.', kind:'pages', target:750 },
  { id:'black-box', icon:'⬛', title_ru:'Чёрный ящик', title_en:'Black Box', text_ru:'Читать 10 книг без прикреплённого PDF.', text_en:'Read 10 books without an attached PDF.', kind:'booksWithoutPdfStarted', target:10 } ,
  { id:'tag-hoarder', icon:'#', title_ru:'Собиратель тегов', title_en:'Tag Hoarder', text_ru:'Накопить 10 разных пользовательских тегов.', text_en:'Collect 10 different user tags.', kind:'uniqueTags', target:10 },
  { id:'astronomy-observer', icon:'🔭', title_ru:'Наблюдатель звёзд', title_en:'Stargazer', text_ru:'Завершить 3 книги по астрономии и космосу.', text_en:'Finish 3 astronomy and space books.', kind:'tagCompleted', tags:['astronomy','science'], target:3 },
  { id:'chem-lab', icon:'🧪', title_ru:'Химическая лаборатория', title_en:'Chem Lab', text_ru:'Завершить 3 книги по химии.', text_en:'Finish 3 chemistry books.', kind:'tagCompleted', tags:['chemistry'], target:3 },
  { id:'bio-lab', icon:'🧬', title_ru:'Биолаборатория', title_en:'Bio Lab', text_ru:'Завершить 3 книги по биологии и нейронаукам.', text_en:'Finish 3 biology and neuroscience books.', kind:'tagCompleted', tags:['biology','neuroscience'], target:3 },
  { id:'network-core', icon:'🌐', title_ru:'Сетевое ядро', title_en:'Network Core', text_ru:'Завершить 3 книги по сетям и протоколам.', text_en:'Finish 3 networking and protocol books.', kind:'tagCompleted', tags:['networking'], target:3 },
  { id:'database-vault', icon:'🗄️', title_ru:'Хранилище данных', title_en:'Database Vault', text_ru:'Завершить 3 книги по базам данных.', text_en:'Finish 3 database books.', kind:'tagCompleted', tags:['databases','postgresql','mongodb','redis'], target:3 },
  { id:'cloud-runner', icon:'☁️', title_ru:'Покоритель облака', title_en:'Cloud Runner', text_ru:'Завершить 3 книги по облакам и инфраструктуре.', text_en:'Finish 3 cloud and infrastructure books.', kind:'tagCompleted', tags:['cloud','devops'], target:3 }
];

for (const achievement of ACHIEVEMENT_DEFS) { achievement.title = achievement.title_ru; achievement.text = achievement.text_ru; }

const TAG_GROUPS = Object.fromEntries(DIRECTION_DEFS.map(d => [d.id, d.tags]));

function hasAnyTag(book, tags) { return book.tags.some(tag => tags.includes(tag)); }

function calculateAchievement(a, books) {
  const completed = books.filter(b => b.progress >= 100);
  let value = 0;
  switch (a.kind) {
    case 'global': value = books.filter(b => b.progress > 0).length; break;
    case 'booksTotal': value = books.length; break;
    case 'startedMany': value = books.filter(b => b.progress >= 10).length; break;
    case 'completed': value = completed.length; break;
    case 'completedPdf': value = completed.filter(b => b.pdf).length; break;
    case 'pages': value = books.reduce((sum, b) => sum + Number(b.currentPage || 0), 0); break;
    case 'tagCompleted': value = completed.filter(b => hasAnyTag(b, a.tags)).length; break;
    case 'categories': value = Object.values(TAG_GROUPS).filter(group => completed.some(b => hasAnyTag(b, group))).length; break;
    case 'uniqueTags': value = new Set(books.flatMap(b => b.tags)).size; break;
    case 'uniqueAuthors': value = new Set(books.map(b => String(b.author||'').trim().toLowerCase()).filter(Boolean)).size; break;
    case 'booksWithPdf': value = books.filter(b => b.pdf).length; break;
    case 'booksWithoutPdfStarted': value = books.filter(b => !b.pdf && Number(b.progress||0) > 0).length; break;
    case 'booksWithPdfAndFolder': value = books.filter(b => b.pdf && normalizeFolders(b.folders ?? b.folder).length > 0).length; break;
    case 'folderCount': value = new Set(books.flatMap(b => normalizeFolders(b.folders ?? b.folder))).size; break;
    case 'shelvedBooks': value = books.filter(b => normalizeFolders(b.folders ?? b.folder).length > 0).length; break;
    case 'multiCollection': value = Math.max(0, ...books.map(b => normalizeFolders(b.folders ?? b.folder).length)); break;
    case 'tagRichBooks': value = books.filter(b => b.tags.length >= Number(a.minTags || 3)).length; break;
    case 'longBooks': value = books.filter(b => Number(b.pages||0) >= Number(a.minPages || 300)).length; break;
    case 'progressCount': value = books.filter(b => Number(b.progress||0) >= Number(a.minProgress || 50)).length; break;
    case 'maxSingleBookPages': value = Math.max(0, ...books.map(b => Number(b.currentPage||0))); break;
    case 'maxSingleBookProgress': value = Math.max(0, ...books.map(b => Number(b.progress||0))); break;
    case 'maxFolder': { const counts = {}; for (const b of books) for (const f of normalizeFolders(b.folders ?? b.folder)) counts[f] = (counts[f] || 0) + 1; value = Math.max(0, ...Object.values(counts)); break; }
    case 'completedFolder': { const counts = {}; for (const b of completed) for (const f of normalizeFolders(b.folders ?? b.folder)) counts[f] = (counts[f] || 0) + 1; value = Math.max(0, ...Object.values(counts)); break; }
  }
  return { ...a, value, unlocked: value >= a.target };
}

function achievementList(books) { return ACHIEVEMENT_DEFS.map(a => calculateAchievement(a, books)); }

function obsidianLink(book) {
  const noExt = book.file.replace(/\.md$/i, '').split('/').join('/');
  return `[[Books/${noExt}|${book.title.replace(/\]/g, '')}]]`;
}

async function writeTextFile(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, content, 'utf8');
}

function mermaidSafe(text) {
  return String(text || '').replace(/\"/g, "'").replace(/[\r\n]+/g, ' ').slice(0, 120);
}

function graphId(prefix, value, index=0) {
  const base = normalizeTagName(value).replace(/[^a-z0-9_-]/gi, '_').slice(0, 45) || 'node';
  return `${prefix}_${base}_${index}`;
}

async function writeCanvasNetwork(books, achievements) {
  const completed = books.filter(b => b.progress >= 100);
  const nodes = [];
  const edges = [];
  const nodeMap = new Map();
  const makeId = (kind, value) => crypto.createHash('sha1').update(`${kind}:${value}`).digest('hex').slice(0, 12);
  const addNode = node => { if (!nodeMap.has(node.id)) { nodes.push(node); nodeMap.set(node.id, node); } return node.id; };
  const addEdge = (fromNode, toNode, fromSide='right', toSide='left') => {
    const id = makeId('edge', `${fromNode}:${toNode}:${fromSide}:${toSide}`);
    if (!edges.some(e => e.id === id)) edges.push({ id, fromNode, toNode, fromSide, toSide });
  };

  const hubId = addNode({ id: makeId('hub','bookroom'), type:'text', x:0, y:0, width:360, height:150, text:'# 📚 Bookroom\\n\nКниги × темы × достижения × папки' });
  const topicIds = new Map();
  DIRECTION_DEFS.forEach((d, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(DIRECTION_DEFS.length,1);
    const id = addNode({ id:makeId('topic',d.id), type:'text', x:Math.round(Math.cos(angle)*760), y:Math.round(Math.sin(angle)*520), width:240, height:105, text:`# ${d.icon} ${d.label}\\n\\n${d.booksCount || books.filter(b => hasAnyTag(b,d.tags)).length} книг · ${completed.filter(b => hasAnyTag(b,d.tags)).length}/${d.target} закрыто` });
    topicIds.set(d.id,id);
    addEdge(hubId,id,angle > Math.PI ? 'left' : 'right', angle > Math.PI ? 'right' : 'left');
  });

  const folderIds = new Map();
  [...new Set(books.flatMap(b=>normalizeFolders(b.folders ?? b.folder)))].sort().forEach((folder,i)=>{
    const id=addNode({id:makeId('folder',folder),type:'text',x:1050,y:-520+i*145,width:240,height:90,text:`# 📁 ${folder}\\n\\n${books.filter(b=>normalizeFolders(b.folders ?? b.folder).includes(folder)).length} книг`});
    folderIds.set(folder,id);
    addEdge(hubId,id,'right','left');
  });

  const unlockedOrStarted = achievements.filter(a=>a.unlocked || a.value>0);
  const achIds = new Map();
  unlockedOrStarted.forEach((a,i)=>{
    const id=addNode({id:makeId('achievement',a.id),type:'text',x:-1100,y:-560+i*125,width:260,height:100,text:`# ${a.icon} ${a.title}\\n\\n${Math.min(a.value,a.target)}/${a.target} · ${a.unlocked ? '✅ unlocked' : 'progress'}`});
    achIds.set(a.id,id);
    addEdge(hubId,id,'left','right');
  });

  books.forEach((b,i)=>{
    const directions = directionDefsForBook(b);
    const direction = directions[0];
    const topicIndex = direction ? DIRECTION_DEFS.findIndex(d=>d.id===direction.id) : i % Math.max(DIRECTION_DEFS.length,1);
    const col = i % 4;
    const row = Math.floor(i/4);
    const x = -620 + col*340 + ((topicIndex%2)*40);
    const y = 780 + row*220;
    const bid=addNode({id:makeId('book',b.file),type:'file',x,y,width:285,height:155,file:bookVaultPath(b)});
    if (direction && topicIds.has(direction.id)) addEdge(topicIds.get(direction.id),bid,'bottom','top');
    if (!direction) addEdge(hubId,bid,'bottom','top');
    normalizeFolders(b.folders ?? b.folder).forEach(folder => { if (folderIds.has(folder)) addEdge(folderIds.get(folder),bid,'left','right'); });
    directions.slice(0,5).forEach(d=>{
      if(topicIds.has(d.id) && d.id!==direction?.id) addEdge(topicIds.get(d.id),bid,'bottom','top');
    });
    achievements.filter(a=>a.kind==='tagCompleted' && hasAnyTag(b,a.tags) && achIds.has(a.id)).forEach(a=>addEdge(achIds.get(a.id),bid,'right','left'));
  });

  const canvas = { nodes, edges };
  await writeTextFile(CANVAS_FILE, JSON.stringify(canvas, null, 2));
}

async function writeObsidianNetwork(books, achievements) {
  const completed = books.filter(b => b.progress >= 100);
  const directionData = DIRECTION_DEFS.map(d => ({
    ...d,
    books: books.filter(b => hasAnyTag(b, d.tags)),
    completed: completed.filter(b => hasAnyTag(b, d.tags))
  }));

  await writeTextFile(INDEX_FILE, [
    '---',
    'type: bookroom-index',
    'tags: [bookroom, library]',
    '---', '',
    '# 📚 Bookroom', '',
    'Центральный узел книжной базы. Все связи создаются автоматически из книг, тегов, направлений, папок и достижений.', '',
    `- ${wikiLink(vaultRelative(INDEX_FILE), 'Bookroom Index')}`,
    `- ${wikiLink(vaultRelative(GRAPH_FILE), '🕸️ Bookroom Graph')}`,
    `- ${wikiLink(vaultRelative(ACHIEVEMENTS_FILE), '🏆 Achievements')}`, '',
    '## Направления', '',
    ...directionData.map(d => `- ${wikiLink(topicVaultPath(d.id), `${d.icon} ${d.label}`)} — ${d.books.length} книг`), '',
    '## Книги', '',
    ...(books.length ? books.map(b => `- ${wikiLink(bookVaultPath(b), b.title)}`) : ['- Пока нет книг.']), '',
    '> Открой Graph View в Obsidian и включи отображение тегов, чтобы увидеть полную паутину.'
  ].join('\n'));

  for (const d of directionData) {
    const lines = [
      '---',
      `type: ${yamlValue('topic')}`,
      `tags: ${yamlValue(['bookroom', 'topic', `topic/${d.id}`, ...d.tags.map(x => `topic/${x}`)])}`,
      '---', '',
      `# ${d.icon} ${d.label}`, '',
      `Прогресс достижения: **${d.completed.length}/${d.target}**`, '',
      '## Книги', '',
      d.books.length ? d.books.map(b => `- ${wikiLink(bookVaultPath(b), b.title)} — ${b.progress}%`).join('\n') : '- Пока нет книг этого направления.', ''
    ];
    await writeTextFile(path.join(TOPICS_DIR, `${d.id}.md`), lines.join('\n'));
  }

  for (const a of achievements) {
    const matching = a.kind === 'tagCompleted' ? completed.filter(b => hasAnyTag(b, a.tags)) : [];
    const lines = [
      '---',
      `type: ${yamlValue('achievement')}`,
      `tags: ${yamlValue(['bookroom', 'achievement', `achievement/${a.id}`])}`,
      '---', '',
      `# ${a.icon} ${a.title}`, '',
      `**${Math.min(a.value, a.target)}/${a.target}** — ${a.text}`, '',
      '## Связанные книги', '',
      matching.length ? matching.map(b => `- ${wikiLink(bookVaultPath(b), b.title)} — ${b.progress}%`).join('\n') : '- Книг пока недостаточно.', ''
    ];
    await writeTextFile(path.join(ACHIEVEMENTS_DIR, `${a.id}.md`), lines.join('\n'));
  }

  const folderNames = [...new Set(books.flatMap(b => normalizeFolders(b.folders ?? b.folder)))].sort();
  const storedFolders = await readFolders();
  const folders = [...new Set([...storedFolders.map(f => f.name), ...folderNames])].sort();
  for (const folder of folders) {
    const folderBooks = books.filter(b => normalizeFolders(b.folders ?? b.folder).includes(folder));
    await writeTextFile(path.join(FOLDERS_DIR, `${normalizeTagName(folder)}.md`), [
      '---',
      `type: ${yamlValue('folder')}`,
      `tags: ${yamlValue(['bookroom', 'folder', `folder/${normalizeTagName(folder.replace(/\//g, '-'))}`])}`,
      '---', '',
      `# 📁 ${folder}`, '',
      ...folderBooks.map(b => `- ${wikiLink(bookVaultPath(b), b.title)} — ${b.progress}%`), ''
    ].join('\n'));
  }

  const nodes = ['flowchart LR', '  HUB([📚 Bookroom])'];
  directionData.forEach((d, i) => {
    const did = graphId('topic', d.id, i);
    nodes.push(`  ${did}[${d.icon} ${mermaidSafe(d.label)}]`);
    nodes.push(`  HUB --> ${did}`);
    d.books.forEach((b, j) => {
      const bid = graphId('book', `${d.id}-${b.file}`, j);
      nodes.push(`  ${bid}(${mermaidSafe(b.title)})`);
      nodes.push(`  ${did} --> ${bid}`);
    });
  });
  achievements.filter(a => a.unlocked || a.value > 0).forEach((a, i) => {
    const aid = graphId('ach', a.id, i);
    nodes.push(`  ${aid}{${a.icon} ${mermaidSafe(a.title)}}`);
    nodes.push(`  HUB -.-> ${aid}`);
  });
  if (!directionData.some(d => d.books.length)) nodes.push('  EMPTY[Добавь книги — граф появится автоматически]');

  const graphContent = [
    '# 🕸️ Bookroom Graph', '',
    'Это динамическая карта книжной базы. Сервер обновляет её при изменении библиотеки.', '',
    '## Mermaid-паутина', '',
    '```mermaid',
    ...nodes,
    '```', '',
    '## Native Obsidian Graph', '',
    'Для максимально подробной паутины открой Graph View → включи **Show tags**. Книги используют системные теги `#book`, `#status/*`, `#topic/*`, `#folder/*`, а достижения — `#achievement/*`.', '',
    `- ${wikiLink(vaultRelative(INDEX_FILE), '← Bookroom Index')}`
  ].join('\n');
  await writeTextFile(GRAPH_FILE, graphContent);
  await writeCanvasNetwork(books, achievements);
}

async function writeAchievements(books) {
  const achievements = achievementList(books);
  const unlocked = achievements.filter(a => a.unlocked);
  const lines = [
    '# 🏆 Достижения', '',
    `Обновлено: ${today()}`, '',
    '## Получено', '',
    unlocked.length
      ? unlocked.map(a => `- ${a.icon} **${a.title}** — ${a.text}`).join('\n')
      : '- Пока нет достижений.', '',
    '## Все достижения', '',
    ...achievements.map(a => `- ${a.unlocked ? '✅' : '⬜'} ${a.icon} **${a.title}** — ${a.text} (${Math.min(a.value, a.target)}/${a.target})`),
    '',
    '## Книги по направлениям', '',
    ...DIRECTION_DEFS.map(d => {
      const groupBooks = books.filter(b => hasAnyTag(b, d.tags));
      return `### ${d.icon} ${d.label}\n${groupBooks.length ? groupBooks.map(b => wikiLink(bookVaultPath(b), b.title)).join(', ') : '- Пока пусто.'}`;
    }),
    '',
    `→ ${wikiLink(vaultRelative(GRAPH_FILE), '🕸️ Открыть карту связей')}`,
    ''
  ];
  await fsp.writeFile(ACHIEVEMENTS_FILE, lines.join('\n'), 'utf8');
  await writeObsidianNetwork(books, achievements);
  return achievements;
}

async function uniqueBookFile(folder, baseName) {
  const folderPath = path.join(BOOKS_DIR, ...safeFolder(folder).split('/').filter(Boolean));
  await fsp.mkdir(folderPath, { recursive: true });
  let fileName = `${slugify(baseName)}.md`;
  let counter = 2;
  while (true) {
    try { await fsp.access(path.join(folderPath, fileName)); fileName = `${slugify(baseName)}-${counter++}.md`; }
    catch { return path.join(folder, fileName).split(path.sep).join('/'); }
  }
}

function getPdfRelative(fileName) { return vaultRelative(path.join(PDF_DIR, fileName)); }
function isPathInsideOrEqual(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
function buildPdfName(bookId, originalName) { return `${slugify(bookId)}-${slugify(originalName)}.pdf`; }

async function getBookFromKey(key) {
  const { relative, filePath } = resolveBookByKey(key);
  const text = await fsp.readFile(filePath, 'utf8');
  const parsed = parseFrontmatter(text);
  return { relative, filePath, text, parsed, book: normalizeBook(relative, parsed.data) };
}

app.get('/api/config', (_req, res) => {
  res.json({ ...APP_CONFIG, port: PORT, vaultName: path.basename(VAULT_PATH), graphFile: vaultRelative(GRAPH_FILE), canvasFile: vaultRelative(CANVAS_FILE), indexFile: vaultRelative(INDEX_FILE) });
});

app.get('/api/books', async (_req, res) => {
  try {
    const books = await readBooks();
    const achievements = achievementList(books);
    const folders = await readFolders();
    const stats = {
      books: books.length,
      reading: books.filter(b => b.status === 'reading').length,
      completed: books.filter(b => b.progress >= 100).length,
      pages: books.reduce((sum, b) => sum + Number(b.currentPage || 0), 0),
      avgProgress: books.length ? Math.round(books.reduce((s, b) => s + b.progress, 0) / books.length) : 0,
      folders: folders.map(f => f.name),
      tags: [...new Set(books.flatMap(b => b.tags))].sort()
    };
    res.json({ books, achievements, stats, folders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ connected: true })}\n\n`);
  eventClients.add(res);
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25000);
  res.on('close', () => { clearInterval(keepAlive); eventClients.delete(res); });
});

app.get('/api/folders', async (_req, res) => {
  try { res.json({ folders: await readFolders() }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/folders', async (req, res) => {
  try {
    const name = safeFolder(req.body.name || '');
    if (!name) return res.status(400).json({ error: 'Введите название коллекции.' });
    const existing = await readFolders();
    if (existing.some(f => f.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ error: 'Такая коллекция уже существует.' });
    const file = folderFileForName(name);
    await fsp.writeFile(file, ['---',`type: ${yamlValue('folder')}`,`name: ${yamlValue(name)}`,`tags: ${yamlValue(['bookroom','folder',`folder/${normalizeTagName(name.replace(/\//g, '-'))}`])}`,'---','','# 📁 '+name,'','- Коллекция создана из Bookroom.',''].join('\n'),'utf8');
    const folders = await readFolders();
    scheduleBroadcast();
    res.json({ ok: true, folder: { id: path.basename(file,'.md'), name }, folders });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/books', async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const author = String(req.body.author || '').trim();
    const folder = '';
    const tags = normalizeTags(req.body.tags);
    const currentPage = Math.max(0, Number(req.body.currentPage || 0));
    if (!title) return res.status(400).json({ error: 'Введите название книги.' });

    const relativeFile = await uniqueBookFile(folder, title);
    const fileName = relativeFile.split('/').pop();
    const mdPath = path.join(BOOKS_DIR, relativeFile);
    const book = { title, author, folders: [], tags, pages: 0, currentPage, progress: 0, status: currentPage > 0 ? 'reading' : 'planned', added: today(), lastRead: today(), pdf: '' };
    await fsp.writeFile(mdPath, buildMarkdown(book), 'utf8');
    scheduleBroadcast();
    res.json({ ok: true, book: normalizeBook(relativeFile, book), fileName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/books/:key', async (req, res) => {
  try {
    const item = await getBookFromKey(req.params.key);
    const data = { ...item.parsed.data };

    if (req.body.title !== undefined) data.title = String(req.body.title).trim();
    if (req.body.author !== undefined) data.author = String(req.body.author).trim();
    if (req.body.pages !== undefined) data.pages = Math.max(0, Number(req.body.pages || 0));
    if (req.body.currentPage !== undefined) data.currentPage = Math.max(0, Number(req.body.currentPage || 0));
    if (req.body.progress !== undefined) data.progress = Math.max(0, Math.min(100, Number(req.body.progress || 0)));
    if (req.body.folders !== undefined) data.folders = normalizeFolders(req.body.folders);
    else if (req.body.folder !== undefined) data.folders = normalizeFolders(req.body.folder);
    if (req.body.tags !== undefined) data.tags = normalizeTags(req.body.tags);
    if (req.body.status !== undefined) data.status = String(req.body.status);

    if (req.body.currentPage !== undefined || req.body.progress !== undefined) data.lastRead = today();
    if (Number(data.pages) > 0 && req.body.currentPage !== undefined && req.body.progress === undefined) {
      data.progress = Math.round((Number(data.currentPage) / Number(data.pages)) * 100);
    }
    if (Number(data.progress) >= 100) { data.progress = 100; data.status = 'completed'; }
    else if (Number(data.progress) > 0 || Number(data.currentPage) > 0) data.status = 'reading';
    else data.status = 'planned';

    await fsp.writeFile(item.filePath, buildMarkdown(data, item.parsed.body), 'utf8');
    const books = await readBooks();
    const achievements = await writeAchievements(books);
    scheduleBroadcast();
    res.json({ ok: true, book: books.find(b => b.id === item.relative), achievements });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/books/bulk-collections', async (req, res) => {
  try {
    const keys = Array.isArray(req.body.keys) ? req.body.keys.map(String).filter(Boolean) : [];
    const foldersToAdd = normalizeFolders(req.body.folders);
    if (!keys.length) return res.status(400).json({ error: 'Не выбраны книги.' });
    if (!foldersToAdd.length) return res.status(400).json({ error: 'Не выбраны коллекции.' });

    let updated = 0;
    for (const key of keys) {
      try {
        const item = await getBookFromKey(key);
        const data = { ...item.parsed.data };
        const current = normalizeFolders(data.folders ?? data.folder);
        data.folders = [...new Set([...current, ...foldersToAdd])];
        await fsp.writeFile(item.filePath, buildMarkdown(data, item.parsed.body), 'utf8');
        updated += 1;
      } catch (error) {
        console.warn('Bulk collection update skipped:', key, error.message);
      }
    }

    const books = await readBooks();
    const achievements = await writeAchievements(books);
    scheduleBroadcast();
    res.json({ ok: true, updated, achievements });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/books/bulk-delete', async (req, res) => {
  try {
    const keys = Array.isArray(req.body.keys) ? req.body.keys.map(String).filter(Boolean) : [];
    if (!keys.length) return res.status(400).json({ error: 'Не выбраны книги.' });

    const deleted = [];
    for (const key of keys) {
      try {
        const item = await getBookFromKey(key);
        await fsp.unlink(item.filePath);
        deleted.push(key);
      } catch (error) {
        console.warn('Bulk delete skipped:', key, error.message);
      }
    }

    const books = await readBooks();
    const achievements = await writeAchievements(books);
    scheduleBroadcast();
    res.json({ ok: true, keys: deleted, achievements });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/books/:key', async (req, res) => {
  try {
    const item = await getBookFromKey(req.params.key);
    await fsp.unlink(item.filePath);
    const books = await readBooks();
    const achievements = await writeAchievements(books);
    scheduleBroadcast();
    res.json({ ok: true, achievements });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/books/:key/pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF-файл не получен.' });
    const item = await getBookFromKey(req.params.key);
    const original = path.basename(req.file.originalname, '.pdf');
    const targetName = buildPdfName(item.book.id.replace(/[^a-zа-я0-9]+/gi, '-'), original);
    const targetPath = path.join(PDF_DIR, targetName);
    await fsp.rename(req.file.path, targetPath);
    const data = { ...item.parsed.data, pdf: getPdfRelative(targetName) };
    await fsp.writeFile(item.filePath, buildMarkdown(data, item.parsed.body), 'utf8');
    scheduleBroadcast();
    res.json({ ok: true, pdf: data.pdf });
  } catch (error) {
    if (req.file?.path) await fsp.rm(req.file.path, { force: true }).catch(() => {});
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/books/:key/pdf', async (req, res) => {
  try {
    const item = await getBookFromKey(req.params.key);
    const data = { ...item.parsed.data, pdf: '' };
    await fsp.writeFile(item.filePath, buildMarkdown(data, item.parsed.body), 'utf8');
    const books = await readBooks();
    const achievements = await writeAchievements(books);
    scheduleBroadcast();
    res.json({ ok: true, book: books.find(b => b.id === item.relative), achievements, deletedFile: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/import-multiple', upload.array('pdfs', 100), async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  try {
    if (!files.length) return res.status(400).json({ error: 'Выберите PDF.' });

    const imported = [];
    for (const file of files) {
      try {
        const originalBase = path.basename(file.originalname, path.extname(file.originalname));
        const title = String(originalBase || 'Новая книга').trim() || 'Новая книга';
        const relativeFile = await uniqueBookFile('', title);
        const pdfName = buildPdfName(path.basename(relativeFile, '.md'), originalBase || title);
        const targetPath = path.join(PDF_DIR, pdfName);
        await fsp.rename(file.path, targetPath);
        const book = { title, author:'', folders:[], tags:[], pages:0, currentPage:0, progress:0, status:'planned', added:today(), lastRead:today(), pdf:getPdfRelative(pdfName) };
        await fsp.writeFile(path.join(BOOKS_DIR, relativeFile), buildMarkdown(book), 'utf8');
        imported.push(relativeFile);
      } catch (error) {
        if (file.path) await fsp.rm(file.path, { force:true }).catch(()=>{});
        console.warn('Multi import skipped:', file.originalname, error.message);
      }
    }

    const books = await readBooks();
    const achievements = await writeAchievements(books);
    scheduleBroadcast();
    res.json({ ok:true, imported:imported.length, files:imported, achievements });
  } catch (error) {
    for (const file of files) if (file?.path) await fsp.rm(file.path, { force:true }).catch(()=>{});
    res.status(500).json({ error:error.message });
  }
});

app.post('/api/import', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Выберите PDF.' });
    const originalBase = path.basename(req.file.originalname, '.pdf');
    const title = String(req.body.title || originalBase).trim();
    const author = String(req.body.author || '').trim();
    const folder = '';
    const tags = normalizeTags(req.body.tags);
    const currentPage = Math.max(0, Number(req.body.currentPage || 0));
    const relativeFile = await uniqueBookFile(folder, title);
    const pdfName = buildPdfName(path.basename(relativeFile, '.md'), originalBase);
    const targetPath = path.join(PDF_DIR, pdfName);
    await fsp.rename(req.file.path, targetPath);
    const book = { title, author, folders: [], tags, pages: 0, currentPage, progress: 0, status: currentPage > 0 ? 'reading' : 'planned', added: today(), lastRead: today(), pdf: getPdfRelative(pdfName) };
    await fsp.writeFile(path.join(BOOKS_DIR, relativeFile), buildMarkdown(book), 'utf8');
    const books = await readBooks();
    const achievements = await writeAchievements(books);
    scheduleBroadcast();
    res.json({ ok: true, book: books.find(b => b.id === relativeFile), achievements });
  } catch (error) {
    if (req.file?.path) await fsp.rm(req.file.path, { force: true }).catch(() => {});
    res.status(500).json({ error: error.message });
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ error: error.message || 'Ошибка запроса.' });
});

ensureVault()
  .then(() => {
    try {
      fs.watch(BOOKS_DIR, { recursive: true }, (_event, fileName) => {
        if (fileName) scheduleBroadcast();
      });
    } catch (error) {
      console.warn('Vault file watch unavailable:', error.message);
    }
    app.listen(PORT, () => {
      console.log(`Book Dashboard: http://localhost:${PORT}`);
      console.log(`Obsidian vault: ${VAULT_PATH}`);
    });
  })
  .catch(error => {
    console.error('Failed to prepare vault:', error);
    process.exit(1);
  });
