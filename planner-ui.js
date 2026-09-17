const routeModes = {
  auto: "智能搭配",
  transit: "公共交通",
  walk: "步行",
  bike: "骑行",
  car: "打车 / 自驾",
};
const routeOptions = (values, value) =>
  Object.entries(values)
    .map(
      ([k, v]) =>
        `<option value="${k}" ${k === value ? "selected" : ""}>${v}</option>`,
    )
    .join("");
function itineraryConfig() {
  return WeekendPlanner.settings(state.itinerary, filters.date);
}
function itineraryPlaces(list, c) {
  return list.map((a) => {
    const data = WeekendPlanningData[a.id] || {
      windows: [],
      hoursKind: "unknown",
      hoursNote: "开放安排待核实",
    };
    const saved = c.stops?.[a.id] || {};
    const custom = saved.hoursDate === c.date && saved.window;
    return {
      ...a,
      ...data,
      duration: saved.duration ?? a.hours * 60,
      ...(custom
        ? {
            windows: [saved.window],
            hoursKind: "user",
            hoursNote: `你确认的 ${c.date} 开放时段；请留意临时调整。`,
          }
        : {}),
    };
  });
}
function renderPlanner(list) {
  const c = itineraryConfig(),
    places = itineraryPlaces(list, c);
  let result, error;
  try {
    result = WeekendPlanner.schedule(places, c);
  } catch (e) {
    error = e.message;
  }
  const clock = WeekendPlanner.clock;
  $("#main").innerHTML =
    `<div class="page-title"><span class="eyebrow">MAKE TIME FOR A LITTLE ADVENTURE</span><h1>让每一站，都刚刚好。</h1><p>把路上的时间算进去，把喜欢的地方留在合适的时刻。</p></div>${
      !list.length
        ? empty(
            "留一个位置，给下次出发",
            "去发现页挑选一个喜欢的活动，点击「加入计划」。",
          )
        : `
 <section class="route-controls" aria-labelledby="route-title"><div class="route-heading"><div><span class="eyebrow">01 / 出发设置</span><h2 id="route-title">安排一个不赶的周末</h2></div><span class="route-badge">${c.order === "manual" ? "按手动顺序" : "智能排序"}</span></div>
 <form id="route-settings" class="route-fields"><label class="field">出行日期<input name="date" type="date" required value="${esc(c.date)}"></label><label class="field">首站到达<input name="start" type="time" required value="${esc(c.start)}"></label><label class="field">最晚结束<input name="end" type="time" required value="${esc(c.end)}"></label><label class="field">交通方式<select name="mode">${routeOptions(routeModes, c.mode)}</select></label>${c.mode === "auto" ? `<label class="field">1 km 以内优先<select name="shortMode">${routeOptions({ walk: "步行", bike: "骑行" }, c.shortMode)}</select></label>` : ""}<button class="primary" type="submit">重新智能安排 ↗</button></form>
 <p class="route-help">智能搭配：估算路程 ≤ 1 km 按短途偏好，超过 1 km 用公共交通。也可选择全程交通方式，再逐段修改。首站前与末站后的路程不计入。</p></section>
 ${
   error
     ? `<p class="notice" role="alert">${esc(error)}</p>`
     : `<div class="plan-summary route-summary" aria-live="polite"><div><strong>${result.visits.length}<small> / ${list.length}</small></strong><span>已排入 / 想去的地方</span></div><div><strong>${result.totals.visit}<small> 分</small></strong><span>游玩时间</span></div><div><strong>${result.totals.travel}<small> 分</small></strong><span>转场时间</span></div><div><strong>${result.finish === null ? "—" : clock(result.finish)}</strong><span>行程结束 · 等待 ${result.totals.wait} 分钟</span></div></div>
 <section class="route-timeline" aria-label="行程时间轴"><div class="route-heading"><div><span class="eyebrow">02 / 今天的路线</span><h2>沿着时间，慢慢逛</h2></div><span class="route-help">优先排入更多地点，再贴近推荐时段</span></div>
 ${
   result.visits
     .map((v, i) => {
       const a = places.find((x) => x.id === v.id),
         prev = result.visits[i - 1];
       return `${v.leg ? `<div class="route-transfer"><span>↳ ${clock(prev.end)} 出发 · 约 ${v.leg.km.toFixed(1)} km · ${clock(v.arrival)} 到达</span><div><label>本段交通 <select aria-label="${esc(a.place)}前一段交通" data-leg-mode="${prev.id}>${a.id}">${routeOptions(Object.fromEntries(Object.entries(routeModes).filter(([k]) => k !== "auto")), v.leg.mode)}</select></label><label>耗时 <input aria-label="${esc(a.place)}前一段耗时" type="number" required min="1" max="600" value="${v.leg.minutes}" data-leg-minutes="${prev.id}>${a.id}"> 分</label><span>${v.leg.estimated ? "估算" : "手动设定"}</span><button class="text-button" data-leg-reset="${prev.id}>${a.id}">恢复估算</button></div></div>` : ""}${v.wait ? `<p class="route-wait">${clock(v.arrival)}–${clock(v.start)} · 等待 ${v.wait} 分钟${i === 0 ? "（可据此推迟首站到达）" : ""}</p>` : ""}<article class="route-stop"><div class="route-time">${clock(v.start)}<span>${clock(v.end)}</span></div><div><span class="route-badge">第 ${i + 1} 站 · ${v.duration} 分钟</span><h3>${esc(a.title)}</h3><p>${esc(a.place)}</p><p class="route-help">${a.hoursKind === "official" ? "官方开放时段" : a.hoursKind === "user" ? "你确认的开放时段" : "建议安排范围 · 开放待核实"} ${a.windows.map((w) => `${w.open}–${w.close}${w.lastEntry ? " / " + w.lastEntry + " 停止入场" : ""}`).join("、")}</p>${v.outsidePreferred ? '<p class="route-warning">为兼顾其他地点，本次未完全落在推荐游玩时段。</p>' : ""}</div><button class="text-button" onclick="editRouteStop('${a.id}')">调整停留 ↗</button></article>`;
     })
     .join("") ||
   '<p class="notice">当前没有可排入的地点，请查看下面的待安排原因。</p>'
 }
 ${result.unscheduled.length ? `<div class="route-pending"><h3>留待调整 · ${result.unscheduled.length} 个地点</h3>${result.unscheduled.map((x) => `<p><strong>${esc(getActivity(x.id).title)}</strong><br>${esc(x.reason)} <button class="text-button" onclick="editRouteStop('${x.id}')">调整</button></p>`).join("")}</div>` : ""}</section>`
 }
 <section class="route-places"><span class="eyebrow">03 / 地点清单</span><h2>每一站，按自己的节奏</h2><p class="route-help">清单人均活动预算约 ¥${list.reduce((sum, a) => sum + a.price, 0)} · 不含交通 · 上下移动地点可切换为手动顺序</p><div class="plan-list">${places.map((a, i) => `<article class="plan-row"><img src="${photo(a.image)}" alt="${esc(a.category)}氛围配图"><div class="plan-info"><h3>${esc(a.title)}</h3><p>${esc(a.place)} · 停留 ${a.duration} 分钟 · ${a.price === 0 ? "免费" : `¥${a.price}/人`}</p><p class="route-help">${esc(a.hoursNote)}</p>${a.preferred?.length ? `<p class="route-help">推荐游玩 ${a.preferred.map((p) => `${p.start}–${p.end}`).join("、")}（偏好，可调整）</p>` : ""}${a.hoursSource ? `<a href="${a.hoursSource}" target="_blank" rel="noopener">查看开放公告 ↗</a>` : ""}${a.locationSource ? ` <a href="${a.locationSource}" target="_blank" rel="noopener">查看位置 ↗</a>` : ""}</div><div class="row-actions"><button class="primary" onclick="editRouteStop('${a.id}')">停留与开放时间</button><div class="route-order"><button class="secondary" ${i === 0 ? "disabled" : ""} onclick="moveRouteStop('${a.id}',-1)" aria-label="上移${esc(a.place)}">↑</button><button class="secondary" ${i === list.length - 1 ? "disabled" : ""} onclick="moveRouteStop('${a.id}',1)" aria-label="下移${esc(a.place)}">↓</button><button class="secondary" onclick="teamForm('${a.id}')">组队</button><button class="secondary" onclick="journalForm('${a.id}')">打卡</button></div><button class="delete" onclick="removePlan('${a.id}')">移出计划</button></div></article>`).join("")}</div></section>
 <p class="notice">交通为估算：地点中心坐标的直线距离 × 1.35，再按步行 / 骑行 / 公交 / 汽车速度及候车余量计算，不代表实际道路或实时路况。跨江、换乘可能明显更久，请用地图核实并修改每段分钟数。可在停留时间中预留吃饭、休息余量。坐标来自 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>。个人行程仅保存在本机。</p>`
    }`;
  if (!list.length) return;
  const form = $("#route-settings");
  function saveSettings(smart) {
    if (!form.reportValidity()) return;
    const next = { ...c, ...Object.fromEntries(new FormData(form)) };
    if (
      next.date !== c.date ||
      next.mode !== c.mode ||
      next.shortMode !== c.shortMode
    )
      next.legs = {};
    if (smart) next.order = "auto";
    state.itinerary = next;
    persist();
    plans();
  }
  form.onchange = () => saveSettings(false);
  form.onsubmit = (e) => {
    e.preventDefault();
    saveSettings(true);
  };
  document
    .querySelectorAll("[data-leg-mode]")
    .forEach(
      (el) =>
        (el.onchange = () =>
          updateRouteLeg(el.dataset.legMode, { mode: el.value })),
    );
  document.querySelectorAll("[data-leg-minutes]").forEach(
    (el) =>
      (el.onchange = () => {
        if (!el.reportValidity()) return;
        const key = el.dataset.legMinutes;
        const mode = document.querySelector(`[data-leg-mode="${key}"]`).value;
        updateRouteLeg(key, { mode, minutes: Number(el.value) });
      }),
  );
  document
    .querySelectorAll("[data-leg-reset]")
    .forEach(
      (el) => (el.onclick = () => updateRouteLeg(el.dataset.legReset, null)),
    );
}
function updateRouteLeg(key, value) {
  const c = itineraryConfig();
  c.legs = { ...c.legs };
  if (value) c.legs[key] = value;
  else delete c.legs[key];
  state.itinerary = c;
  persist();
  plans();
}
function moveRouteStop(id, delta) {
  const i = state.plans.indexOf(id),
    j = i + delta;
  if (j < 0 || j >= state.plans.length) return;
  [state.plans[i], state.plans[j]] = [state.plans[j], state.plans[i]];
  state.itinerary = { ...itineraryConfig(), order: "manual" };
  persist();
  plans();
}
function editRouteStop(id) {
  const c = itineraryConfig(),
    a = itineraryPlaces([getActivity(id)], c)[0],
    saved = c.stops?.[id] || {},
    w = a.windows?.[0] || { open: "09:00", close: "17:00" };
  const custom = saved.hoursDate === c.date && saved.window;
  openModal(
    `<div class="modal-inner"><span class="eyebrow">给喜欢的地方，留足时间</span><h2>${esc(a.title)}</h2><form id="route-stop-form"><label class="field">游玩时长（分钟，含休息）<input name="duration" type="number" min="15" max="480" step="1" required value="${a.duration}"></label><p class="notice">${esc(a.hoursNote)}</p>${a.coords && !a.archived ? `<label class="route-check"><input name="confirmed" type="checkbox" ${custom ? "checked" : ""}> 我已核实 ${esc(c.date)} 的开放时间，使用以下时段</label><div class="route-fields"><label class="field">开放<input name="open" type="time" value="${w.open}" required></label><label class="field">关闭<input name="close" type="time" value="${w.close}" required></label><label class="field">停止入场（选填）<input name="lastEntry" type="time" value="${w.lastEntry || ""}"></label></div><p class="route-help">仅作用于该日期。取消勾选恢复原始资料；临时闭馆和预约仍需自行确认。</p>` : '<p class="notice">缺少具体场次或已下架，暂不能通过填写时间排入行程。</p>'}<p id="route-form-error" role="alert" class="route-warning"></p><button class="primary full" type="submit">保存并重新计算</button></form></div>`,
  );
  $("#route-stop-form").onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target)),
      stop = { ...saved, duration: Number(data.duration) };
    delete stop.window;
    delete stop.hoursDate;
    if (data.confirmed) {
      stop.window = {
        open: data.open,
        close: data.close,
        lastEntry: data.lastEntry,
      };
      stop.hoursDate = c.date;
    }
    const next = { ...c, stops: { ...c.stops, [id]: stop } };
    try {
      WeekendPlanner.schedule(
        itineraryPlaces(state.plans.map(getActivity), next),
        next,
      );
    } catch (err) {
      $("#route-form-error").textContent = err.message;
      return;
    }
    state.itinerary = next;
    persist();
    closeModal();
    plans();
    toast("已更新行程时间");
  };
}
