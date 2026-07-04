const statuses = ["已看", "正在看", "想看", "没看完", "搁置", "放弃"];
const hideBangumiStorageKey = "anime-manager-hide-bangumi-before-rating";

const state = {
  selected: null,
  selectedMode: "none",
  anime: []
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "请求失败");
  return data;
}

function setSync(text) {
  $("syncState").textContent = text;
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("anime-manager-theme", nextTheme);
  $("themeToggle").textContent = nextTheme === "dark" ? "浅色模式" : "深色模式";
  drawScoreDistribution();
}

function initTheme() {
  applyTheme(localStorage.getItem("anime-manager-theme") || "light");
}

function initBangumiVisibility() {
  const saved = localStorage.getItem(hideBangumiStorageKey);
  $("hideBangumiBeforeRating").checked = saved === null ? true : saved === "true";
}

function linkHtml(label, url, className = "") {
  const safeLabel = escapeHtml(label || "未知");
  return url
    ? `<a class="${className}" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${safeLabel}</a>`
    : `<span class="${className}">${safeLabel}</span>`;
}

function renderTags(tags, limit = 10) {
  return (tags || [])
    .slice(0, limit)
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");
}

function parseTagsInput(value) {
  const seen = new Set();
  return String(value || "")
    .split(/[\n,，、]/)
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
}

function castLine(entry) {
  if (typeof entry === "string") return `<div class="cast-row">${escapeHtml(entry)}</div>`;
  const actors = (entry.actors || []).map((actor) => linkHtml(actor.name, actor.url, "person-link")).join("、");
  return `<div class="cast-row">${linkHtml(entry.role, entry.roleUrl, "role-link")}${actors ? `<span>：${actors}</span>` : ""}</div>`;
}

function renderCast(cast) {
  return (cast || []).map(castLine).join("");
}

function directorName(item) {
  return typeof item.director === "object" ? item.director?.name || "" : item.director || "";
}

function directorUrl(item) {
  return typeof item.director === "object" ? item.director?.url || "" : item.directorUrl || "";
}

function hasPersonalScore(value) {
  if (String(value ?? "").trim() === "") return false;
  return Number.isFinite(Number(value));
}

function scoreText(value) {
  return hasPersonalScore(value) ? Number(value).toFixed(1) : "未评分";
}

function scoreDiffText(personalScore, bangumiScore) {
  if (!hasPersonalScore(personalScore)) return "";
  const personal = Number(personalScore);
  const bgm = Number(bangumiScore);
  if (!Number.isFinite(bgm)) return "";
  const diff = Number((personal - bgm).toFixed(2));
  return `${diff > 0 ? "+" : ""}${diff.toFixed(2)}`;
}

function fillStatusSelect(select, includeAll = false) {
  select.innerHTML = [
    includeAll ? `<option value="">全部状态</option>` : "",
    ...statuses.map((status) => `<option value="${status}">${status}</option>`)
  ].join("");
}

function isManualMode(meta = state.selected, mode = state.selectedMode) {
  return mode === "manual" || Boolean(meta?.isManual);
}

function scoreForSave() {
  const value = $("scoreInput").value.trim();
  return value === "" ? null : value;
}

function savedItemUrl(id) {
  return `/api/anime/${encodeURIComponent(id)}`;
}

function readManualFields() {
  return {
    titleCn: $("manualTitleCn").value.trim(),
    titleOriginal: $("manualTitleOriginal").value.trim(),
    year: $("manualYear").value.trim(),
    season: $("manualSeason").value.trim(),
    episodes: $("manualEpisodes").value.trim(),
    airDate: "",
    studio: $("manualStudio").value.trim(),
    director: { name: $("manualDirector").value.trim(), url: "" },
    cast: [],
    image: "",
    sourceUrl: "",
    bangumiScore: null,
    rank: null,
    summary: "",
    isManual: true
  };
}

function fillManualFields(meta) {
  $("manualTitleCn").value = meta.titleCn || "";
  $("manualTitleOriginal").value = meta.titleOriginal || "";
  $("manualYear").value = meta.year || "";
  $("manualSeason").value = meta.season || "";
  $("manualEpisodes").value = meta.episodes || "";
  $("manualStudio").value = meta.studio || "";
  $("manualDirector").value = directorName(meta) || "";
}

function refreshManualPreview() {
  if (!isManualMode()) return;
  const manual = readManualFields();
  $("selectedTitle").textContent = manual.titleCn || manual.titleOriginal || "手动条目";
  $("selectedOriginal").textContent = manual.titleOriginal || "";
  $("selectedYear").textContent = manual.year || "未知";
  $("selectedSeason").textContent = manual.season || "未知";
  $("selectedEpisodes").textContent = manual.episodes || "未知";
  $("selectedStudio").textContent = manual.studio || "未知";
  $("selectedDirector").innerHTML = linkHtml(manual.director.name || "未知", "", "person-link");
}

function updateTagsPreview() {
  if (!state.selected) return;
  state.selected.tags = parseTagsInput($("tagInput").value);
  $("selectedTags").innerHTML = renderTags(state.selected.tags);
}

function updateScoreReveal() {
  if (!state.selected) return;
  const personalScore = $("scoreInput").value;
  const shouldHide = $("hideBangumiBeforeRating").checked && !hasPersonalScore(personalScore);
  const bgm = Number(state.selected.bangumiScore);
  $("selectedBangumiScore").textContent = shouldHide ? "评分后显示" : Number.isFinite(bgm) ? bgm.toFixed(1) : "暂无";
  $("selectedScoreDiff").textContent = shouldHide
    ? "评分后显示"
    : hasPersonalScore(personalScore)
      ? scoreDiffText(personalScore, state.selected.bangumiScore) || "暂无"
      : "暂无";
}

function showDetail(meta, mode = "search") {
  const detailMode = isManualMode(meta, mode) ? (mode === "saved" ? "saved" : "manual") : mode;
  state.selected = { ...meta };
  state.selectedMode = detailMode;
  $("emptyDetail").classList.add("hidden");
  $("detailContent").classList.remove("hidden");

  $("selectedPoster").src = meta.image || "";
  $("selectedTitle").textContent = meta.titleCn || meta.titleOriginal || "手动条目";
  $("selectedOriginal").textContent = meta.titleOriginal || "";
  $("selectedYear").textContent = meta.year || meta.airDate || "未知";
  $("selectedSeason").textContent = meta.season || "未知";
  $("selectedEpisodes").textContent = meta.episodes || "未知";
  $("selectedStudio").textContent = meta.studio || "未知";
  $("selectedDirector").innerHTML = linkHtml(directorName(meta) || "未知", directorUrl(meta), "person-link");
  $("selectedTags").innerHTML = renderTags(meta.tags);
  $("selectedCast").innerHTML = meta.isManual ? "" : renderCast(meta.cast);
  $("selectedSummary").textContent = meta.summary || "";

  $("selectedLink").href = meta.sourceUrl || "#";
  $("selectedLink").textContent = meta.sourceUrl ? "Bangumi" : "手动条目";
  $("selectedLink").classList.toggle("ghost", !meta.sourceUrl);

  $("statusInput").value = meta.status || "已看";
  $("scoreInput").value = meta.personalScore ?? "";
  $("commentInput").value = meta.comment || "";
  $("tagInput").value = (meta.tags || []).join("\n");
  $("manualFields").classList.toggle("hidden", !isManualMode(meta, detailMode));
  if (isManualMode(meta, detailMode)) {
    fillManualFields(meta);
    refreshManualPreview();
  }

  $("addBtn").textContent = detailMode === "saved" ? "保存修改" : "加入数据库";
  $("deleteBtn").classList.toggle("hidden", detailMode !== "saved");
  updateScoreReveal();
}

function showManualEntryForm() {
  showDetail(
    {
      titleCn: "",
      titleOriginal: "",
      year: "",
      season: "",
      episodes: "",
      studio: "",
      director: { name: "", url: "" },
      tags: [],
      bangumiScore: null,
      personalScore: "",
      comment: "",
      status: "已看",
      cast: [],
      sourceUrl: "",
      isManual: true
    },
    "manual"
  );
  setSync("正在手动添加条目");
}

async function loadAnime() {
  state.anime = await api("/api/anime");
  renderTable();
  renderStats();
}

async function search() {
  const keyword = $("searchInput").value.trim();
  if (!keyword) return;
  $("results").classList.remove("hidden");
  $("results").innerHTML = `<p class="hint">搜索中...</p>`;
  try {
    const results = await api(`/api/search?q=${encodeURIComponent(keyword)}`);
    if (!results.length) {
      $("results").innerHTML = `<p class="hint">没有找到结果</p>`;
      return;
    }
    $("results").innerHTML = results
      .map(
        (item) => `
          <button class="result-item" data-id="${item.id}">
            <img src="${escapeHtml(item.image)}" alt="">
            <span>
              <strong>${escapeHtml(item.name_cn || item.name)}</strong>
              <small>${escapeHtml(item.name || "")}</small>
              <small>${escapeHtml(item.date || "未知日期")}</small>
            </span>
          </button>
        `
      )
      .join("");
    document.querySelectorAll(".result-item").forEach((el) => {
      el.addEventListener("click", () => loadSubject(el.dataset.id));
    });
  } catch (error) {
    $("results").innerHTML = `<p class="hint">${escapeHtml(error.message)}</p>`;
  }
}

async function loadSubject(id) {
  setSync("正在获取条目详情...");
  const meta = await api(`/api/subject/${id}`);
  showDetail({ ...meta, status: "已看", personalScore: null, comment: "" }, "search");
  if ($("autoHideResults").checked) $("results").classList.add("hidden");
  setSync($("hideBangumiBeforeRating").checked ? "详情已加载，Bangumi 评分会在个人评分后显示" : "详情已加载");
}

function buildSavePayload() {
  const payload = {
    ...state.selected,
    status: $("statusInput").value || "已看",
    personalScore: scoreForSave(),
    comment: $("commentInput").value.trim(),
    tags: parseTagsInput($("tagInput").value)
  };
  return isManualMode() ? { ...payload, ...readManualFields(), tags: payload.tags } : payload;
}

async function saveSelected() {
  if (!state.selected) return;
  const item = buildSavePayload();
  if (isManualMode() && !(item.titleCn || item.titleOriginal)) {
    setSync("请至少填写一个标题");
    return;
  }
  if (state.selectedMode === "saved" && item.bangumiId) {
    setSync("正在同步修改...");
    const saved = await api(savedItemUrl(item.bangumiId), {
      method: "PATCH",
      body: JSON.stringify(item)
    });
    showDetail(saved, "saved");
    setSync("修改已同步到 Excel");
  } else {
    setSync("正在写入本地数据库和 Excel...");
    const saved = await api("/api/anime", { method: "POST", body: JSON.stringify(item) });
    showDetail(saved, "saved");
    setSync("已同步到 outputs/anime.xlsx");
  }
  await loadAnime();
}

async function deleteSelected() {
  if (!state.selected || state.selectedMode !== "saved") return;
  if (!confirm("确认删除这个条目？")) return;
  setSync("正在删除...");
  await api(savedItemUrl(state.selected.bangumiId), { method: "DELETE" });
  state.selected = null;
  state.selectedMode = "none";
  $("detailContent").classList.add("hidden");
  $("emptyDetail").classList.remove("hidden");
  await loadAnime();
  setSync("删除已同步到 Excel");
}

function filterItems() {
  const text = $("filterText").value.trim().toLowerCase();
  const status = $("filterStatus").value;
  return state.anime.filter((item) => {
    if (status && item.status !== status) return false;
    if (!text) return true;
    return [
      item.titleCn,
      item.titleOriginal,
      item.year,
      item.season,
      item.studio,
      directorName(item),
      item.status,
      ...(item.tags || [])
    ]
      .join(" ")
      .toLowerCase()
      .includes(text);
  });
}

function clearFilters() {
  $("filterText").value = "";
  $("filterStatus").value = "";
  renderTable();
}

function renderTable() {
  const rows = filterItems();
  $("listCount").textContent = `显示 ${rows.length} / ${state.anime.length} 部`;
  $("animeTable").innerHTML = rows
    .map((item) => {
      const diffClass = item.scoreDiff > 0 ? "good" : item.scoreDiff < 0 ? "bad" : "";
      return `
        <tr class="anime-row" data-id="${escapeHtml(item.bangumiId)}">
          <td>
            <button class="title-button">${escapeHtml(item.titleCn || item.titleOriginal)}</button>
            <small>${escapeHtml(item.titleOriginal || "")}</small>
          </td>
          <td>${escapeHtml(item.year || "")}<small>${escapeHtml(item.season || "")}</small></td>
          <td>${escapeHtml(item.studio || "")}</td>
          <td><div class="table-tags">${renderTags(item.tags)}</div></td>
          <td><span class="status-pill">${escapeHtml(item.status || "已看")}</span></td>
          <td>${scoreText(item.personalScore)}</td>
          <td><span class="score-diff ${diffClass}">${item.scoreDiff ?? ""}</span></td>
        </tr>
      `;
    })
    .join("");
  document.querySelectorAll(".anime-row").forEach((row) => {
    row.addEventListener("click", () => {
      const item = state.anime.find((entry) => String(entry.bangumiId) === String(row.dataset.id));
      if (item) {
        showDetail(item, "saved");
        document.querySelector(".right-column")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function applyTagFilter(tag) {
  $("filterText").value = tag;
  renderTable();
  document.querySelector(".list-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderStats() {
  const total = state.anime.length;
  const rated = state.anime.filter((item) => hasPersonalScore(item.personalScore));
  const personalAvg = rated.length
    ? rated.reduce((sum, item) => sum + Number(item.personalScore), 0) / rated.length
    : 0;
  const bangumiRated = state.anime.filter((item) => Number.isFinite(Number(item.bangumiScore)));
  const bgmAvg = bangumiRated.length
    ? bangumiRated.reduce((sum, item) => sum + Number(item.bangumiScore), 0) / bangumiRated.length
    : 0;
  $("scoreSummary").textContent = `共 ${total} 部；已评分 ${rated.length} 部；个人均分 ${rated.length ? personalAvg.toFixed(2) : "暂无"}；Bangumi 均分 ${bangumiRated.length ? bgmAvg.toFixed(2) : "暂无"}`;

  const statusCounts = Object.fromEntries(statuses.map((status) => [status, 0]));
  state.anime.forEach((item) => {
    statusCounts[item.status || "已看"] = (statusCounts[item.status || "已看"] || 0) + 1;
  });
  $("statusStats").innerHTML = statuses
    .map((status) => `<div class="stat-card"><strong>${statusCounts[status] || 0}</strong><span>${status}</span></div>`)
    .join("");

  const tagCounts = new Map();
  state.anime.forEach((item) => (item.tags || []).forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)));
  $("tagStats").innerHTML = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .map(
      ([tag, count]) => `
        <button class="tag-stat" data-tag="${escapeHtml(tag)}" title="筛选 ${escapeHtml(tag)}">
          <b>${escapeHtml(tag)}</b><em>${count}</em>
        </button>
      `
    )
    .join("");
  document.querySelectorAll(".tag-stat").forEach((button) => {
    button.addEventListener("click", () => applyTagFilter(button.dataset.tag));
  });

  drawScoreDistribution();
}

function drawScoreDistribution() {
  const canvas = $("scoreChart");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const css = getComputedStyle(document.documentElement);
  const panelColor = css.getPropertyValue("--panel").trim() || "#ffffff";
  const lineColor = css.getPropertyValue("--line").trim() || "#ead8dc";
  const mutedColor = css.getPropertyValue("--muted").trim() || "#667085";
  const chartGridColor = css.getPropertyValue("--chart-grid").trim() || "#f3e5e8";
  const accentColor = css.getPropertyValue("--bangumi").trim() || "#f09199";
  const accentDarkColor = css.getPropertyValue("--bangumi-dark").trim() || "#d86e78";
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(rect.width * ratio));
  canvas.height = Math.floor(260 * ratio);
  ctx.scale(ratio, ratio);
  const width = rect.width;
  const height = 260;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = panelColor;
  ctx.fillRect(0, 0, width, height);
  const padLeft = 40;
  const padRight = 18;
  const padTop = 24;
  const padBottom = 34;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  const buckets = Array.from({ length: 101 }, (_, index) => ({ score: Number((index / 10).toFixed(1)), count: 0 }));
  state.anime.forEach((item) => {
    if (!hasPersonalScore(item.personalScore)) return;
    const clamped = Math.max(0, Math.min(10, Number(item.personalScore)));
    buckets[Math.round(clamped * 10)].count += 1;
  });
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, height - padBottom);
  ctx.lineTo(width - padRight, height - padBottom);
  ctx.stroke();

  ctx.fillStyle = mutedColor;
  ctx.font = "12px Segoe UI, sans-serif";
  ctx.fillText("频数", 8, padTop + 4);
  ctx.fillText("评分", width - 44, height - 8);

  ctx.strokeStyle = chartGridColor;
  for (let i = 0; i <= 10; i += 2) {
    const x = padLeft + (chartWidth * i) / 10;
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, height - padBottom);
    ctx.stroke();
    ctx.fillStyle = mutedColor;
    ctx.fillText(String(i), x - 4, height - 14);
  }
  for (let i = 0; i <= maxCount; i += Math.max(1, Math.ceil(maxCount / 4))) {
    const y = height - padBottom - (chartHeight * i) / maxCount;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();
    ctx.fillStyle = mutedColor;
    ctx.fillText(String(i), 16, y + 4);
  }

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  buckets.forEach((bucket, index) => {
    const x = padLeft + (chartWidth * bucket.score) / 10;
    const y = height - padBottom - (chartHeight * bucket.count) / maxCount;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = accentDarkColor;
  buckets
    .filter((bucket) => bucket.count > 0)
    .forEach((bucket) => {
      const x = padLeft + (chartWidth * bucket.score) / 10;
      const y = height - padBottom - (chartHeight * bucket.count) / maxCount;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
}

initTheme();
initBangumiVisibility();
fillStatusSelect($("statusInput"));
fillStatusSelect($("filterStatus"), true);

$("themeToggle").addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
$("hideBangumiBeforeRating").addEventListener("change", () => {
  localStorage.setItem(hideBangumiStorageKey, String($("hideBangumiBeforeRating").checked));
  updateScoreReveal();
});
$("searchBtn").addEventListener("click", search);
$("manualAddBtn").addEventListener("click", showManualEntryForm);
$("searchInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") search();
});
$("addBtn").addEventListener("click", saveSelected);
$("deleteBtn").addEventListener("click", deleteSelected);
$("filterText").addEventListener("input", renderTable);
$("filterStatus").addEventListener("change", renderTable);
$("clearFiltersBtn").addEventListener("click", clearFilters);
$("scoreInput").addEventListener("input", () => {
  if (state.selected) state.selected.personalScore = scoreForSave();
  updateScoreReveal();
});
$("tagInput").addEventListener("input", updateTagsPreview);
["manualTitleCn", "manualTitleOriginal", "manualYear", "manualSeason", "manualEpisodes", "manualStudio", "manualDirector"].forEach((id) => {
  $(id).addEventListener("input", refreshManualPreview);
});
window.addEventListener("resize", drawScoreDistribution);

loadAnime().catch((error) => setSync(error.message));
