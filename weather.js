(function (root) {
  "use strict";
  const ENDPOINT =
    "https://api.open-meteo.com/v1/forecast?latitude=30.5928&longitude=114.3055&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FShanghai&forecast_days=14";
  const CACHE_KEY = "weekend-wuhan-weather-v1";
  const CODES = new Set([
    0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
    80, 81, 82, 85, 86, 95, 96, 99,
  ]);
  function chinaDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  function weekendDates(now = new Date()) {
    const d = new Date(chinaDate(now) + "T00:00:00Z");
    if (d.getUTCDay() === 0) return [d.toISOString().slice(0, 10)];
    d.setUTCDate(d.getUTCDate() + (6 - d.getUTCDay()));
    const saturday = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
    return [saturday, d.toISOString().slice(0, 10)];
  }
  function describe(code) {
    if (code === 0) return "晴";
    if (code <= 2) return "晴间多云";
    if (code === 3) return "阴";
    if (code <= 48) return "雾";
    if (code <= 57) return "毛毛雨";
    if (code <= 67) return "雨";
    if (code <= 77) return "雪";
    if (code <= 82) return "阵雨";
    if (code <= 86) return "阵雪";
    return "雷雨";
  }
  function validRow(r) {
    return (
      r &&
      /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
      [r.min, r.max, r.code, r.rain].every(Number.isFinite) &&
      r.min <= r.max &&
      r.min >= -90 &&
      r.max <= 65 &&
      r.rain >= 0 &&
      r.rain <= 100 &&
      CODES.has(r.code)
    );
  }
  function normalize(data) {
    const d = data?.daily;
    if (!Array.isArray(d?.time) || !d.time.length) throw Error("预报缺少日期");
    return d.time.map((date, i) => {
      const row = {
        date,
        min: d.temperature_2m_min?.[i],
        max: d.temperature_2m_max?.[i],
        code: d.weather_code?.[i],
        rain: d.precipitation_probability_max?.[i],
      };
      if (!validRow(row)) throw Error("预报字段缺失或无效");
      return {
        ...row,
        label: describe(row.code),
        outdoorRisk: row.code >= 45 || row.rain >= 50,
      };
    });
  }
  function usableCache(cache, now, maxAge) {
    return (
      cache &&
      Number.isFinite(cache.fetchedAt) &&
      now.getTime() >= cache.fetchedAt &&
      now.getTime() - cache.fetchedAt < maxAge &&
      Array.isArray(cache.rows) &&
      cache.rows.every(validRow) &&
      weekendDates(now).every((date) => cache.rows.some((r) => r.date === date))
    );
  }
  async function loadForecast({
    now = new Date(),
    cache = null,
    fetcher = fetch,
    timeoutMs = 8000,
    force = false,
  } = {}) {
    const fromCache = (status) => ({
      status,
      fetchedAt: cache.fetchedAt,
      rows: cache.rows.map((r) => ({
        ...r,
        label: describe(r.code),
        outdoorRisk: r.code >= 45 || r.rain >= 50,
      })),
    });
    if (!force && usableCache(cache, now, 30 * 60 * 1000))
      return fromCache("cached");
    const controller = new AbortController();
    let timer;
    try {
      const request = (async () => {
        const response = await fetcher(ENDPOINT, {
          signal: controller.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const rows = normalize(await response.json());
        if (
          !weekendDates(now).every((date) => rows.some((r) => r.date === date))
        )
          throw Error("预报未覆盖当前周末");
        return rows;
      })();
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("天气请求超时"));
        }, timeoutMs);
      });
      const rows = await Promise.race([request, timeout]);
      return { status: "live", fetchedAt: now.getTime(), rows };
    } catch {
      if (usableCache(cache, now, 24 * 60 * 60 * 1000))
        return fromCache("stale");
      return { status: "unavailable", fetchedAt: null, rows: [] };
    } finally {
      clearTimeout(timer);
    }
  }
  const api = {
    ENDPOINT,
    CACHE_KEY,
    chinaDate,
    weekendDates,
    normalize,
    loadForecast,
    describe,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WeekendWeather = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
