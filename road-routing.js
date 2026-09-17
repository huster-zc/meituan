(function (root) {
  "use strict";
  const TTL = 86400000,
    profiles = { walk: "foot", bike: "bike", car: "car" };
  const validPoint = (p) =>
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lon === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 85 &&
    Math.abs(p.lon) <= 180;
  const pointKey = (p) =>
    validPoint(p) ? `${p.lon.toFixed(6)},${p.lat.toFixed(6)}` : "";
  function url(service, points, mode) {
    if (!profiles[mode]) throw Error("该接口不支持公交 / 地铁");
    if (
      !["table", "route"].includes(service) ||
      points.length < 2 ||
      points.length > 9 ||
      points.some((p) => !validPoint(p.coords))
    )
      throw Error("请在地图上补齐有效选点");
    const coordinates = points
      .map((p) => `${p.coords.lon},${p.coords.lat}`)
      .join(";");
    const options =
      service === "table"
        ? "annotations=duration,distance"
        : "overview=full&geometries=geojson&steps=true";
    return `https://routing.openstreetmap.de/routed-${profiles[mode]}/${service}/v1/${profiles[mode]}/${coordinates}?${options}&generate_hints=false&radiuses=${points.map(() => 300).join(";")}`;
  }
  function check(raw, waypoints, count) {
    if (raw?.code !== "Ok")
      throw Error(
        raw?.code === "NoSegment"
          ? "选点附近没有可用道路，请调整入口位置"
          : `道路查询失败：${raw?.code || "无效响应"}`,
      );
    if (
      !Array.isArray(waypoints) ||
      waypoints.length !== count ||
      waypoints.some(
        (p) =>
          !Number.isFinite(p.distance) || p.distance < 0 || p.distance > 300,
      )
    )
      throw Error("选点离可用道路过远，请在地图调整入口");
  }
  const metric = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  function parseTable(raw, points, mode, fetchedAt) {
    check(raw, raw?.sources, points.length);
    check(raw, raw.destinations, points.length);
    if (
      !Array.isArray(raw.durations) ||
      !Array.isArray(raw.distances) ||
      raw.durations.length !== points.length ||
      raw.distances.length !== points.length
    )
      throw Error("道路时距数据不完整");
    const records = {};
    points.forEach((a, i) =>
      points.forEach((b, j) => {
        if (i === j) return;
        const seconds = raw.durations[i]?.[j],
          meters = raw.distances[i]?.[j];
        const unreachable = seconds === null && meters === null;
        if (!unreachable && (!metric(seconds) || !metric(meters)))
          throw Error("道路时距数据无效");
        records[`${a.id}>${b.id}:${mode}`] = {
          mode,
          fromPoint: pointKey(a.coords),
          toPoint: pointKey(b.coords),
          fetchedAt,
          source: "osrm",
          unreachable: unreachable || seconds > 36000,
          minutes: unreachable ? null : Math.max(1, Math.ceil(seconds / 60)),
          km: unreachable ? null : meters / 1000,
        };
      }),
    );
    return records;
  }
  function parseRoute(raw, points, mode, fetchedAt) {
    check(raw, raw?.waypoints, points.length);
    const r = raw.routes?.[0],
      coordinates = r?.geometry?.coordinates;
    if (
      !metric(r?.duration) ||
      !metric(r?.distance) ||
      r.duration > 36000 ||
      r.geometry?.type !== "LineString" ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      coordinates.length > 100000 ||
      coordinates.some(
        (p) => !Array.isArray(p) || !validPoint({ lon: p[0], lat: p[1] }),
      )
    )
      throw Error("道路线路数据无效或耗时超出单日范围");
    return {
      mode,
      fromPoint: pointKey(points[0].coords),
      toPoint: pointKey(points.at(-1).coords),
      fetchedAt,
      minutes: Math.max(1, Math.ceil(r.duration / 60)),
      km: r.distance / 1000,
      geometry: r.geometry,
      steps: (r.legs || [])
        .flatMap((l) => l.steps || [])
        .map((s) => ({
          name: typeof s.name === "string" ? s.name : "",
          meters: metric(s.distance) ? s.distance : 0,
          type: s.maneuver?.type || "",
          modifier: s.maneuver?.modifier || "",
        })),
    };
  }
  function lookup(a, b, mode, records, now = Date.now()) {
    const r = records?.[`${a.id}>${b.id}:${mode}`];
    if (
      !r ||
      r.source !== "osrm" ||
      r.mode !== mode ||
      !Number.isFinite(r.fetchedAt) ||
      now - r.fetchedAt < 0 ||
      now - r.fetchedAt >= TTL ||
      r.fromPoint !== pointKey(a.coords) ||
      !r.fromPoint ||
      r.toPoint !== pointKey(b.coords) ||
      !r.toPoint
    )
      return null;
    if (
      !r.unreachable &&
      (!Number.isInteger(r.minutes) ||
        r.minutes < 1 ||
        r.minutes > 600 ||
        !metric(r.km))
    )
      return null;
    return r;
  }
  function createClient({
    fetchImpl = fetch,
    now = Date.now,
    gap = 1100,
    timeout = 12000,
    storage = null,
  } = {}) {
    let queue = Promise.resolve(),
      lastStart = 0;
    const cache = new Map();
    try {
      for (const [key, value] of JSON.parse(
        storage?.getItem("weekend-road-cache-v1") || "[]",
      ))
        if (now() - value.at >= 0 && now() - value.at < TTL)
          cache.set(key, value);
    } catch {}
    function request(service, points, mode) {
      const address = url(service, points, mode);
      const task = queue
        .catch(() => {})
        .then(async () => {
          const parse = service === "table" ? parseTable : parseRoute,
            cached = cache.get(address);
          if (cached && now() - cached.at >= 0 && now() - cached.at < TTL) {
            try {
              return parse(cached.raw, points, mode, cached.at);
            } catch {
              cache.delete(address);
            }
          }
          const delay = Math.max(0, gap - (now() - lastStart));
          if (delay) await new Promise((r) => setTimeout(r, delay));
          lastStart = now();
          const controller = new AbortController(),
            timer = setTimeout(() => controller.abort(), timeout);
          try {
            const response = await fetchImpl(address, {
              signal: controller.signal,
            });
            if (!response.ok)
              throw Error(`道路服务暂不可用（HTTP ${response.status}）`);
            const raw = await response.json(),
              at = now(),
              parsed = parse(raw, points, mode, at);
            cache.set(address, { raw, at });
            while (cache.size > 24) cache.delete(cache.keys().next().value);
            try {
              storage?.setItem(
                "weekend-road-cache-v1",
                JSON.stringify([...cache]),
              );
            } catch {}
            return parsed;
          } catch (error) {
            if (error.name === "AbortError")
              throw Error("道路服务请求超时，请稍后重试");
            throw error;
          } finally {
            clearTimeout(timer);
          }
        });
      queue = task;
      return task;
    }
    return {
      table: (points, mode) => request("table", points, mode),
      route: (points, mode) => request("route", points, mode),
    };
  }
  const api = {
    TTL,
    profiles,
    validPoint,
    pointKey,
    url,
    parseTable,
    parseRoute,
    lookup,
    createClient,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WeekendRoadRouting = api;
})(globalThis);
