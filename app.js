const imageFiles = {
  "photo-1472396961693-142e6e269027": "hero",
  "photo-1441974231531-c6227db76b6e": "lake",
  "photo-1579783902614-a3fb3927b6a5": "art",
  "photo-1442512595331-e89e73853f31": "market",
  "photo-1470229722913-7c0e2dbbafd3": "music",
  "photo-1473448912268-2022ce9509d8": "river",
  "photo-1507842217343-583bb7270b66": "book",
};
const photo = (id) => `./assets/${imageFiles[id] || "hero"}.jpg`;
const activities = WeekendActivities.items;
let forecast = { status: "loading", rows: [], fetchedAt: null };
let forecastLoading = false;
const defaults = () => ({
  budget: 150,
  weather: "auto",
  date: WeekendWeather.weekendDates()[0],
  people: 2,
  interests: [],
  category: "全部",
  sort: "recommended",
  query: "",
});
function selectedForecast() {
  return forecast.rows.find((r) => r.date === filters.date);
}
function indoorOnly() {
  return (
    filters.weather === "rain" ||
    (filters.weather === "auto" && Boolean(selectedForecast()?.outdoorRisk))
  );
}
function fairWeather() {
  return (
    filters.weather === "auto" &&
    selectedForecast() &&
    !selectedForecast().outdoorRisk
  );
}
function dateLabel(date) {
  return `${date.slice(5).replace("-", "/")} 周${["日", "一", "二", "三", "四", "五", "六"][new Date(date + "T00:00:00Z").getUTCDay()]}`;
}

let filters = defaults();
let state = { plans: [], saved: [], journals: [], teams: {} };
let storageAvailable = true;
try {
  const raw = JSON.parse(localStorage.getItem("weekend-wander-v1") || "null");
  if (
    raw &&
    Array.isArray(raw.plans) &&
    Array.isArray(raw.saved) &&
    Array.isArray(raw.journals)
  ) {
    state = { ...state, ...raw, teams: raw.teams || {} };
    state.plans = state.plans.filter((id) =>
      activities.some((a) => a.id === id),
    );
  }
} catch {
  storageAvailable = false;
}
const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const getActivity = (id) => activities.find((a) => a.id === id);
const persist = () => {
  try {
    localStorage.setItem("weekend-wander-v1", JSON.stringify(state));
  } catch {
    storageAvailable = false;
    toast("浏览器存储不可用，本次操作仅在当前页面保留");
  }
  updateCount();
};
let toastTimer;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3200);
}
function updateCount() {
  $("#plan-count").textContent = state.plans.length;
}
function openModal(html) {
  $("#modal-content").innerHTML = html;
  if (!$("#modal").open) $("#modal").showModal();
}
function closeModal() {
  $("#modal").close();
}
function addPlan(id, date = filters.date) {
  if (!getActivity(id)) return;
  if (!WeekendActivities.available(getActivity(id), date)) {
    toast("此活动已下架或不在所选日期开放，请查看官方来源");
    return;
  }
  if (!state.plans.includes(id)) {
    state.plans.push(id);
    persist();
    toast("已加入我的计划，周末有着落了");
  } else toast("已经在你的周末计划里了");
  if ($("#cards")) renderResults();
  else refresh();
  document
    .querySelectorAll("#modal [data-add]")
    .forEach((b) => (b.textContent = "✓ 已在计划中"));
}
function saveActivity(id) {
  state.saved = state.saved.includes(id)
    ? state.saved.filter((x) => x !== id)
    : [...state.saved, id];
  persist();
  renderResults();
}
function empty(
  title,
  desc,
  action = "去发现周末",
  handler = "location.hash='discover'",
) {
  return `<div class="empty"><div class="empty-icon">↗</div><h3>${title}</h3><p>${desc}</p><button class="primary" onclick="${handler}">${action} <span>→</span></button></div>`;
}
function score(a) {
  return (
    (filters.interests.includes(a.category) ? 20 : 0) +
    (fairWeather() && !a.indoor ? 4 : 0) +
    (filters.people > 2 && a.group >= 4 ? 2 : 0) +
    (a.price === 0 ? 1 : 0)
  );
}
function matching() {
  let list = activities.filter(
    (a) =>
      WeekendActivities.available(a, filters.date) &&
      a.price <= filters.budget &&
      (!indoorOnly() || a.indoor) &&
      a.group >= filters.people &&
      (filters.category === "全部" ||
        (filters.category === "已收藏"
          ? state.saved.includes(a.id)
          : a.category === filters.category)) &&
      (!filters.query ||
        `${a.title}${a.place}${a.tags.join("")}`
          .toLowerCase()
          .includes(filters.query.toLowerCase())),
  );
  list.sort(
    filters.sort === "price"
      ? (a, b) => a.price - b.price
      : filters.sort === "time"
        ? (a, b) => a.hours - b.hours
        : (a, b) => score(b) - score(a),
  );
  return list;
}
function reason(a) {
  return filters.interests.includes(a.category)
    ? "契合你的兴趣 · 预算内的好选择"
    : indoorOnly()
      ? "室内好去处 · 不受风雨打扰"
      : filters.people > 2
        ? "适合结伴出发 · 人均预算友好"
        : a.price === 0
          ? "零元也精彩 · 给周末一点留白"
          : !a.indoor
            ? fairWeather()
              ? "预报适合户外 · 出发前再看天气"
              : "户外目的地 · 出发前核实天气"
            : "室内慢体验 · 随时切换好心情";
}
function openingHours(a) {
  const data = WeekendPlanningData[a.id];
  const official = data?.hoursKind === "official";
  const ranges = data?.windows?.map((w) => `${w.open}–${w.close}`).join("、");
  const title = official
    ? ranges
    : a.id === "culture-2026"
      ? "依具体场次公布"
      : "待确认";
  const note = official
    ? data.hoursNote
    : a.id === "market"
      ? "街区内各店营业时间不同，请以店铺公告为准。"
      : a.id === "culture-2026"
        ? data.hoursNote
        : a.id === "optics-library"
          ? "请通过场馆预约渠道核实当日开放时间。"
          : "公共区域开放情况以现场公告为准。";
  const preferred = data?.preferred
    ?.map((p) => `${p.start}–${p.end}`)
    .join("、");
  return `<div class="card-hours"><div><span>◷ 营业 / 开放时间</span><strong>${esc(title)}</strong></div><p>${esc(note)}</p>${preferred ? `<p class="hours-preferred">建议游玩 ${esc(preferred)} · 仅供游玩安排参考</p>` : ""}</div>`;
}
function card(a) {
  const saved = state.saved.includes(a.id),
    planned = state.plans.includes(a.id);
  return `<article class="card"><div class="card-image"><button class="image-open" data-detail="${a.id}" aria-label="查看${a.title}"><img src="${photo(a.image)}" alt="${a.category}氛围配图" loading="lazy"></button><span class="card-tag">${a.tag}</span><button class="save ${saved ? "saved" : ""}" data-save="${a.id}" aria-label="${saved ? "取消收藏" : "收藏"}${a.title}" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button></div><div class="card-body"><div class="card-meta"><span>${a.category}</span><span>◷ ${a.hours} 小时</span></div><h3><button data-detail="${a.id}">${a.title}</button></h3><p class="card-description">${a.place}</p>${openingHours(a)}<div class="tags">${a.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div><div class="card-bottom"><span class="price">${a.price === 0 ? "免费" : `¥${a.price}`}<small>${a.price === 0 ? "活动费用" : "/ 人预计"}</small></span><button class="add" data-add="${a.id}">${planned ? "✓ 已加入" : "+ 加入计划"}</button></div><div class="reason">✧ ${reason(a)}</div><div class="source-meta">${a.source ? `<a href="${esc(a.source.url)}" target="_blank" rel="noopener noreferrer">官方来源 ↗</a>` : ""}<span>${esc(a.kind || "探索提案")}</span></div></div></article>`;
}
function discover() {
  $("#main").innerHTML =
    `<section class="hero"><div class="hero-copy"><span class="pill"><span class="dot"></span> 武汉 · 你的周末灵感站</span><h1>周末不必远行，<br>也能<em>发现新鲜。</em></h1><p>把「不知道去哪」变成「就去这里」。<br>让兴趣、天气和预算，帮你找到刚刚好的小冒险。</p><div class="hero-bottom"><button class="primary" id="explore-button">找点好玩的 <span>↗</span></button><span class="hero-note">出发的理由，一个就够了。</span></div></div><div class="hero-photo"><div class="weather-card"><small id="weather-heading">武汉 · 周末预报</small><div class="weather-line"><strong id="hero-temperature">—</strong><span class="sun" id="hero-sun">◷</span></div><p id="hero-weather" aria-live="polite">正在获取天气预报…</p><div class="weather-credit"><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo · CC BY 4.0 ↗</a><span id="weather-updated"></span><button id="refresh-weather" type="button">刷新预报</button></div></div><div class="photo-label">NATURE IS CALLING. ↗ <span>氛围配图</span></div></div></section><div class="strip"><strong>✧ 为你的周末多想一点</strong><span>预算友好</span><span>天气适配</span><span>一个人或一群人</span><span>城市很大，快乐可以很近。</span></div><section id="recommendations"><div class="section-heading"><h2>发现你的周末<small>不赶路，去感受路。</small></h2><button class="text-button" id="random-button">给我一点惊喜 ↗</button></div><div class="explore-layout"><aside class="filters" aria-label="推荐条件"><div class="filter-title">我的出逃偏好 <button class="reset" id="reset-button">重置</button></div><div class="filters-grid"><div class="filter-group"><label class="filter-label" for="city">探索城市</label><select class="select" id="city"><option>武汉 · 江城慢游</option></select><p class="filter-hint">首期城市，更多地方正在路上</p></div><div class="filter-group"><label class="filter-label" for="budget">人均预算 <output id="budget-value">¥${filters.budget} 以内</output></label><input type="range" id="budget" min="0" max="200" step="5" value="${filters.budget}" aria-label="人均预算"><div class="range-labels"><span>¥0</span><span>¥200</span></div></div><div class="filter-group"><label class="filter-label" for="travel-date">出发日期</label><select class="select" id="travel-date">${WeekendWeather.weekendDates()
      .map(
        (date) =>
          `<option value="${date}" ${date === filters.date ? "selected" : ""}>${dateLabel(date)}</option>`,
      )
      .join(
        "",
      )}</select><label class="filter-label weather-mode-label" for="weather">天气偏好</label><select class="select" id="weather"><option value="auto" ${filters.weather === "auto" ? "selected" : ""}>按真实预报推荐</option><option value="rain" ${filters.weather === "rain" ? "selected" : ""}>只看室内活动</option><option value="any" ${filters.weather === "any" ? "selected" : ""}>不限室内 / 户外</option></select><p class="filter-hint" id="weather-hint">正在获取武汉预报</p></div><div class="filter-group"><label class="filter-label" for="people">和谁一起</label><select class="select" id="people"><option value="1">一个人 · 自由出发</option><option value="2">两个人 · 分享快乐</option><option value="4">3–4 人 · 朋友小聚</option><option value="6">5–6 人 · 一起热闹</option></select></div><div class="filter-group interests"><div class="filter-label">喜欢什么 <span class="filter-hint">可多选 · 优先推荐</span></div><div class="chips">${["户外自然", "艺术展览", "城市漫游", "音乐演出"].map((x) => `<button class="chip ${filters.interests.includes(x) ? "active" : ""}" data-interest="${x}" aria-pressed="${filters.interests.includes(x)}">${x}</button>`).join("")}</div></div></div><div class="filter-foot">✧ 推荐逻辑很简单<br>先满足预算、天气与人数，再把喜欢的排前面。</div></aside><div class="results"><div class="search-box"><span aria-hidden="true">⌕</span><input type="search" id="search" placeholder="搜索目的地、活动或关键词" aria-label="搜索活动" value="${esc(filters.query)}"></div><div class="results-toolbar"><div class="categories">${["全部", "户外自然", "艺术展览", "城市漫游", "音乐演出", "已收藏"].map((x) => `<button class="category ${filters.category === x ? "active" : ""}" data-category="${x}" aria-pressed="${filters.category === x}">${x === "全部" ? "为你推荐" : x}</button>`).join("")}</div><select class="sort" id="sort" aria-label="排序方式"><option value="recommended">推荐排序 ↓</option><option value="price">预算从低到高</option><option value="time">时长从短到长</option></select></div><div id="result-count" class="count-line" aria-live="polite"></div><div class="cards" id="cards"></div><p class="results-note">活动按官方公开信息人工整理，并非实时票务接口 · 图片为氛围配图 · 餐饮预算为估算</p></div></div></section><section class="inspiration"><span class="inspiration-icon">✺</span><div class="inspiration-copy"><h3>好玩的地方，值得被记下来。</h3><p>留下一次打卡、一段小攻略，给下一次出发一点灵感。</p></div><button class="outline-button" id="journal-cta">打开探索手账 ↗</button></section>`;
  $("#people").value = String(filters.people);
  $("#sort").value = filters.sort;
  $("#budget").oninput = (e) => {
    filters.budget = +e.target.value;
    $("#budget-value").textContent = `¥${filters.budget} 以内`;
    renderResults();
  };
  $("#weather").onchange = (e) => {
    filters.weather = e.target.value;
    renderResults();
    updateWeather();
  };
  $("#travel-date").onchange = (e) => {
    filters.date = e.target.value;
    renderResults();
    updateWeather();
  };
  $("#refresh-weather").onclick = () => loadWeather(true);
  $("#people").onchange = (e) => {
    filters.people = +e.target.value;
    renderResults();
  };
  $("#sort").onchange = (e) => {
    filters.sort = e.target.value;
    renderResults();
  };
  $("#search").oninput = (e) => {
    filters.query = e.target.value.trim();
    renderResults();
  };
  $("#reset-button").onclick = resetFilters;
  $("#explore-button").onclick = () =>
    $("#recommendations").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  $("#random-button").onclick = () => {
    let list = matching();
    if (list.length) detail(list[Math.floor(Math.random() * list.length)].id);
    else toast("当前条件下暂无活动，试试放宽筛选");
  };
  $("#journal-cta").onclick = () => (location.hash = "journal");
  renderResults();
  updateWeather();
}
async function loadWeather(force = false) {
  if (forecastLoading) return;
  forecastLoading = true;
  updateWeather();
  let cache = null;
  try {
    cache = JSON.parse(
      localStorage.getItem(WeekendWeather.CACHE_KEY) || "null",
    );
  } catch {}
  forecast = await WeekendWeather.loadForecast({ cache, force });
  if (forecast.status === "live") {
    try {
      localStorage.setItem(
        WeekendWeather.CACHE_KEY,
        JSON.stringify({ rows: forecast.rows, fetchedAt: forecast.fetchedAt }),
      );
    } catch {}
  }
  forecastLoading = false;
  updateWeather();
  renderResults();
}
function updateWeather() {
  if (!$("#hero-weather")) return;
  const row = selectedForecast();
  $("#weather-heading").textContent = `武汉 · ${dateLabel(filters.date)}`;
  $("#hero-temperature").textContent = row
    ? `${Math.round(row.min)}–${Math.round(row.max)}°`
    : "—";
  $("#hero-sun").textContent = row
    ? row.outdoorRisk
      ? "☂"
      : row.code === 0
        ? "☼"
        : "☁"
    : "◷";
  $("#hero-weather").textContent = row
    ? `${row.label} · 降水概率 ${row.rain}%`
    : forecastLoading
      ? "正在获取天气预报…"
      : "预报暂不可用";
  const stamp = forecast.fetchedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(forecast.fetchedAt))
    : "";
  $("#weather-updated").textContent = forecastLoading
    ? "正在刷新…"
    : row
      ? `${forecast.status === "stale" ? "更新失败 · 旧缓存" : forecast.status === "cached" ? "本机缓存" : "获取于"} ${stamp}`
      : "连接失败，请稍后重试";
  $("#refresh-weather").disabled = forecastLoading;
  $("#refresh-weather").textContent = forecastLoading
    ? "获取中…"
    : forecast.status === "unavailable" || forecast.status === "stale"
      ? "重试预报"
      : "刷新预报";
  $("#weather-hint").textContent =
    filters.weather === "rain"
      ? "已手动选择室内；上方仍显示真实预报"
      : filters.weather === "any"
        ? "已关闭天气筛选，请自行评估户外条件"
        : row
          ? row.outdoorRisk
            ? "有降水或低能见度风险，已推荐室内"
            : "当前预报无明显降水风险，可考虑户外"
          : "预报未就绪，暂不按天气筛选";
}
function resetFilters() {
  filters = defaults();
  discover();
  toast("已恢复默认推荐条件");
}
function renderResults() {
  if (!$("#cards")) return;
  const list = matching();
  $("#result-count").textContent =
    `找到 ${list.length} 个适合你的周末灵感${indoorOnly() ? " · 已为你避开露天活动" : !selectedForecast() && filters.weather === "auto" ? " · 天气未就绪，暂未过滤户外" : ""}`;
  $("#cards").innerHTML = list.length
    ? list.map(card).join("")
    : empty(
        "换个条件，快乐就出现了",
        "试试提高预算、减少同行人数，或查看其他分类。",
        "重置筛选",
        "resetFilters()",
      );
  document.querySelectorAll("[data-category]").forEach((b) => {
    b.classList.toggle("active", b.dataset.category === filters.category);
    b.setAttribute(
      "aria-pressed",
      String(b.dataset.category === filters.category),
    );
  });
  document.querySelectorAll("[data-interest]").forEach((b) => {
    b.classList.toggle(
      "active",
      filters.interests.includes(b.dataset.interest),
    );
    b.setAttribute(
      "aria-pressed",
      String(filters.interests.includes(b.dataset.interest)),
    );
  });
}
function sourceBlock(a) {
  return `<section class="source-panel"><strong>${esc(a.kind || "旧版记录")}</strong>${a.statusNote ? `<p class="notice">${esc(a.statusNote)}</p>` : ""}${a.source ? `<p><a href="${esc(a.source.url)}" target="_blank" rel="noopener noreferrer">${esc(a.source.name)} ↗</a></p><small>来源发布：${esc(a.source.publishedAt)} · 整理核对：${esc(a.checkedAt)}${a.endDate ? ` · 有效至 ${esc(a.endDate)}` : ""}</small>${a.extraSource ? `<p><a href="${esc(a.extraSource.url)}" target="_blank" rel="noopener noreferrer">${esc(a.extraSource.name)} ↗</a></p>` : ""}` : "<p>此条为旧版示例，已停止推荐。</p>"}</section>`;
}
function detail(id) {
  const a = getActivity(id);
  if (!a) return;
  openModal(
    `<img class="detail-image" src="${photo(a.image)}" alt="${a.category}氛围配图"><div class="modal-inner"><span class="eyebrow">${a.category} / WEEKEND IDEA</span><h2>${a.title}</h2><p>${a.desc}</p><div class="detail-facts"><div><small>目的地</small><strong>${a.place}</strong></div><div><small>人均预算估算 · 不含交通</small><strong>${a.price === 0 ? "免费" : `¥${a.price}`} · ${a.hours} 小时</strong></div><div><small>建议出发时段</small><strong>${a.time}</strong></div><div><small>天气 / 同行</small><strong>${a.indoor ? "室内 · 晴雨皆宜" : "户外 · 晴天出发"} / 1–${a.group} 人</strong></div></div>${openingHours(a)}<h3>一条不赶时间的路线</h3><p>${a.route}</p><h3>出发前的小提醒</h3><p>${a.transport}<br>${a.booking}</p><p class="notice">${a.tip}<br>路线和时长为本产品建议，官方公告不代表实时余票；出发前请核实开放和预约。</p>${sourceBlock(a)}<div class="modal-actions"><button class="secondary" onclick="teamForm('${a.id}')">组队出发 ↗</button><button class="primary" data-add="${a.id}">${state.plans.includes(a.id) ? "✓ 已在计划中" : "+ 加入我的计划"}</button></div></div>`,
  );
}
function plans() {
  renderPlanner(state.plans.map(getActivity).filter(Boolean));
}
function removePlan(id) {
  state.plans = state.plans.filter((x) => x !== id);
  persist();
  plans();
  toast("已移出计划，打卡和组队记录仍保留");
}
function teamForm(id) {
  const a = getActivity(id),
    t = state.teams[id];
  if (!a) return;
  if (a.archived) {
    detail(id);
    return;
  }
  const routeConfig = location.hash === "#plans" ? itineraryConfig() : null;
  let plannedArrival;
  if (routeConfig) {
    try {
      const visit = WeekendPlanner.schedule(
        itineraryPlaces(
          state.plans.map(getActivity).filter(Boolean),
          routeConfig,
        ),
        routeConfig,
      ).visits.find((v) => v.id === id);
      if (visit) plannedArrival = WeekendPlanner.clock(visit.start);
    } catch {
      /* Invalid settings are explained in the planner. */
    }
  }
  openModal(
    `<div class="modal-inner"><span class="eyebrow">GOOD COMPANY, GREAT WEEKEND</span><h2>${t ? "我的周末小队" : "一个人想去，一起就出发。"}</h2><p>${a.title}</p><form id="team-form"><label class="field">小队名称<input name="name" maxlength="30" required placeholder="例如：周末不宅家小分队" value="${esc(t?.name || "周末出逃小分队")}"></label><label class="field">出发日期<input name="date" type="date" required value="${esc(t?.date || routeConfig?.date || filters.date)}" min="${localDate()}"></label><label class="field">计划人数<select name="size">${[
      2, 3, 4, 5, 6,
    ]
      .filter((n) => n <= a.group)
      .map(
        (n) =>
          `<option ${Number(t?.size) === n ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="field">集合地点与时间<input name="meeting" maxlength="100" required placeholder="例如：14:00 地铁站 A 出口" value="${esc(t?.meeting || `${plannedArrival || a.time.match(/\d{2}:\d{2}/)?.[0] || "时间待定"}，具体集合点出发前商量`)}"></label><p class="notice">组队原型：小队保存在本机，可通过邀请链接分享安排。暂不提供实时成员报名与消息同步；请另行联系伙伴确认。</p><button class="primary full" type="submit">${t ? "保存小队并生成邀请" : "创建小队并生成邀请"} ↗</button></form></div>`,
  );
  $("#team-form").onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (!data.name.trim() || !data.meeting.trim()) {
      toast("请填写小队名称和集合信息");
      return;
    }
    if (!WeekendActivities.available(a, data.date)) {
      toast("该日期不在活动有效期或开放日内，请重新选择");
      return;
    }
    state.teams[id] = data;
    if (!state.plans.includes(id)) state.plans.push(id);
    persist();
    refresh();
    showInvite(id, data);
  };
}
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shareUrl(type, data) {
  return `${location.origin}${location.pathname}#${type}=${encodeURIComponent(JSON.stringify(data))}`;
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("链接已复制，发给你的周末搭子吧");
  } catch {
    openModal(
      `<div class="modal-inner"><h2>复制这个分享链接</h2><p>当前浏览器不支持自动复制，请长按或全选复制。</p><label class="field">分享链接<textarea readonly id="manual-copy">${esc(text)}</textarea></label></div>`,
    );
    $("#manual-copy").select();
  }
}
function showInvite(id, data) {
  const a = getActivity(id),
    url = shareUrl("invite", { id, ...data });
  openModal(
    `<div class="modal-inner"><span class="eyebrow">YOUR WEEKEND CREW</span><h2>小队已就绪，邀朋友出发。</h2><div class="team-box"><strong>${esc(data.name)}</strong>${a.title}<br>${esc(data.date)} · ${esc(data.size)} 人计划<br>${esc(data.meeting)}</div><p>邀请链接包含以上安排。对方可保存到自己的计划，成员状态不会自动同步。</p><label class="field">邀请链接（也可手动复制）<input readonly value="${esc(url)}" aria-label="邀请链接"></label><button class="primary full" id="copy-invite">复制小队邀请 ↗</button></div>`,
  );
  $("#copy-invite").onclick = () => copyText(url);
}
function journalForm(id) {
  const a = getActivity(id);
  openModal(
    `<div class="modal-inner"><span class="eyebrow">COLLECT MOMENTS, NOT THINGS</span><h2>把这个周末，写进手账。</h2><p>${a ? a.title : "一个值得被记住的城市片段。"}</p><form id="journal-form"><label class="field">打卡地点<select name="activity">${activities
      .filter((x) => !x.archived || x.id === id)
      .map(
        (x) =>
          `<option value="${x.id}" ${x.id === id ? "selected" : ""}>${x.title}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="field">给这次探索起个名字<input name="title" maxlength="50" required placeholder="例如：花 0 元，拥抱了一整个秋天"></label><label class="field">实际人均花费（元，不含交通）<input type="number" name="cost" min="0" max="99999" required value="${a?.price || 0}"></label><label class="field">你的体验与小攻略<textarea name="text" maxlength="1200" required placeholder="哪一段最值得去？怎么到达？有什么避坑提醒？"></textarea></label><p class="filter-hint">记录保存在本机，完成后可生成攻略分享链接。</p><button type="submit" class="primary full">保存打卡记录 ✓</button></form></div>`,
  );
  $("#journal-form").onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (!data.title.trim() || !data.text.trim()) {
      toast("写下标题与体验，再保存这段回忆");
      return;
    }
    state.journals.unshift({
      ...data,
      id: Date.now().toString(),
      date: localDate(),
    });
    persist();
    closeModal();
    location.hash = "journal";
    refresh();
    toast("打卡已保存，今天又多了一段好回忆");
  };
}
function journal() {
  $("#main").innerHTML =
    `<div class="page-title"><span class="eyebrow">LITTLE MOMENTS, BIG MEMORIES</span><h1>城市很大，回忆属于你。</h1><p>你的 ${state.journals.length} 次探索，${state.saved.length} 个心动收藏。每个平凡周末，都可以有一点故事。</p><button class="primary" onclick="journalForm()">+ 记录一次探索</button></div><div class="journal-grid">${state.journals.length ? state.journals.map((j) => `<article class="journal-card"><span class="stamp">WEEKEND MEMORY · 已打卡</span><h3>${esc(j.title)}</h3><small>${esc(j.date)} · ${esc(getActivity(j.activity)?.place || "城市探索")} · ¥${esc(j.cost)}</small><p>${esc(j.text)}</p><button class="text-button" data-share-journal="${esc(j.id)}">分享这篇攻略 ↗</button></article>`).join("") : empty("第一篇手账，从这个周末开始", "记录你走过的路、发现的小店，还有想分享的快乐。", "写下第一篇", "journalForm()")}</div>`;
}
function shared(type, raw) {
  try {
    if (raw.length > 18000) throw Error();
    const data = JSON.parse(decodeURIComponent(raw));
    if (type === "invite") {
      const a = getActivity(data.id);
      if (
        !a ||
        typeof data.name !== "string" ||
        typeof data.date !== "string" ||
        typeof data.meeting !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
        ![2, 3, 4, 5, 6].includes(Number(data.size)) ||
        Number(data.size) > a.group ||
        data.name.length > 100 ||
        data.meeting.length > 300
      )
        throw Error();
      $("#main").innerHTML =
        `<div class="page-title"><span class="shared-badge">收到一份周末邀请</span><h1>${esc(data.name)}</h1><p>这个周末，一起去发现新鲜。</p></div><article class="plan-row"><img src="${photo(a.image)}" alt="活动氛围配图"><div class="plan-info"><h3>${a.title}</h3><p>${esc(data.date)} · ${esc(data.size)} 人计划</p><p>集合：${esc(data.meeting)}</p><p>人均预计：${a.price === 0 ? "免费" : `¥${a.price}`} · 不含交通</p></div></article><p class="notice">邀请内容由分享者填写，请自行确认信息。保存仅添加到本机计划，不代表已向发起人报名。</p><button class="primary" id="accept-invite">保存到我的计划 ↗</button>`;
      $("#accept-invite").onclick = () => {
        if (
          !WeekendActivities.available(a, data.date) ||
          data.date < WeekendWeather.chinaDate()
        ) {
          toast("邀请日期已过期或活动暂停，请联系发起人确认");
          return;
        }
        state.teams[a.id] = {
          name: data.name,
          date: data.date,
          size: data.size,
          meeting: data.meeting,
        };
        addPlan(a.id, data.date);
        persist();
        location.hash = "plans";
      };
    } else {
      if (
        typeof data.title !== "string" ||
        typeof data.text !== "string" ||
        data.text.length > 1200 ||
        typeof data.activity !== "string" ||
        typeof data.date !== "string" ||
        !Number.isFinite(Number(data.cost))
      )
        throw Error();
      $("#main").innerHTML =
        `<div class="page-title"><span class="shared-badge">来自探索家的周末攻略</span><h1>${esc(data.title)}</h1><p>${esc(data.date)} · 人均实际花费 ¥${esc(data.cost)}</p></div><article class="journal-card"><p>${esc(data.text)}</p><small>${esc(getActivity(data.activity)?.place || "城市探索")}</small></article><p class="notice">用户分享内容，仅供出行参考。请出发前核实相关信息。</p><a href="#discover" class="primary">发现我的周末 ↗</a>`;
    }
  } catch {
    $("#main").innerHTML = empty(
      "这个分享链接似乎不完整",
      "请向朋友索取完整链接，或先看看这里的周末灵感。",
    );
  }
}
function refresh() {
  const hash = location.hash.slice(1) || "discover";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === hash);
    if (a.dataset.nav === hash) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (hash.startsWith("invite=")) shared("invite", hash.slice(7));
  else if (hash.startsWith("story=")) shared("story", hash.slice(6));
  else if (hash === "plans") plans();
  else if (hash === "journal") journal();
  else discover();
  updateCount();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.detail) detail(b.dataset.detail);
  if (b.dataset.add) addPlan(b.dataset.add);
  if (b.dataset.save) saveActivity(b.dataset.save);
  if (b.dataset.category) {
    filters.category = b.dataset.category;
    renderResults();
  }
  if (b.dataset.interest) {
    const x = b.dataset.interest;
    filters.interests = filters.interests.includes(x)
      ? filters.interests.filter((i) => i !== x)
      : [...filters.interests, x];
    renderResults();
  }
  if (b.dataset.shareJournal) {
    const j = state.journals.find((x) => x.id === b.dataset.shareJournal);
    if (j) {
      const url = shareUrl("story", j);
      openModal(
        `<div class="modal-inner"><h2>让你的发现，成为别人的灵感。</h2><p>任何获得链接的人都能阅读这篇攻略。</p><label class="field">攻略分享链接<input readonly value="${esc(url)}" aria-label="攻略分享链接"></label><button class="primary full" id="copy-story">复制攻略链接 ↗</button></div>`,
      );
      $("#copy-story").onclick = () => copyText(url);
    }
  }
});
$("#modal .close").onclick = closeModal;
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const r = $("#modal").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
$("#profile-button").onclick = () => (location.hash = "journal");
window.addEventListener("hashchange", () => {
  closeModal();
  refresh();
  window.scrollTo(0, 0);
});
refresh();
loadWeather();
if (!storageAvailable) toast("无法读取本机记录，本次将从空白状态开始");

