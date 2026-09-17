const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../weather.js");
const now = new Date("2026-09-17T04:00:00Z");
function response() {
  return {
    daily: {
      time: ["2026-09-19", "2026-09-20"],
      temperature_2m_min: [22.2, 23.8],
      temperature_2m_max: [29.7, 30.6],
      weather_code: [3, 53],
      precipitation_probability_max: [4, 14],
    },
  };
}
test("weekend dates follow Wuhan timezone, including Sunday and year rollover", () => {
  assert.deepEqual(W.weekendDates(now), ["2026-09-19", "2026-09-20"]);
  assert.deepEqual(W.weekendDates(new Date("2026-09-19T17:00:00Z")), [
    "2026-09-20",
  ]);
  assert.deepEqual(W.weekendDates(new Date("2026-12-31T12:00:00Z")), [
    "2027-01-02",
    "2027-01-03",
  ]);
});
test("forecast uses weather codes as well as rain probability", () => {
  const rows = W.normalize(response());
  assert.equal(rows[0].outdoorRisk, false);
  assert.equal(rows[1].outdoorRisk, true);
  const high = response();
  high.daily.precipitation_probability_max[0] = 70;
  assert.equal(W.normalize(high)[0].outdoorRisk, true);
});
test("null, missing and invalid values cannot masquerade as a sunny zero-degree forecast", () => {
  for (const field of [
    "temperature_2m_min",
    "temperature_2m_max",
    "weather_code",
    "precipitation_probability_max",
  ]) {
    const bad = response();
    bad.daily[field][0] = null;
    assert.throws(() => W.normalize(bad));
  }
  assert.throws(() => W.normalize({}));
});
test("fresh cache avoids network calls and preserves original fetch timestamp", async () => {
  let calls = 0;
  const cache = {
    fetchedAt: now.getTime() - 1000,
    rows: W.normalize(response()),
  };
  const out = await W.loadForecast({
    now,
    cache,
    fetcher: async () => {
      calls++;
      throw Error();
    },
  });
  assert.equal(calls, 0);
  assert.equal(out.status, "cached");
  assert.equal(out.fetchedAt, cache.fetchedAt);
});
test("network success parses fresh forecast; HTTP errors are not treated as success", async () => {
  const out = await W.loadForecast({
    now,
    fetcher: async () => ({ ok: true, json: async () => response() }),
  });
  assert.equal(out.status, "live");
  assert.equal(out.rows.length, 2);
  const failed = await W.loadForecast({
    now,
    fetcher: async () => ({ ok: false, status: 429 }),
  });
  assert.equal(failed.status, "unavailable");
  assert.deepEqual(failed.rows, []);
});
test("failure serves at most 24-hour cache with a stale label, never expired data", async () => {
  const fetcher = async () => {
    throw Error("offline");
  };
  let cache = {
    fetchedAt: now.getTime() - 3600000,
    rows: W.normalize(response()),
  };
  assert.equal((await W.loadForecast({ now, cache, fetcher })).status, "stale");
  cache.fetchedAt = now.getTime() - 25 * 3600000;
  assert.equal(
    (await W.loadForecast({ now, cache, fetcher })).status,
    "unavailable",
  );
});
test("uncovered dates and malformed cache are never reused", async () => {
  const fetcher = async () => {
    throw Error("offline");
  };
  const cache = { fetchedAt: now.getTime(), rows: [{ date: "2026-09-12" }] };
  assert.equal(
    (await W.loadForecast({ now, cache, fetcher })).status,
    "unavailable",
  );
});
test("slow network times out instead of leaving the interface loading forever", async () => {
  const out = await W.loadForecast({
    now,
    timeoutMs: 10,
    fetcher: () => new Promise(() => {}),
  });
  assert.equal(out.status, "unavailable");
});
