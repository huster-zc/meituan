let planningUndo = null;
function renderConflicts(items, c, result) {
  if (!result.unscheduled.length) return "";
  return `<div class="route-pending" id="route-conflicts"><h3>需要调整 · ${result.unscheduled.length} 个地点</h3>${result.unscheduled.map((x) => `<section class="solution"><strong>${esc(items.find((a) => a.id === x.id).title)}</strong><p>${esc(WeekendPlanningAssistant.explain(items, c, result, x.id).reason)}</p><button class="primary" onclick="openConflict(\'${x.id}\')">查看可行调整</button></section>`).join("")}</div>`;
}
const planningSignature = () => JSON.stringify([state.plans, state.itinerary]);
function rememberPlanningChange(ids, config, message) {
  const before = {
    ids: [...state.plans],
    config: JSON.parse(JSON.stringify(state.itinerary || null)),
  };
  state.plans = ids;
  state.itinerary = config;
  persist();
  planningUndo = { ...before, signature: planningSignature() };
  closeModal();
  plans();
  toast(message);
}
function undoPlanningChange() {
  if (!planningUndo || planningUndo.signature !== planningSignature()) {
    toast("计划已继续修改，无法撤销这次旧调整");
    return;
  }
  state.plans = planningUndo.ids;
  state.itinerary = planningUndo.config;
  planningUndo = null;
  persist();
  plans();
  toast("已恢复调整前的计划");
}
function planningUndoHtml() {
  return planningUndo?.signature === planningSignature()
    ? '<div class="notice">刚才的调整已应用。<button class="text-button" onclick="undoPlanningChange()">撤销这次调整</button></div>'
    : "";
}
function budgetConfig() {
  return {
    limit: filters.budget ?? 150,
    food: 30,
    transport: 20,
    ...state.itinerary?.budget,
  };
}
function renderDayBudget(list) {
  const b = WeekendPlanningAssistant.budget(list, budgetConfig());
  return `<section class="day-budget ${b.over ? "over" : ""}" aria-label="全天人均预算"><div><span class="eyebrow">全天人均预算 · 含待安排地点</span><h2>¥${b.total} <small>/ ${b.limit === null ? "未设上限" : `¥${b.limit}`}</small></h2><p>活动 ¥${b.activities} + 额外餐饮 ${b.food === null ? "待填" : `¥${b.food}`} + 全天交通 ${b.transport === null ? "待填" : `¥${b.transport}`}</p><p class="route-help">餐饮、交通是可修改的预留，含首尾交通；活动内已计的消费不要重复预留。</p><strong>${!b.complete ? "预算有缺项，当前为已知费用小计" : b.over ? `超出 ¥${b.over}，出发前需要调整` : `预算内，还余 ¥${b.remaining}`}</strong></div><div class="departure-actions"><button class="secondary" onclick="editDayBudget()">修改预算</button>${b.over ? '<button class="primary" onclick="openBudgetOptions()">查看省钱方案</button>' : ""}</div></section>`;
}
function editDayBudget() {
  const b = budgetConfig();
  openModal(
    `<div class="modal-inner"><span class="eyebrow">整天花多少，一眼算清</span><h2>全天人均预算</h2><form id="day-budget-form">${[
      ["limit", "全天人均上限"],
      ["food", "额外餐饮预留"],
      ["transport", "全天交通预留（含出发与返程）"],
    ]
      .map(
        ([key, label]) =>
          `<label class="field">${label}（元）<input name="${key}" type="number" min="0" max="99999" step="0.01" value="${esc(b[key] ?? "")}"></label>`,
      )
      .join(
        "",
      )}<p class="route-help">默认餐饮 ¥30、交通 ¥20 仅作起步预留，不是实际报价。留空表示未知，填 0 表示明确不预留。费用不会乘以同行人数。</p><p id="budget-error" role="alert"></p><button class="primary full">保存预算</button></form></div>`,
  );
  $("#day-budget-form").onsubmit = (e) => {
    e.preventDefault();
    try {
      const budget = Object.fromEntries(new FormData(e.target));
      WeekendPlanningAssistant.budget(state.plans.map(getActivity), budget);
      state.itinerary = { ...itineraryConfig(), budget };
      persist();
      closeModal();
      plans();
    } catch (err) {
      $("#budget-error").textContent = err.message;
    }
  };
}
function openBudgetOptions() {
  const list = state.plans.map(getActivity),
    c = itineraryConfig(),
    b = budgetConfig(),
    trim = WeekendPlanningAssistant.trimBudget(list, b);
  const replacements = [];
  for (const old of [...list].sort((a, b) => b.price - a.price)) {
    const cheaper = activities
      .filter(
        (a) =>
          !state.plans.includes(a.id) &&
          a.id !== "culture-2026" &&
          WeekendActivities.available(a, c.date) &&
          a.price < old.price &&
          (!old.indoor || a.indoor),
      )
      .sort(
        (a, b) =>
          (a.category !== old.category) - (b.category !== old.category) ||
          a.price - b.price,
      );
    if (cheaper[0]) replacements.push({ old, next: cheaper[0] });
  }
  openModal(
    `<div class="modal-inner"><span class="eyebrow">先看影响，再决定</span><h2>把一天安排在预算里</h2><p>当前全部想去地点 + 餐饮与交通预留：¥${WeekendPlanningAssistant.budget(list, b).total}。</p>${trim.possible && trim.remove.length ? `<section class="solution"><h3>减少 ${trim.remove.length} 站，预计 ¥${trim.after.total}</h3><p>移出：${trim.remove.map((id) => esc(getActivity(id).place)).join("、")}。餐饮和交通预留保持不变。</p><button class="primary" id="apply-budget-trim">应用精简方案</button></section>` : '<p class="notice">请先补齐预算；若餐饮与交通预留已超上限，仅减少地点也无法达标。</p>'}${replacements
      .map((r, i) => {
        const after = WeekendPlanningAssistant.budget(
          list.map((a) => (a.id === r.old.id ? r.next : a)),
          b,
        );
        return `<section class="solution"><h3>${esc(r.old.place)} → ${esc(r.next.place)}</h3><p>省 ¥${r.old.price - r.next.price}，全天预计 ¥${after.total}${after.over ? `，仍超 ¥${after.over}` : "，预算内"}。</p><p class="route-help">替换后重新检查时间、预约与路线，不保证原有行程仍可行。</p><button class="secondary" data-budget-swap="${i}">换成这个地点</button></section>`;
      })
      .join(
        "",
      )}<button class="text-button" onclick="editDayBudget()">调整餐饮、交通或预算上限</button><p class="route-help">以上只是预览，点击应用才修改清单；应用后可撤销。</p></div>`,
  );
  const button = $("#apply-budget-trim");
  if (button)
    button.onclick = () =>
      rememberPlanningChange(
        state.plans.filter((id) => !trim.remove.includes(id)),
        c,
        "已按预览精简，可撤销",
      );
  document.querySelectorAll("[data-budget-swap]").forEach(
    (button) =>
      (button.onclick = () => {
        const r = replacements[+button.dataset.budgetSwap];
        rememberPlanningChange(
          state.plans.map((id) => (id === r.old.id ? r.next.id : id)),
          c,
          "已替换地点并重新检查，可撤销",
        );
      }),
  );
}
function openConflict(id) {
  const c = itineraryConfig(),
    items = itineraryPlaces(state.plans.map(getActivity), c),
    result = WeekendPlanner.schedule(items, c);
  const info = WeekendPlanningAssistant.resolve(items, c, result, id),
    a = items.find((a) => a.id === id);
  openModal(
    `<div class="modal-inner"><span class="eyebrow">找到原因，再做调整</span><h2>${esc(a.title)}</h2><p class="notice">${esc(info.reason)}</p>${info.actions
      .map((action, i) => {
        const changed = WeekendPlanningAssistant.apply(items, c, action),
          preview = WeekendPlanner.schedule(changed.items, changed.config);
        return `<section class="solution"><h3>${esc(action.label)}</h3><p>重新排程后可安排 ${preview.visits.length} 站，${WeekendPlanner.clock(preview.finish)} ${c.roundTrip ? "返回" : "结束"}，保留当前已排入的地点。</p><button class="primary" data-apply-solution="${i}">应用这个调整</button></section>`;
      })
      .join(
        "",
      )}${!info.actions.length ? "<p>暂没有只改一项就能解决的时间方案，可补齐资料、调整多个条件，或将本站留到下次。</p>" : ""}<div class="departure-actions"><button class="secondary" onclick="openBatchTraffic()">集中补录交通</button><button class="secondary" onclick="editDeparture('${id}')">核实本站资料</button><button class="text-button" id="defer-stop">本站留到下次（移出计划）</button></div><p class="route-help">方案按当前资料验证，实际开放与路况仍须确认。缩短停留会减少游玩时间；应用后可撤销。</p></div>`,
  );
  document.querySelectorAll("[data-apply-solution]").forEach(
    (button) =>
      (button.onclick = () => {
        const action = info.actions[+button.dataset.applySolution],
          changed = WeekendPlanningAssistant.apply(items, c, action);
        rememberPlanningChange(
          [...state.plans],
          changed.config,
          "已应用调整并重新排程，可撤销",
        );
      }),
  );
  $("#defer-stop").onclick = () =>
    rememberPlanningChange(
      state.plans.filter((x) => x !== id),
      c,
      "已移出本站，可撤销",
    );
}
function openRouteSettings() {
  const d = $("#route-settings-panel");
  if (d) {
    d.open = true;
    d.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
function openBatchTraffic() {
  const c = itineraryConfig(),
    items = itineraryPlaces(state.plans.map(getActivity), c);
  let result;
  try {
    result = WeekendPlanner.schedule(items, c);
  } catch (e) {
    toast(e.message);
    closeModal();
    openRouteSettings();
    return;
  }
  const sequence = [
    ...result.visits.map((v) => items.find((a) => a.id === v.id)),
    ...items.filter((a) => !result.visits.some((v) => v.id === a.id)),
  ].filter((a) => a.locationName);
  const nodes = [
    ...(c.roundTrip ? [{ id: "_origin", locationName: c.origin }] : []),
    ...sequence,
    ...(c.roundTrip ? [{ id: "_return", locationName: c.destination }] : []),
  ];
  const pairs = nodes.slice(1).map((to, i) => ({ from: nodes[i], to }));
  if (!pairs.length) {
    toast("只有一个地点；可展开出发设置，添加出发与返程。");
    closeModal();
    openRouteSettings();
    return;
  }
  openModal(
    `<div class="modal-inner"><span class="eyebrow">不用反复选起终点</span><h2>集中核实交通</h2><p class="route-help">按当前时间轴顺序，待安排地点接在末尾；最终顺序可能改变。未确定场地的活动先补资料。距离估算已预填，可先保存为草案。</p><form id="batch-traffic-form">${pairs
      .map(({ from, to }, i) => {
        const estimate = WeekendPlanner.travel(from, to, c),
          saved = c.legs?.[`${from.id}>${to.id}`];
        return `<fieldset class="traffic-row"><legend>${i + 1}. ${esc(from.locationName)} → ${esc(to.locationName)}</legend><label class="field">交通方式<select name="mode${i}">${routeOptions({ transit: "公共交通", walk: "步行", bike: "骑行", car: "打车 / 自驾" }, estimate?.mode || "transit")}</select></label><div id="batch-links-${i}"></div><label class="field">本段分钟数<input name="minutes${i}" type="number" min="1" max="600" step="1" value="${estimate?.minutes ?? ""}" placeholder="未知可留空"></label><label class="route-check"><input type="checkbox" name="verified${i}" ${saved?.verified ? "checked" : ""}> 已在地图核实本段</label></fieldset>`;
      })
      .join(
        "",
      )}<p class="route-help">不勾选表示手动估算；留空会清除本段旧耗时。地图不会自动回传分钟数，机动时间另计。</p><button class="primary full">一次保存全部路段</button></form></div>`,
  );
  const form = $("#batch-traffic-form");
  pairs.forEach(({ from, to }, i) => {
    const mode = form.elements[`mode${i}`],
      minutes = form.elements[`minutes${i}`],
      verified = form.elements[`verified${i}`];
    const links = () => {
      const route = WeekendDeparture.routeUrl(
        from.locationName,
        to.locationName,
        mode.value,
      );
      $(`#batch-links-${i}`).innerHTML =
        `<div class="departure-actions"><a class="text-button" href="${esc(WeekendDeparture.searchUrl(to.locationName))}" target="_blank" rel="noopener noreferrer">${mode.value === "bike" ? "高德查地点后选骑行" : "高德核对入口"} <i data-icon=external></i></a>${route ? `<a class="text-button" href="${esc(route)}" target="_blank" rel="noopener noreferrer">百度查本段路线 <i data-icon=external></i></a>` : ""}</div>`;
    };
    links();
    mode.onchange = () => {
      minutes.value = "";
      verified.checked = false;
      links();
    };
    minutes.oninput = () => {
      verified.checked = false;
    };
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const legs = { ...c.legs };
    pairs.forEach(({ from, to }, i) => {
      const value = form.elements[`minutes${i}`].value,
        key = `${from.id}>${to.id}`;
      if (value === "") delete legs[key];
      else
        legs[key] = {
          mode: form.elements[`mode${i}`].value,
          minutes: +value,
          verified: form.elements[`verified${i}`].checked,
          date: c.date,
        };
    });
    state.itinerary = { ...c, legs };
    persist();
    closeModal();
    plans();
    toast("已一次保存交通，时间轴已更新");
  };
}
