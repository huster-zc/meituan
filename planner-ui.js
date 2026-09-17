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
    const prepared = WeekendDeparture.prepare(
      a,
      WeekendPlanningData[a.id] || {
        windows: [],
        hoursKind: "unknown",
        hoursNote: "开放安排待核实",
      },
      c.stops?.[a.id] || {},
      c.date,
    );
    return typeof roadPoint === "function" ? roadPoint(prepared, c) : prepared;
  });
}
function renderPlanner(list) {
  if (typeof disposeRoadMap === "function") disposeRoadMap();
  if (list.length && !state.itinerary?.budget) {
    state.itinerary = { ...itineraryConfig(), budget: budgetConfig() };
    persist();
  }
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
    `<div class="page-title"><span class="eyebrow">MAKE TIME FOR A LITTLE ADVENTURE</span><h1>让每一站，都刚刚好。</h1><p>把路上的时间算进去，把喜欢的地方留在合适的时刻。</p></div>${planningUndoHtml()}${
      !list.length
        ? empty(
            "留一个位置，给下次出发",
            "去发现页挑选一个喜欢的活动，点击「加入计划」。",
          )
        : `
 ${renderDayBudget(list)}${renderRoadPanel(places, c, result)}
 <details class="route-controls" id="route-settings-panel" ${error ? "open" : ""}><summary>调整日期、出发时间与交通方式</summary><div class="route-heading"><div><span class="eyebrow">01 / 出发设置</span><h2 id="route-title">安排一个不赶的周末</h2></div><span class="route-badge">${c.order === "manual" ? "按手动顺序" : "智能排序"}</span></div>
 <form id="route-settings" class="route-fields"><label class="field">出行日期<input name="date" type="date" required value="${esc(c.date)}"></label><label class="field">${c.roundTrip ? "从出发地出门" : "首站到达"}<input name="start" type="time" required value="${esc(c.start)}"></label><label class="field">${c.roundTrip ? "最晚返回" : "最晚结束"}<input name="end" type="time" required value="${esc(c.end)}"></label><label class="field">交通方式<select name="mode">${routeOptions(routeModes, c.mode)}</select></label>${c.mode === "auto" ? `<label class="field">1 km 以内优先<select name="shortMode">${routeOptions({ walk: "步行", bike: "骑行" }, c.shortMode)}</select></label>` : ""}${departureSettings(c)}<button class="primary" type="submit">重新智能安排 <i data-icon=arrow-up-right></i></button></form>
 <p class="route-help">智能搭配：估算路程 ≤ 1 km 按短途偏好，超过 1 km 用公共交通。也可选择全程交通方式，再逐段修改。${c.roundTrip ? "出发和返程交通也必须填写并计入。" : "当前仅规划地点之间，请启用出发与返程检查。"}</p></details>
 ${
   error
     ? `<p class="notice" role="alert">${esc(error)}</p>`
     : `<div class="plan-summary route-summary" aria-live="polite"><div><strong>${result.visits.length}<small> / ${list.length}</small></strong><span>已排入 / 想去的地方</span></div><div><strong>${result.totals.visit}<small> 分</small></strong><span>游玩时间</span></div><div><strong>${result.totals.travel}<small> 分</small></strong><span>转场时间</span></div><div><strong>${result.finish === null ? "—" : clock(result.finish)}</strong><span>${c.roundTrip ? "回到返程目的地" : "行程结束"} · 等待 ${result.totals.wait} 分 / 机动 ${result.totals.buffer} 分</span></div></div>
 <section class="route-timeline" aria-label="行程时间轴"><div class="route-heading"><div><span class="eyebrow">02 / 行程草案</span><h2>沿着时间，慢慢逛</h2></div><span class="route-help">优先排入更多地点，再贴近推荐时段</span></div>
 ${
   result.visits
     .map((v, i) => {
       const a = places.find((x) => x.id === v.id),
         prev = result.visits[i - 1];
       return `${v.leg ? `<div class="route-transfer"><span><i data-icon=turn></i> ${clock(prev ? prev.end : WeekendPlanner.time(c.start))} 出发 · ${v.leg.km === null ? "路程以地图为准" : `约 ${v.leg.km.toFixed(1)} km`} · ${clock(v.arrival)} 到达</span><div><label>本段交通 <select aria-label="${esc(a.place)}前一段交通" data-leg-mode="${prev ? prev.id : "_origin"}>${a.id}">${routeOptions(Object.fromEntries(Object.entries(routeModes).filter(([k]) => k !== "auto")), v.leg.mode)}</select></label><label>耗时 <input aria-label="${esc(a.place)}前一段耗时" type="number" required min="1" max="600" value="${v.leg.minutes}" data-leg-minutes="${prev ? prev.id : "_origin"}>${a.id}"> 分</label><span>${v.leg.roadResolved ? "OSRM 道路模型 · 非实时" : v.leg.verified ? "地图核实后手填" : v.leg.estimated ? "距离估算 · 待核实" : "手动估算 · 待核实"}</span><button class="text-button" onclick="openTraffic('${prev ? prev.id : "_origin"}','${a.id}')">查路线并核实</button><span>另含机动 ${v.buffer} 分</span><button class="text-button" data-leg-reset="${prev ? prev.id : "_origin"}>${a.id}">恢复估算</button></div></div>` : ""}${v.wait ? `<p class="route-wait">${clock(v.arrival)}–${clock(v.start)} · 等待 ${v.wait} 分钟${i === 0 ? "（可据此推迟首站到达）" : ""}</p>` : ""}<article class="route-stop"><div class="route-time">${clock(v.start)}<span>${clock(v.end)}</span></div><div><span class="route-badge">第 ${i + 1} 站 · ${v.duration} 分钟</span><h3>${esc(a.title)}</h3><p>${esc(a.locationName || a.place)}</p><p class="route-help">${esc(WeekendDeparture.labels[a.reservation])} · ${a.entranceConfirmed ? "入口已确认" : "入口待确认"}</p>${departureLinks(a)}<p class="route-help">${a.hoursKind === "official" ? "官方开放时段" : a.hoursKind === "user" ? "你确认的开放时段" : "建议安排范围 · 开放待核实"} ${a.windows.map((w) => `${w.open}–${w.close}${w.lastEntry ? " / " + w.lastEntry + " 停止入场" : ""}`).join("、")}</p>${v.outsidePreferred ? '<p class="route-warning">为兼顾其他地点，本次未完全落在推荐游玩时段。</p>' : ""}</div><button class="text-button" onclick="editRouteStop('${a.id}')">调整停留 <i data-icon=arrow-up-right></i></button></article>`;
     })
     .join("") ||
   '<p class="notice">当前没有可排入的地点，请查看下面的待安排原因。</p>'
 }
 ${result.returnLeg ? `<div class="route-transfer"><strong>返程：${esc(c.destination)}</strong><p>${clock(result.visits.at(-1).end)} 离开末站 → ${clock(result.finish)} 返回 · 交通 ${result.returnLeg.minutes} 分 + 机动 ${c.buffer} 分</p><p>${result.returnLeg.roadResolved ? "OSRM 道路模型 · 非实时" : result.returnLeg.verified ? "地图核实后手填" : "耗时待地图核实"}</p><button class="secondary" onclick="openTraffic('${result.visits.at(-1).id}','_return')">查看返程路线 / 修改耗时</button></div>` : ""}
 ${renderConflicts(places, c, result)}</section>${departureChecklist(places, c, result)}`
 }
 <section class="route-places"><span class="eyebrow">03 / 地点清单</span><h2>每一站，按自己的节奏</h2><p class="route-help">清单人均活动预算约 ¥${list.reduce((sum, a) => sum + a.price, 0)} · 不含交通 · 上下移动地点可切换为手动顺序</p><div class="plan-list">${places.map((a, i) => `<article class="plan-row"><img src="${photo(a.image)}" alt="${esc(a.category)}氛围配图"><div class="plan-info"><h3>${esc(a.title)}</h3><p>${esc(a.place)} · 停留 ${a.duration} 分钟 · ${a.price === 0 ? "免费" : `¥${a.price}/人`}</p><p class="route-help">${esc(a.hoursNote)}</p><p class="route-help">${esc(WeekendDeparture.labels[a.reservation])}</p>${departureLinks(a)}${a.preferred?.length ? `<p class="route-help">推荐游玩 ${a.preferred.map((p) => `${p.start}–${p.end}`).join("、")}（偏好，可调整）</p>` : ""}${a.hoursSource ? `<a href="${a.hoursSource}" target="_blank" rel="noopener">查看开放公告 <i data-icon=external></i></a>` : ""}${a.locationSource ? ` <a href="${a.locationSource}" target="_blank" rel="noopener">查看位置 <i data-icon=external></i></a>` : ""}</div><div class="row-actions"><button class="primary" onclick="editRouteStop('${a.id}')">停留与开放时间</button><div class="route-order"><button class="secondary" ${i === 0 ? "disabled" : ""} onclick="moveRouteStop('${a.id}',-1)" aria-label="上移${esc(a.place)}"><i data-icon=arrow-up></i></button><button class="secondary" ${i === list.length - 1 ? "disabled" : ""} onclick="moveRouteStop('${a.id}',1)" aria-label="下移${esc(a.place)}"><i data-icon=arrow-down></i></button><button class="secondary" onclick="teamForm('${a.id}')">组队</button><button class="secondary" onclick="journalForm('${a.id}')">打卡</button></div><button class="delete" onclick="removePlan('${a.id}')">移出计划</button></div></article>`).join("")}</div></section>
 <p class="notice">交通来源逐段标注：OSRM 为道路模型估算；未取得道路数据且有参考坐标时，以直线距离 × 1.35 和交通速度估算，不能视为实际路线。公交没有接入班次接口。跨江、换乘可能明显更久，请用地图核实并修改每段分钟数。可在停留时间中预留吃饭、休息余量。坐标来自 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>。个人行程仅保存在本机。</p>`
    }`;
  if (!list.length) return;
  if (typeof mountRoadMap === "function") mountRoadMap(places, c, result);
  const form = $("#route-settings");
  function saveSettings(smart) {
    if (!form.reportValidity()) return;
    const next = {
      ...c,
      ...Object.fromEntries(new FormData(form)),
      roundTrip: form.elements.roundTrip.checked,
    };
    if (
      next.date !== c.date ||
      next.mode !== c.mode ||
      next.shortMode !== c.shortMode ||
      next.origin !== c.origin ||
      next.destination !== c.destination ||
      next.roundTrip !== c.roundTrip
    )
      next.legs = {};
    if (smart) next.order = "auto";
    state.itinerary = next;
    persist();
    plans();
  }
  form.onchange = (e) => {
    if (["roundTrip", "mode", "shortMode"].includes(e.target.name))
      saveSettings(false);
  };
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
  if (id === "culture-2026") {
    editDeparture(id);
    return;
  }
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
    stop.openingConfirmed = false;
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
