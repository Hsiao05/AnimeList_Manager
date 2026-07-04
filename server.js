import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "anime.json");
const OUTPUT_DIR = path.join(__dirname, "outputs");
const EXCEL_FILE = path.join(OUTPUT_DIR, "anime.xlsx");
const PUBLIC_DIR = path.join(__dirname, "public");
const BGM_API = "https://api.bgm.tv";
const BGM_WEB = "https://bgm.tv";

const requestHeaders = {
  "User-Agent": "bangumi-anime-manager/0.2 (local personal anime tracker)",
  Accept: "application/json, text/html;q=0.9, */*;q=0.8"
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

const statusOrder = ["已看", "正在看", "想看", "没看完", "搁置", "放弃"];
const statusAliases = {
  看过: "已看",
  已看: "已看",
  在看: "正在看",
  正在看: "正在看",
  想看: "想看",
  没看完: "没看完",
  搁置: "搁置",
  抛弃: "放弃",
  放弃: "放弃"
};

function normalizeNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toYear(dateText) {
  const match = String(dateText || "").match(/(\d{4})/);
  return match ? match[1] : "";
}

function toMonth(dateText) {
  const match = String(dateText || "").match(/\d{4}[-年/.](\d{1,2})/);
  return match ? Number(match[1]) : 0;
}

function toSeason(dateText) {
  const match = String(dateText || "").match(/\d{4}[-年/.](\d{1,2})/);
  if (!match) return "";
  const month = Number(match[1]);
  const namedSeasons = new Map([
    [1, "春"],
    [4, "夏"],
    [7, "秋"],
    [10, "冬"]
  ]);
  return namedSeasons.get(month) || `${month}月`;
}

function seasonRank(item) {
  const month = toMonth(item.airDate);
  if (month) return month;
  const season = String(item.season || "");
  const named = { 春: 1, 夏: 4, 秋: 7, 冬: 10 };
  if (named[season]) return named[season];
  const match = season.match(/(\d{1,2})月/);
  return match ? Number(match[1]) : 0;
}

function toEpisodeText(subject) {
  const apiValue = normalizeNumber(subject?.eps ?? subject?.total_episodes);
  if (apiValue !== null) return String(apiValue);
  const textValue = infoboxValue(subject, ["话数", "集数", "Episodes"]);
  if (!textValue) return "";
  const match = textValue.match(/\d+/);
  return match ? match[0] : textValue;
}

function excelRange(rowCount, columnCount) {
  return `A1:${columnName(columnCount - 1)}${Math.max(rowCount, 1)}`;
}

function excelValue(item, key) {
  if (key === "tagsText") return (item.tags || []).join(", ");
  if (key === "castText") return castToText(item.cast);
  if (key === "directorText") return item.director?.name || item.director || "";
  return item[key] ?? "";
}

function normalizeEpisodeText(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
  const match = text.match(/\d+/);
  return match ? match[0] : text;
}

function normalizeSeasonValue(item) {
  if (item.airDate) return toSeason(item.airDate) || item.season || "";
  const season = String(item.season || "");
  if (/^\d{4}[-/.]\d{1,2}$/.test(season)) return toSeason(season);
  return season;
}

function normalizeAirMonthValue(item) {
  return toMonth(item.airDate) || seasonRank(item);
}

function normalizeAirYearValue(item) {
  return item.year || toYear(item.airDate);
}

function normalizeAirInfo(item) {
  return {
    ...item,
    year: item.year || toYear(item.airDate),
    season: normalizeSeasonValue(item),
    episodes: normalizeEpisodeText(item.episodes)
  };
}

function compareAnime(a, b) {
  const yearDiff = Number(b.year || 0) - Number(a.year || 0);
  if (yearDiff) return yearDiff;
  const monthDiff = normalizeAirMonthValue(b) - normalizeAirMonthValue(a);
  if (monthDiff) return monthDiff;
  return String(a.titleCn || a.titleOriginal || "").localeCompare(String(b.titleCn || b.titleOriginal || ""), "zh-CN");
}

function buildAirFields(subject) {
  const airDate = subject.date || "";
  return {
    year: toYear(airDate),
    season: toSeason(airDate),
    airDate,
    episodes: toEpisodeText(subject)
  };
}

function normalizeStatus(value) {
  return statusAliases[value] || "已看";
}

function normalizeDirectorValue(item) {
  return typeof item.director === "object" ? item.director : { name: item.director || "", url: item.directorUrl || "" };
}

function normalizeCastEntry(entry) {
  if (typeof entry === "string") {
    const [role, actorText = ""] = entry.split(/[:：]/);
    return {
      role: role?.trim() || entry,
      roleUrl: "",
      actors: actorText
        .split(/[,，、]/)
        .map((name) => ({ name: name.trim(), url: "" }))
        .filter((actor) => actor.name)
    };
  }
  return {
    role: entry.role || "",
    roleUrl: entry.roleUrl || "",
    actors: Array.isArray(entry.actors) ? entry.actors : []
  };
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textFromInfoboxValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => entry?.v || entry?.value || entry)
      .filter(Boolean)
      .join(" / ");
  }
  return String(value || "");
}

function infoboxValue(subject, keys) {
  const box = Array.isArray(subject?.infobox) ? subject.infobox : [];
  for (const item of box) {
    if (item && keys.includes(item.key)) return textFromInfoboxValue(item.value);
  }
  return "";
}

function bangumiPersonUrl(id) {
  return id ? `${BGM_WEB}/person/${id}` : "";
}

function bangumiCharacterUrl(id) {
  return id ? `${BGM_WEB}/character/${id}` : "";
}

function pickTopTags(subject, scrapedTags = []) {
  const apiTags = Array.isArray(subject?.tags)
    ? subject.tags.map((tag) => ({ name: tag.name || tag, count: Number(tag.count || 0) }))
    : [];
  const merged = [...apiTags, ...scrapedTags.map((name) => ({ name, count: 0 }))];
  const seen = new Set();
  return merged
    .filter((tag) => {
      const name = String(tag.name || "").trim();
      if (!name || seen.has(name)) return false;
      seen.add(name);
      tag.name = name;
      return true;
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((tag) => tag.name);
}

async function ensureFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

function normalizeSavedItem(item) {
  return withScoreDiff({
    ...normalizeAirInfo(item),
    status: normalizeStatus(item.status),
    director: normalizeDirectorValue(item),
    cast: (item.cast || []).map(normalizeCastEntry),
    tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag).trim()).filter(Boolean) : []
  });
}

async function readDatabase() {
  await ensureFiles();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.map(normalizeSavedItem) : [];
  } catch {
    return [];
  }
}

async function writeDatabase(items) {
  await ensureFiles();
  const sorted = [...items].map(normalizeSavedItem).sort(compareAnime);
  await fs.writeFile(DATA_FILE, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  await writeExcel(sorted);
  return sorted;
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function zipEntries(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  const stamp = dosDateTime();

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    parts.push(local, compressed);

    const header = Buffer.alloc(46 + name.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(stamp.time, 12);
    header.writeUInt16LE(stamp.date, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    name.copy(header, 46);
    central.push(header);
    offset += local.length + compressed.length;
  }

  const centralOffset = offset;
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

function columnName(index) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function cellXml(value, ref) {
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
}

function castToText(cast) {
  return (cast || [])
    .map((entry) => {
      if (typeof entry === "string") return entry;
      const actors = (entry.actors || []).map((actor) => actor.name).filter(Boolean).join(", ");
      return actors ? `${entry.role}: ${actors}` : entry.role;
    })
    .filter(Boolean)
    .join("\n");
}

async function writeExcel(items) {
  const columns = [
    ["中文Title", "titleCn"],
    ["原名Title", "titleOriginal"],
    ["放送年", "year"],
    ["集数", "episodes"],
    ["制作公司", "studio"],
    ["导演", "directorText"],
    ["bangumi标签", "tagsText"],
    ["bangumi评分", "bangumiScore"],
    ["个人评分", "personalScore"],
    ["评分差", "scoreDiff"],
    ["个人评论", "comment"],
    ["Bangumi ID", "bangumiId"],
    ["放送季度", "season"],
    ["观看状态", "status"],
    ["重要角色及其配音", "castText"]
  ];
  const rows = [
    columns.map(([header]) => header),
    ...items.map((item) => columns.map(([, key]) => excelValue(item, key)))
  ];
  const range = excelRange(rows.length, columns.length);

  const sheetData = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row.map((value, colIndex) => cellXml(value, `${columnName(colIndex)}${rowNumber}`)).join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${range}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetData>${sheetData}</sheetData>
  <autoFilter ref="${range}"/>
</worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Anime" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const zip = zipEntries([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/worksheets/sheet1.xml", data: worksheet }
  ]);
  await fs.writeFile(EXCEL_FILE, zip);
}

async function bangumiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...requestHeaders, ...(options.headers || {}) }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Bangumi 请求失败 ${response.status}: ${text.slice(0, 120)}`);
  }
  return response;
}

async function searchBangumi(keyword) {
  const response = await bangumiFetch(`${BGM_API}/v0/search/subjects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, sort: "match", filter: { type: [2] } })
  });
  const payload = await response.json();
  const list = Array.isArray(payload?.data) ? payload.data : [];
  return list.slice(0, 12).map((item) => ({
    id: item.id,
    name: item.name,
    name_cn: item.name_cn,
    date: item.date,
    image: item.images?.medium || item.images?.common || "",
    score: item.rating?.score ?? null,
    rank: item.rank ?? null,
    summary: item.summary || ""
  }));
}

async function getSubject(id) {
  const response = await bangumiFetch(`${BGM_API}/v0/subjects/${id}`);
  return response.json();
}

async function getPersons(id) {
  try {
    const response = await bangumiFetch(`${BGM_API}/v0/subjects/${id}/persons`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function getCharacters(id) {
  try {
    const response = await bangumiFetch(`${BGM_API}/v0/subjects/${id}/characters`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function scrapeSubjectPage(id) {
  try {
    const response = await bangumiFetch(`${BGM_WEB}/subject/${id}`, {
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    const html = await response.text();
    const tags = [];
    const tagBlock = html.match(/标注为[\s\S]*?<div class="inner">([\s\S]*?)<\/div>/);
    if (tagBlock) {
      for (const match of tagBlock[1].matchAll(/<span[^>]*>(.*?)<\/span>/g)) {
        const text = match[1].replace(/<[^>]+>/g, "").trim();
        if (text) tags.push(text);
      }
    }
    return { tags };
  } catch {
    return { tags: [] };
  }
}

function personName(person) {
  return person?.name_cn || person?.name || person?.person?.name_cn || person?.person?.name || "";
}

function personId(person) {
  return person?.id || person?.person?.id || "";
}

function characterName(entry) {
  return entry?.name_cn || entry?.name || entry?.character?.name_cn || entry?.character?.name || "";
}

function characterId(entry) {
  return entry?.id || entry?.character?.id || "";
}

function findDirector(subject, persons) {
  const fromPersons = persons.find((person) => {
    const relation = String(person.relation || "").trim();
    return ["导演", "監督", "监督", "总导演", "総監督", "Director"].includes(relation);
  });
  const name = personName(fromPersons) || infoboxValue(subject, ["导演", "監督", "监督", "总导演"]);
  return { name, url: bangumiPersonUrl(personId(fromPersons)) };
}

function normalizeCast(characters) {
  return characters
    .slice(0, 10)
    .map((entry) => {
      const role = characterName(entry);
      const actors = entry?.actors || entry?.persons || [];
      return {
        role,
        roleUrl: bangumiCharacterUrl(characterId(entry)),
        actors: Array.isArray(actors)
          ? actors
              .map((actor) => ({ name: personName(actor), url: bangumiPersonUrl(personId(actor)) }))
              .filter((actor) => actor.name)
              .slice(0, 3)
          : []
      };
    })
    .filter((entry) => entry.role);
}

async function buildMetadata(id) {
  const [subject, persons, characters, scraped] = await Promise.all([
    getSubject(id),
    getPersons(id),
    getCharacters(id),
    scrapeSubjectPage(id)
  ]);
  return {
    bangumiId: subject.id,
    titleCn: subject.name_cn || subject.name || "",
    titleOriginal: subject.name || subject.name_cn || "",
    ...buildAirFields(subject),
    studio: infoboxValue(subject, ["动画制作", "动画制片", "制作", "制作公司"]),
    director: findDirector(subject, persons),
    tags: pickTopTags(subject, scraped.tags),
    bangumiScore: normalizeNumber(subject.rating?.score),
    rank: subject.rank ?? null,
    summary: subject.summary || "",
    image: subject.images?.large || subject.images?.medium || subject.images?.common || "",
    cast: normalizeCast(characters),
    sourceUrl: `${BGM_WEB}/subject/${subject.id}`
  };
}

function withScoreDiff(item) {
  const personal = normalizeNumber(item.personalScore);
  const bgm = normalizeNumber(item.bangumiScore);
  const scoreDiff = personal !== null && bgm !== null ? Number((personal - bgm).toFixed(2)) : null;
  return { ...item, personalScore: personal, bangumiScore: bgm, scoreDiff };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/anime") return sendJson(res, 200, await readDatabase());

  if (req.method === "GET" && url.pathname === "/api/excel") {
    const data = await fs.readFile(EXCEL_FILE);
    res.writeHead(200, {
      "Content-Type": mimeTypes[".xlsx"],
      "Content-Disposition": 'attachment; filename="anime.xlsx"'
    });
    return res.end(data);
  }

  if (req.method === "GET" && url.pathname === "/api/search") {
    const keyword = url.searchParams.get("q")?.trim();
    return sendJson(res, 200, keyword ? await searchBangumi(keyword) : []);
  }

  const subjectMatch = url.pathname.match(/^\/api\/subject\/(\d+)$/);
  if (req.method === "GET" && subjectMatch) return sendJson(res, 200, await buildMetadata(subjectMatch[1]));

  if (req.method === "POST" && url.pathname === "/api/anime") {
    const incoming = withScoreDiff(await readJsonBody(req));
    if (!incoming.bangumiId) incoming.bangumiId = `manual-${Date.now()}`;
    const items = await readDatabase();
    const index = items.findIndex((item) => String(item.bangumiId) === String(incoming.bangumiId));
    const saved = normalizeSavedItem({
      status: "已看",
      comment: "",
      tags: [],
      cast: [],
      updatedAt: new Date().toISOString(),
      isManual: String(incoming.bangumiId).startsWith("manual-"),
      ...incoming
    });
    if (index >= 0) items[index] = { ...items[index], ...saved };
    else items.push(saved);
    const sorted = await writeDatabase(items);
    return sendJson(res, 200, sorted.find((item) => String(item.bangumiId) === String(incoming.bangumiId)));
  }

  const animeMatch = url.pathname.match(/^\/api\/anime\/([^/]+)$/);
  if (animeMatch && req.method === "PATCH") {
    const animeId = decodeURIComponent(animeMatch[1]);
    const items = await readDatabase();
    const index = items.findIndex((item) => String(item.bangumiId) === String(animeId));
    if (index < 0) return sendJson(res, 404, { error: "未找到条目" });
    items[index] = normalizeSavedItem({
      ...items[index],
      ...(await readJsonBody(req)),
      updatedAt: new Date().toISOString()
    });
    const sorted = await writeDatabase(items);
    return sendJson(res, 200, sorted.find((item) => String(item.bangumiId) === String(animeId)));
  }

  if (animeMatch && req.method === "DELETE") {
    const animeId = decodeURIComponent(animeMatch[1]);
    const items = await readDatabase();
    await writeDatabase(items.filter((item) => String(item.bangumiId) !== String(animeId)));
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: "API 不存在" });
}

async function serveStatic(req, res, url) {
  const requestPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    return res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
}

await ensureFiles();
await writeExcel(await readDatabase());

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "服务器错误" });
  }
}).listen(PORT, () => {
  console.log(`Bangumi Anime Manager running at http://localhost:${PORT}`);
  console.log(`Excel file: ${EXCEL_FILE}`);
  console.log(`Statuses: ${statusOrder.join(", ")}`);
});
