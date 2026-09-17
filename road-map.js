let roadMap = null,
  roadClient = null,
  roadGeneration = 0,
  roadLastKey = "",
  roadActiveKey = "",
  roadMessage = "",
  roadWarnings = [];
const roadColors = [
  "#285442",
  "#bb693a",
  "#426ba0",
  "#885a9b",
  "#a48624",
  "#347f7d",
  "#954856",
  "#586543",
];
function roadPoint(a, c) {
  const picked = c.mapPoints?.[a.id];
  return {
    ...a,
    coords:
      picked?.name === a.locationName &&
      WeekendRoadRouting.validPoint(picked.coords)
        ? picked.coords
        : a.coords,
    picked: !!(
      picked?.name === a.locationName &&
      WeekendRoadRouting.validPoint(picked.coords)
    ),
  };
}
function roadNodes(places, c, result) {
  const stops = result?.visits.length
    ? result.visits.map((v) => places.find((a) => a.id === v.id))
    : places.filter((a) => a.locationName);
  return [
    ...(c.roundTrip
      ? [
          roadPoint(
            { id: "_origin", title: "出发地", locationName: c.origin },
            c,
          ),
        ]
      : []),
    ...stops,
    ...(c.roundTrip
      ? [
          roadPoint(
            { id: "_return", title: "返程地", locationName: c.destination },
            c,
          ),
        ]
      : []),
  ];
}
function roadMode(a, b, c) {
  const override = c.legs?.[`${a.id}>${b.id}`]?.mode;
  return override && override !== "auto"
    ? override
    : WeekendPlanner.chooseMode(
        WeekendRoadRouting.validPoint(a.coords) &&
          WeekendRoadRouting.validPoint(b.coords)
          ? WeekendPlanner.distance(a.coords, b.coords)
          : Infinity,
        c,
      );
}
function roadShape(a, b, mode, c) {
  const s = c.roadShapes?.[`${a.id}>${b.id}:${mode}`];
  return s &&
    s.fromPoint === WeekendRoadRouting.pointKey(a.coords) &&
    s.toPoint === WeekendRoadRouting.pointKey(b.coords) &&
    Date.now() - s.fetchedAt >= 0 &&
    Date.now() - s.fetchedAt < WeekendRoadRouting.TTL
    ? s
    : null;
}
function roadSignature() {
  const c = itineraryConfig();
  return JSON.stringify([
    state.plans,
    c.date,
    c.start,
    c.end,
    c.order,
    c.mode,
    c.shortMode,
    c.roundTrip,
    c.origin,
    c.destination,
    c.mapPoints,
    c.stops,
    c.legs,
  ]);
}
function renderRoadPanel(places, c, result) {
  const nodes = roadNodes(places, c, result),
    all = [
      ...(c.roundTrip
        ? [
            roadPoint(
              { id: "_origin", locationName: c.origin, title: "出发地" },
              c,
            ),
          ]
        : []),
      ...places,
      ...(c.roundTrip
        ? [
            roadPoint(
              { id: "_return", locationName: c.destination, title: "返程地" },
              c,
            ),
          ]
        : []),
    ];
  return `<section class="road-panel" aria-label="站点之间的道路路线"><div class="route-heading"><div><span class="eyebrow">上一站 → 下一站</span><h2>把行程连成一条路</h2></div><button class="primary" id="road-calculate">${c.roadEnabled ? "更新道路路线" : "计算道路路线"}</button></div><div class="road-toolbar"><label>整程方式 <select id="road-mode">${routeOptions(routeModes, c.mode)}</select></label><span>自动返回道路距离与预计耗时，更新下方时间轴</span>${c.roadEnabled ? '<button class="text-button" id="road-pause">暂停自动查询</button>' : ""}</div><p class="route-help">步行 / 骑行 / 驾车使用 OSRM 道路模型，不含实时路况。智能搭配在 1 km 内用短途偏好，其余公交仍需跳转查询。首次点击计算后，改顺序、方式或位置会自动更新。</p><p id="road-status" class="road-status" role="status">${esc(roadMessage || "尚未查询道路。默认标记为地点参考点，可先在地图确认具体入口。")}</p><div id="road-map" aria-label="行程道路地图"></div><p id="road-tile-status" class="route-help"></p><div class="road-point-tools"><label class="field">定位地点 / 入口<select id="road-target">${all.map((a) => `<option value="${a.id}">${esc(a.locationName || a.title)} · ${a.picked ? "已选点" : WeekendRoadRouting.validPoint(a.coords) ? "参考点" : "待定位"}</option>`).join("")}</select></label><button class="secondary" id="road-pick">在地图上选点</button><button class="text-button" id="road-focus">查看此点</button><form id="road-point-form"><details><summary>查看 / 输入 WGS84 坐标</summary><div class="route-fields"><label class="field">纬度<input id="road-lat" type="number" step="any" min="-85" max="85" required></label><label class="field">经度<input id="road-lon" type="number" step="any" min="-180" max="180" required></label></div><p class="route-help">高德、百度坐标不能直接粘贴到这里，优先使用本地图选点。</p></details><button class="secondary" type="submit">保存选点并重算</button></form><p id="road-point-hint" class="route-help">先选择地点，再点“在地图上选点”。保存后才会更新位置及相关路线。</p></div><h3>${result?.visits.length ? "当前时间轴的逐段路线" : "地点清单路线预览 · 尚未排入时间轴"}</h3>${result?.unscheduled.length ? `<p class="route-help">${result.unscheduled.length} 站尚未排入；有已排入站点时，地图仅连接已排入的路线。</p>` : ""}<div class="road-legs">${
    nodes
      .slice(1)
      .map((b, i) => {
        const a = nodes[i],
          mode = roadMode(a, b, c),
          shape = roadShape(a, b, mode, c),
          record = WeekendRoadRouting.lookup(a, b, mode, c.roadLegs),
          manual = c.legs?.[`${a.id}>${b.id}`]?.minutes;
        const missing =
            !WeekendRoadRouting.validPoint(a.coords) ||
            !WeekendRoadRouting.validPoint(b.coords),
          link = WeekendDeparture.routeUrl(
            a.locationName,
            b.locationName,
            mode,
          );
        const status = missing
          ? "先在地图补齐起终点"
          : mode === "transit"
            ? "公交 / 地铁：需在地图查询并回填"
            : record?.unreachable
              ? "当前方式无可用道路或超过单日耗时范围"
              : shape
                ? `${shape.km.toFixed(1)} km · 道路模型约 ${shape.minutes} 分钟${manual ? `；排程使用手填 ${manual} 分钟` : ""}`
                : record
                  ? `${record.km.toFixed(1)} km · 道路模型约 ${record.minutes} 分钟，线路待加载`
                  : "道路尚未查到，时间轴可能仍使用距离估算";
        return `<article class="road-leg"><span class="road-swatch" style="background:${roadColors[i % roadColors.length]}"></span><div><strong>${i + 1}. ${esc(a.locationName || a.title)} → ${esc(b.locationName || b.title)}</strong><p>${esc(status)}</p>${shape ? `<small>查询于 ${new Date(shape.fetchedAt).toLocaleString("zh-CN", { hour12: false })} · 模型预计，非实时</small>` : ""}<div class="departure-actions"><label>本段方式 <select data-road-mode="${a.id}>${b.id}" aria-label="${esc(a.locationName)}到${esc(b.locationName)}的方式">${routeOptions({ walk: "步行", bike: "骑行", car: "打车 / 自驾", transit: "公交 / 地铁" }, mode)}</select></label>${shape ? `<button class="secondary" onclick="openRoadSteps('${a.id}','${b.id}','${mode}')">逐段指引</button>` : ""}${link ? `<a class="text-button" href="${esc(link)}" target="_blank" rel="noopener noreferrer">地图 App 路线 <i data-icon=external></i></a>` : ""}<button class="text-button" onclick="openTraffic('${a.id}','${b.id}')">手动修正耗时</button></div></div></article>`;
      })
      .join("") ||
    '<p class="notice">至少两个地点才能查询站间路线；也可在出发设置中添加出发地与返程地。</p>'
  }</div><details class="road-source"><summary>数据来源与查询说明</summary><p>地图与道路数据：<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>；路径计算：<a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">OSRM · FOSSGIS</a>。<a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">反馈地图错误</a>。计算会将所选坐标发送到 FOSSGIS，道路查询串行限速，缓存最多24小时。公共服务无可用性保证，失败时请重试或手动查路线。</p><p>只画接口返回的道路，不用直线冒充路线。参考点不保证是游客入口；模型结果不等于实时导航，现场标识优先。</p></details></section>`;
}
function disposeRoadMap() {
  if (roadMap) {
    roadMap.remove();
    roadMap = null;
  }
}
function mountRoadMap(places, c, result) {
  const host = $("#road-map");
  if (!host) return;
  const nodes = roadNodes(places, c, result),
    all = [
      ...(c.roundTrip
        ? [
            roadPoint(
              { id: "_origin", locationName: c.origin, title: "出发地" },
              c,
            ),
          ]
        : []),
      ...places,
      ...(c.roundTrip
        ? [
            roadPoint(
              { id: "_return", locationName: c.destination, title: "返程地" },
              c,
            ),
          ]
        : []),
    ];
  let selection = null,
    pickMarker = null;
  if (typeof L !== "undefined") {
    // Replanning replaces the map; avoid zoom callbacks after its panes are removed.
    roadMap = L.map(host, { scrollWheelZoom: false, zoomAnimation: false }).setView(
      [30.56, 114.32],
      12,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
      .on("tileerror", () => {
        if ($("#road-tile-status"))
          $("#road-tile-status").textContent =
            "底图暂不可用，已获取的道路线路与时间信息仍可查看。";
      })
      .addTo(roadMap);
    const bounds = [];
    nodes.forEach((a, i) => {
      if (!WeekendRoadRouting.validPoint(a.coords)) return;
      const ll = [a.coords.lat, a.coords.lon];
      bounds.push(ll);
      L.marker(ll, {
        icon: L.divIcon({
          className: "road-pin",
          html: String(i + 1),
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      })
        .bindTooltip(esc(a.locationName || a.title))
        .addTo(roadMap);
    });
    nodes.slice(1).forEach((b, i) => {
      const a = nodes[i],
        shape = roadShape(a, b, roadMode(a, b, c), c);
      if (shape) {
        L.geoJSON(shape.geometry, {
          style: {
            color: roadColors[i % roadColors.length],
            weight: 5,
            opacity: 0.9,
          },
        }).addTo(roadMap);
        shape.geometry.coordinates.forEach((p) => bounds.push([p[1], p[0]]));
      }
    });
    if (bounds.length)
      roadMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    roadMap.on("click", (e) => {
      if (!selection) return;
      $("#road-lat").value = e.latlng.lat.toFixed(6);
      $("#road-lon").value = e.latlng.lng.toFixed(6);
      if (pickMarker) pickMarker.remove();
      pickMarker = L.circleMarker(e.latlng, {
        radius: 9,
        color: "#c96c43",
      }).addTo(roadMap);
      $("#road-point-hint").textContent =
        "已选中地图位置，点击“保存选点并重算”应用。";
    });
  } else
    host.innerHTML =
      '<p class="notice">地图组件未加载，可通过坐标字段指定位置，路线耗时查询仍可使用。</p>';
  function selectPoint() {
    selection = null;
    const a = all.find((a) => a.id === $("#road-target").value);
    $("#road-lat").value = a?.coords?.lat ?? "";
    $("#road-lon").value = a?.coords?.lon ?? "";
  }
  selectPoint();
  $("#road-target").onchange = selectPoint;
  $("#road-focus").onclick = () => {
    const a = all.find((a) => a.id === $("#road-target").value);
    if (WeekendRoadRouting.validPoint(a?.coords))
      roadMap?.setView([a.coords.lat, a.coords.lon], 16);
    else toast("这个地点尚未选点，请点击地图或输入坐标");
  };
  $("#road-pick").onclick = () => {
    selection = $("#road-target").value;
    $("#road-point-hint").textContent = "现在点击地图上的实际入口，再保存。";
    roadMap?.getContainer().focus();
  };
  $("#road-point-form").onsubmit = (e) => {
    e.preventDefault();
    const a = all.find((a) => a.id === $("#road-target").value),
      coords = { lat: +$("#road-lat").value, lon: +$("#road-lon").value };
    if (!a?.locationName?.trim()) {
      toast("请先在出发设置或场次资料填写地点名称");
      return;
    }
    if (!WeekendRoadRouting.validPoint(coords)) {
      toast("请填写有效的 WGS84 经纬度");
      return;
    }
    const next = itineraryConfig(),
      legs = { ...next.legs };
    for (const key of Object.keys(legs))
      if (key.split(">").includes(a.id)) delete legs[key];
    state.itinerary = {
      ...next,
      legs,
      mapPoints: {
        ...next.mapPoints,
        [a.id]: { name: a.locationName, coords },
      },
    };
    persist();
    plans();
    toast("已保存选点，相关手填耗时已清除");
  };
  $("#road-calculate").onclick = () => {
    state.itinerary = { ...itineraryConfig(), roadEnabled: true };
    persist();
    roadLastKey = "";
    plans();
  };
  if ($("#road-pause"))
    $("#road-pause").onclick = () => {
      roadGeneration++;
      roadActiveKey = "";
      roadLastKey = "";
      state.itinerary = { ...itineraryConfig(), roadEnabled: false };
      persist();
      roadMessage = "自动查询已暂停，已有道路数据在有效期内仍参与排程。";
      plans();
    };
  $("#road-mode").onchange = (e) => {
    state.itinerary = { ...itineraryConfig(), mode: e.target.value, legs: {} };
    persist();
    plans();
  };
  document
    .querySelectorAll("[data-road-mode]")
    .forEach(
      (el) =>
        (el.onchange = () =>
          updateRouteLeg(el.dataset.roadMode, { mode: el.value })),
    );
  if (c.roadEnabled) setTimeout(() => updateRoadRoutes(), 0);
}
async function updateRoadRoutes() {
  if (location.hash !== "#plans" || !state.itinerary?.roadEnabled) return;
  const signature = roadSignature();
  if (signature === roadLastKey || signature === roadActiveKey) return;
  const token = ++roadGeneration;
  roadActiveKey = signature;
  roadWarnings = [];
  const current = () =>
    token === roadGeneration &&
    roadSignature() === signature &&
    location.hash === "#plans" &&
    state.itinerary?.roadEnabled;
  const status = (text) => {
    roadMessage = text;
    if (current() && $("#road-status")) $("#road-status").textContent = text;
  };
  try {
    if (!roadClient) {
      let storage = null;
      try {
        storage = localStorage;
      } catch {}
      roadClient = WeekendRoadRouting.createClient({ storage });
    }
    const c = itineraryConfig(),
      places = itineraryPlaces(state.plans.map(getActivity), c),
      all = roadNodes(places, c, null).filter((a) =>
        WeekendRoadRouting.validPoint(a.coords),
      );
    if (all.length < 2) {
      status("至少需要两个有效地图选点。请补齐具体地点 / 首尾位置。");
      return;
    }
    const modes = new Set();
    all.forEach((a) =>
      all.forEach((b) => {
        if (a.id !== b.id) {
          const mode = roadMode(a, b, c);
          if (
            WeekendRoadRouting.profiles[mode] &&
            !WeekendRoadRouting.lookup(a, b, mode, c.roadLegs)
          )
            modes.add(mode);
        }
      }),
    );
    let records = { ...c.roadLegs };
    for (const mode of modes) {
      if (!current()) return;
      status(`正在查询${routeModes[mode]}道路耗时，完成后重算顺序…`);
      try {
        Object.assign(records, await roadClient.table(all, mode));
      } catch (error) {
        roadWarnings.push(`${routeModes[mode]}：${error.message}`);
      }
    }
    if (!current()) return;
    state.itinerary = { ...itineraryConfig(), roadLegs: records };
    const next = itineraryConfig(),
      items = itineraryPlaces(state.plans.map(getActivity), next);
    let result;
    try {
      result = WeekendPlanner.schedule(items, next);
    } catch (error) {
      roadWarnings.push(error.message);
    }
    const nodes = roadNodes(items, next, result),
      shapes = {};
    for (let i = 1; i < nodes.length; i++) {
      if (!current()) return;
      const a = nodes[i - 1],
        b = nodes[i],
        mode = roadMode(a, b, next),
        key = `${a.id}>${b.id}:${mode}`;
      if (
        !WeekendRoadRouting.profiles[mode] ||
        !WeekendRoadRouting.validPoint(a.coords) ||
        !WeekendRoadRouting.validPoint(b.coords)
      )
        continue;
      const record = WeekendRoadRouting.lookup(a, b, mode, records);
      if (!record || record.unreachable) continue;
      const cached = roadShape(a, b, mode, next);
      if (cached) {
        shapes[key] = cached;
        continue;
      }
      status(`正在绘制第 ${i} 段：${a.locationName} → ${b.locationName}`);
      try {
        shapes[key] = await roadClient.route([a, b], mode);
      } catch (error) {
        roadWarnings.push(
          `${a.locationName} → ${b.locationName}：${error.message}`,
        );
      }
    }
    if (!current()) return;
    state.itinerary = { ...itineraryConfig(), roadShapes: shapes };
    persist();
    status(
      roadWarnings.length
        ? `部分道路查询失败：${roadWarnings.join("；")}。未获取路段会明确保留估算或待补录。`
        : `已更新 ${Object.keys(shapes).length} 段道路路线，耗时已用于排程。公交不由此接口计算；没有线路时请检查方式、选点和待安排原因。`,
    );
  } catch (error) {
    if (current()) status(`道路查询失败：${error.message}。可重试或手动修正。`);
  } finally {
    if (token === roadGeneration) {
      roadActiveKey = "";
      if (current()) {
        roadLastKey = signature;
        plans();
      }
    }
  }
}
function openRoadSteps(fromId, toId, mode) {
  const c = itineraryConfig(),
    a = departurePlace(fromId, c),
    b = departurePlace(toId, c),
    shape = roadShape(a, b, mode, c);
  if (!shape) {
    toast("路线已失效，请重新计算");
    return;
  }
  const turns = {
    left: "左转",
    right: "右转",
    "slight left": "向左前方",
    "slight right": "向右前方",
    "sharp left": "向左后方",
    "sharp right": "向右后方",
    straight: "直行",
    uturn: "掉头",
  };
  openModal(
    `<div class="modal-inner"><span class="eyebrow">${esc(routeModes[mode])} · 道路模型指引</span><h2>${esc(a.locationName)} → ${esc(b.locationName)}</h2><p>${shape.km.toFixed(1)} km · 约 ${shape.minutes} 分钟，不含实时路况。</p><ol class="road-steps">${shape.steps.map((s) => `<li>${s.type === "depart" ? "出发" : s.type === "arrive" ? "到达目的地" : s.type.includes("roundabout") ? "通过环岛" : turns[s.modifier] || "继续前行"}${s.name ? ` · ${esc(s.name)}` : ""}${s.meters ? `，约 ${Math.round(s.meters)} 米` : ""}</li>`).join("")}</ol><p class="route-help">不是实时语音导航，请以现场通行规则、标志和地图 App 为准。</p></div>`,
  );
}
