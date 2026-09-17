function departurePlace(id, c = itineraryConfig()) {
  if (id === "_origin")
    return roadPoint(
      { id, place: c.origin, locationName: c.origin, title: "出发地" },
      c,
    );
  if (id === "_return")
    return roadPoint(
      {
        id,
        place: c.destination,
        locationName: c.destination,
        title: "返程目的地",
      },
      c,
    );
  return itineraryPlaces([getActivity(id)], c)[0];
}
function departureLinks(a) {
  const source = WeekendDeparture.safeUrl(a.bookingUrl);
  return `<div class="departure-actions"><button class="secondary" onclick="openNavigation('${a.id}')"><i data-icon=compass></i> 地图与导航</button><button class="text-button" onclick="editDeparture('${a.id}')">${a.id === "culture-2026" ? "选择具体场次" : "核实入口与预约"} <i data-icon=arrow-up-right></i></button>${source ? `<a class="text-button" href="${esc(source)}" target="_blank" rel="noopener noreferrer">我的预约 / 场次来源 <i data-icon=external></i></a>` : ""}</div>`;
}
function departureSettings(c) {
  return `<div class="departure-settings"><label class="route-check"><input name="roundTrip" type="checkbox" ${c.roundTrip ? "checked" : ""}> 包含出发与返程，检查能否按时返回</label>${c.roundTrip ? `<div class="route-fields"><label class="field">出发地（学校 / 地址 / 入口）<input name="origin" maxlength="100" value="${esc(c.origin)}" placeholder="例如：武汉大学珞珈门"></label><label class="field">返程目的地<input name="destination" maxlength="100" value="${esc(c.destination)}" placeholder="例如：学校宿舍区入口"></label></div>` : ""}<label class="field">每段交通额外机动（分钟）<input name="buffer" type="number" min="0" max="120" required value="${c.buffer}" style="max-width:160px"></label><p class="route-help">启用后，上方时间分别表示从出发地出门、最晚回到返程目的地。可在行程地图选定首尾位置后计算道路，或手动填写出发与返程耗时；未知路程不会按 0 分钟排程。修改日期、全程方式或首尾地点会清除原有交通核实。</p></div>`;
}
function departureChecklist(places, c, result) {
  const raw = WeekendDeparture.issues(places, c, result),
    items = raw.filter((x) => x.action !== "traffic");
  if (raw.some((x) => x.action === "traffic"))
    items.push({
      action: "traffic",
      text: "交通耗时尚未全部核实，可集中补录后一次保存。",
    });
  const budget = WeekendPlanningAssistant.budget(places, budgetConfig());
  if (!budget.complete || budget.over)
    items.push({
      action: "budget",
      text: !budget.complete
        ? "全天预算还有缺项"
        : `全天人均费用超出预算 ¥${budget.over}`,
    });
  const control = (x) =>
    x.id
      ? `<button class="text-button" onclick="editDeparture('${x.id}')">核实本站</button>`
      : x.action === "traffic"
        ? '<button class="text-button" onclick="openBatchTraffic()">集中补录交通</button>'
        : x.action === "endpoints"
          ? '<button class="text-button" onclick="openRouteSettings()">添加出发与返程</button>'
          : x.action === "budget"
            ? '<button class="text-button" onclick="editDayBudget()">修改预算</button>'
            : "<button class=\"text-button\" onclick=\"document.querySelector('#route-conflicts')?.scrollIntoView({behavior:'smooth'})\">查看冲突方案</button>";
  return `<details class="departure-checklist ${items.length ? "" : "checked"}" aria-label="出发检查"><summary><strong>${items.length ? `草案待核实 · ${items.length} 项` : "已按你确认的信息完成检查"}</strong><span>展开集中处理</span></summary><p class="route-help">同一地点只核实一次，资料按当天保存。可以先看草案，出发前再核实。用户确认不代表实时票务与路况。</p>${items.length ? `<ul>${items.map((x) => `<li>${esc(x.text)} ${control(x)}</li>`).join("")}</ul>` : "<p>已覆盖地点资料、往返交通与全天预算。</p>"}<button class="secondary" onclick="openBatchTraffic()">集中核实交通</button></details>`;
}
function navigationPreview(from, to, mode) {
  if (!to?.trim()) return '<p class="notice">先填写具体地点，再查询地图。</p>';
  const route = WeekendDeparture.routeUrl(from, to, mode);
  return `<div class="departure-actions"><a class="secondary" href="${esc(WeekendDeparture.searchUrl(to))}" target="_blank" rel="noopener noreferrer">高德查地点 / 选择入口 <i data-icon=external></i></a>${route ? `<a class="primary" href="${esc(route)}" target="_blank" rel="noopener noreferrer">百度查看本段路线 <i data-icon=external></i></a>` : ""}</div><p class="route-help">${mode === "bike" ? "骑行请在高德确认地点后选择骑行并填写起点。" : !from?.trim() ? "可在地图中选择“到这里”，使用当前位置或自行填写起点。" : "百度将按名称解析起终点，请核对搜索结果，避免同名地点。"} 地图打开失败时，可复制下方地点在地图 App 中搜索。耗时不会自动回传。</p>`;
}
function openNavigation(id, fromId, mode) {
  const c = itineraryConfig(),
    a = departurePlace(id, c),
    from = fromId ? departurePlace(fromId, c).locationName : c.origin;
  openModal(
    `<div class="modal-inner"><span class="eyebrow">找到准确的入口，再出发</span><h2>地图与导航</h2><p>${esc(a.title)}</p>${!a.entranceConfirmed && id !== "_return" ? '<p class="notice">当前为地点名称，尚未确认具体入口。请在地图里选对入口后，回到“核实入口与预约”保存。</p>' : ""}<form id="navigation-form"><label class="field">起点（可选）<input name="from" maxlength="100" value="${esc(from || "")}"></label><label class="field">目的地 / 入口<input name="to" maxlength="100" value="${esc(a.locationName || "")}"></label><label class="field">交通方式<select name="mode">${routeOptions({ transit: "公共交通", walk: "步行", bike: "骑行", car: "打车 / 自驾" }, mode || (c.mode === "auto" ? "transit" : c.mode))}</select></label></form><div id="navigation-preview"></div><button class="text-button" id="copy-destination">复制目的地名称</button><p class="route-help">只有点击地图链接时，起终点才会发送到对应地图服务。</p></div>`,
  );
  const form = $("#navigation-form"),
    update = () => {
      const d = Object.fromEntries(new FormData(form));
      $("#navigation-preview").innerHTML = navigationPreview(
        d.from,
        d.to,
        d.mode,
      );
    };
  form.oninput = update;
  form.onsubmit = (e) => e.preventDefault();
  $("#copy-destination").onclick = () => copyText(new FormData(form).get("to"));
  update();
}
function openTraffic(fromId, toId) {
  const c = itineraryConfig(),
    places = itineraryPlaces(
      state.plans.map(getActivity).filter(Boolean),
      c,
    ).filter((a) => a.locationName);
  const fromOptions = [
    ...(c.roundTrip
      ? [{ id: "_origin", locationName: c.origin || "出发地（先填写）" }]
      : []),
    ...places,
  ];
  const toOptions = [
    ...places,
    ...(c.roundTrip
      ? [{ id: "_return", locationName: c.destination || "返程地（先填写）" }]
      : []),
  ];
  if (!fromOptions.length || !toOptions.length) {
    toast("请先选择具体地点或场次");
    return;
  }
  fromId = fromId || fromOptions[0].id;
  toId = toId || toOptions.find((a) => a.id !== fromId)?.id || toOptions[0].id;
  const opts = (list, id) =>
    list
      .map(
        (a) =>
          `<option value="${a.id}" ${a.id === id ? "selected" : ""}>${esc(a.locationName)}</option>`,
      )
      .join("");
  openModal(
    `<div class="modal-inner"><span class="eyebrow">查路线，填耗时，重新排程</span><h2>核实一段交通</h2><form id="traffic-form"><div class="route-fields"><label class="field">从<select name="from">${opts(fromOptions, fromId)}</select></label><label class="field">到<select name="to">${opts(toOptions, toId)}</select></label></div><label class="field">交通方式<select name="mode">${routeOptions({ transit: "公共交通", walk: "步行", bike: "骑行", car: "打车 / 自驾" }, "transit")}</select></label><div id="traffic-links"></div><label class="field">地图显示的本段耗时（分钟）<input name="minutes" type="number" required min="1" max="600" step="1"></label><label class="route-check"><input name="verified" type="checkbox"> 我已核对起终点、出行方式和所选日期的路线耗时</label><p class="route-help">机动时间会额外加入，不要在此重复计算。未勾选会记录为“手动估算”。地图结果只代表查询时的情况。</p><p id="traffic-error" class="route-warning" role="alert"></p><button class="primary full" type="submit">保存耗时并重新排程</button></form></div>`,
  );
  const form = $("#traffic-form");
  function update(pairChanged) {
    const d = Object.fromEntries(new FormData(form)),
      a = departurePlace(d.from, c),
      b = departurePlace(d.to, c);
    if (pairChanged) {
      const previous = c.legs?.[`${d.from}>${d.to}`];
      let estimate;
      try {
        estimate = WeekendPlanner.travel(a, b, c);
      } catch {}
      form.elements.mode.value =
        previous?.mode ||
        estimate?.mode ||
        (c.mode === "auto" ? "transit" : c.mode);
      form.elements.minutes.value =
        previous?.minutes ?? estimate?.minutes ?? "";
      form.elements.verified.checked = !!previous?.verified;
    } else {
      form.elements.verified.checked = false;
      form.elements.minutes.value = "";
    }
    $("#traffic-links").innerHTML = navigationPreview(
      a.locationName,
      b.locationName,
      form.elements.mode.value,
    );
  }
  form.elements.from.onchange = () => update(true);
  form.elements.to.onchange = () => update(true);
  form.elements.mode.onchange = () => update(false);
  form.elements.minutes.oninput = () => {
    form.elements.verified.checked = false;
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form)),
      a = departurePlace(d.from, c),
      b = departurePlace(d.to, c);
    if (
      d.from === d.to ||
      (d.from === "_origin" && d.to === "_return") ||
      !a.locationName?.trim() ||
      !b.locationName?.trim()
    ) {
      $("#traffic-error").textContent =
        "请选择两个不同且名称完整的地点；首尾路程需经过活动地点。";
      return;
    }
    state.itinerary = {
      ...c,
      legs: {
        ...c.legs,
        [`${d.from}>${d.to}`]: {
          mode: d.mode,
          minutes: Number(d.minutes),
          verified: !!d.verified,
          date: c.date,
        },
      },
    };
    persist();
    closeModal();
    plans();
    toast("已计入交通与机动时间");
  };
  update(true);
}
function editDeparture(
  id,
  date = location.hash === "#plans" ? itineraryConfig().date : filters.date,
) {
  const previous = itineraryConfig();
  const c = {
      ...previous,
      date,
      legs: date === previous.date ? previous.legs : {},
    },
    original = getActivity(id),
    a = departurePlace(id, c),
    saved = c.stops?.[id] || {},
    current = saved.checksDate === c.date,
    season = id === "culture-2026",
    session = saved.session || {},
    win = a.windows?.[0] || { open: "09:00", close: "17:00" };
  openModal(
    `<div class="modal-inner"><span class="eyebrow">${esc(c.date)} · 当日出发资料</span><h2>${season ? "选择具体活动场次" : "核实入口与预约"}</h2><p>${esc(original.title)}</p>${original.source ? `<a class="secondary" href="${esc(original.source.url)}" target="_blank" rel="noopener noreferrer">官方开放 / 预约说明 <i data-icon=external></i></a>` : ""}<p class="notice">${esc(original.booking)}${id === "optics-library" ? " 请在微信搜索“光谷图书馆”公众号办理预约。" : ""}</p><form id="departure-form">${season ? `<label class="field">具体场次名称<input name="sessionTitle" maxlength="100" required value="${esc(session.title || "")}"></label><p class="route-help">仅选择武汉场次；日期为 ${esc(c.date)}。此处记录你的选择，不提供订票。</p>` : ""}<label class="field">准确地点 / 入口名称<input name="entrance" maxlength="100" required value="${esc(season ? session.venue || "" : saved.entrance || original.place)}" placeholder="例如：武汉博物馆游客入口，青年路373号"></label><div id="entrance-search"></div><label class="route-check"><input name="entranceConfirmed" type="checkbox" ${a.entranceConfirmed ? "checked" : ""}> 已在地图核对具体入口</label><label class="field">${season ? "场次开始" : "当天开放"}<input name="open" type="time" required value="${season ? session.start || "14:00" : win.open}"></label><label class="field">${season ? "场次结束" : "当天关闭"}<input name="close" type="time" required value="${season ? session.end || "16:00" : win.close}"></label>${season ? "" : `<label class="field">停止入场（选填）<input name="lastEntry" type="time" value="${win.lastEntry || ""}"></label>`}<label class="route-check"><input name="openingConfirmed" type="checkbox" ${a.openingConfirmed ? "checked" : ""}> 已核实 ${esc(c.date)} 的${season ? "场次时间" : "开放时间，使用以上时段"}</label><label class="route-check"><input name="closed" type="checkbox" ${current && saved.closed ? "checked" : ""}> 该日关闭 / 活动取消</label><label class="field">预约 / 领票状态<select name="reservation">${routeOptions(WeekendDeparture.labels, a.reservation)}</select></label>${season ? "" : `<div class="route-fields"><label class="field">预约入场开始（选填）<input name="slotStart" type="time" value="${a.slot?.start || ""}"></label><label class="field">预约入场截止（选填）<input name="slotEnd" type="time" value="${a.slot?.end || ""}"></label></div><p class="route-help">已预约时，在该窗口内入场；完整游玩仍需在闭馆前结束。</p>`}<label class="field">预约 / 场次来源网址（选填）<input name="bookingUrl" type="url" maxlength="500" placeholder="https://..." value="${esc(current ? saved.bookingUrl || "" : "")}"></label><p class="route-help">状态仅代表你的确认，不代表实时余票。换日期后须重新核实；更换入口会清除相关路段的旧耗时。</p><p id="departure-error" class="route-warning" role="alert"></p><button class="primary full" type="submit">${state.plans.includes(id) ? "保存并重新检查" : "保存并加入计划"}</button></form></div>`,
  );
  const form = $("#departure-form");
  const search = () => {
    $("#entrance-search").innerHTML =
      `<a class="text-button" href="${esc(WeekendDeparture.searchUrl(form.elements.entrance.value))}" target="_blank" rel="noopener noreferrer">在高德核对入口 <i data-icon=external></i></a>`;
  };
  form.elements.entrance.oninput = () => {
    form.elements.entranceConfirmed.checked = false;
    search();
  };
  search();
  form.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    try {
      if (!d.entrance.trim() || (season && !d.sessionTitle.trim()))
        throw Error("请填写准确地点和具体场次名称，不能只填空格");
      const start = WeekendPlanner.time(d.open),
        end = WeekendPlanner.time(d.close);
      if (start >= end)
        throw Error("关闭 / 结束时间须晚于开始（暂不支持跨天）");
      if (
        d.lastEntry &&
        (WeekendPlanner.time(d.lastEntry) < start ||
          WeekendPlanner.time(d.lastEntry) > end)
      )
        throw Error("停止入场时间须位于开放时段内");
      if (
        (d.slotStart || d.slotEnd) &&
        (!d.slotStart || !d.slotEnd || d.slotStart >= d.slotEnd)
      )
        throw Error("请填写完整、有效的预约入场时段");
      if (d.bookingUrl && !WeekendDeparture.safeUrl(d.bookingUrl))
        throw Error("来源网址须使用 http 或 https");
      if (season && (end - start < 15 || end - start > 480))
        throw Error("单场时长须为 15–480 分钟");
      if (!WeekendActivities.available(original, c.date))
        throw Error("该日期不在活动有效期 / 开放日内");
      const stop = {
        ...saved,
        entrance: d.entrance.trim(),
        entranceConfirmed: !!d.entranceConfirmed,
        openingConfirmed: !!d.openingConfirmed,
        closed: !!d.closed,
        reservation: d.reservation,
        checksDate: c.date,
        bookingUrl: d.bookingUrl,
        slot: d.slotStart ? { start: d.slotStart, end: d.slotEnd } : null,
      };
      if (season)
        stop.session = {
          title: d.sessionTitle.trim(),
          venue: d.entrance.trim(),
          date: c.date,
          start: d.open,
          end: d.close,
        };
      else {
        delete stop.window;
        delete stop.hoursDate;
        if (d.openingConfirmed) {
          stop.window = {
            open: d.open,
            close: d.close,
            lastEntry: d.lastEntry,
          };
          stop.hoursDate = c.date;
        }
      }
      const legs = { ...c.legs };
      if (
        (saved.entrance || original.place) !== stop.entrance ||
        (season &&
          JSON.stringify(saved.session) !== JSON.stringify(stop.session))
      )
        for (const key of Object.keys(legs))
          if (key.split(">").includes(id)) delete legs[key];
      state.itinerary = { ...c, stops: { ...c.stops, [id]: stop }, legs };
      if (!state.plans.includes(id)) state.plans.push(id);
      persist();
      closeModal();
      location.hash = "plans";
      plans();
      toast("已保存当日出发资料");
    } catch (err) {
      $("#departure-error").textContent = err.message;
    }
  };
}
