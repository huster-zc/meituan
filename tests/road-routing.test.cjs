const test = require("node:test"),
  assert = require("node:assert/strict");
const R = require("../road-routing.js");
const P = require("../planner.js");
test("expired response cache is refreshed and network starts respect the configured gap", async () => {
  let calls = 0,
    now = 1000;
  const starts = [];
  const client = R.createClient({
    gap: 0,
    now: () => now,
    fetchImpl: async () => {
      calls++;
      return { ok: true, json: async () => raw };
    },
  });
  await client.table([a, b], "bike");
  now += R.TTL + 1;
  await client.table([a, b], "bike");
  assert.equal(calls, 2);
  const limited = R.createClient({
    gap: 25,
    fetchImpl: async () => {
      starts.push(Date.now());
      return { ok: true, json: async () => raw };
    },
  });
  await Promise.all([
    limited.table([a, b], "bike"),
    limited.table([a, b], "walk"),
  ]);
  assert.ok(starts[1] - starts[0] >= 24);
});
test("timeout stops waiting and never returns a fake successful route", async () => {
  const client = R.createClient({
    gap: 0,
    timeout: 5,
    fetchImpl: (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () =>
          reject(Object.assign(Error("aborted"), { name: "AbortError" })),
        ),
      ),
  });
  await assert.rejects(client.table([a, b], "walk"), /超时/);
});
test("stale response cannot overwrite a changed transportation choice", async () => {
  const vm = require("node:vm"),
    fs = require("node:fs");
  let finish;
  const state = {
    plans: ["a", "b"],
    itinerary: {
      date: "2026-09-19",
      mode: "bike",
      roadEnabled: true,
      legs: {},
    },
  };
  const ctx = {
    state,
    location: { hash: "#plans" },
    WeekendRoadRouting: R,
    WeekendPlanner: P,
    routeModes: { bike: "骑行" },
    itineraryConfig: () => state.itinerary,
    itineraryPlaces: (items) => items,
    getActivity: (id) => ({ ...(id === "a" ? a : b), locationName: id }),
    $: () => null,
    plans() {},
    persist() {},
    client: {
      table: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("road-map.js", "utf8"), ctx);
  vm.runInContext("roadClient=client", ctx);
  const pending = ctx.updateRoadRoutes();
  state.itinerary.mode = "car";
  finish(R.parseTable(raw, [a, b], "bike", Date.now()));
  await pending;
  assert.equal(state.itinerary.mode, "car");
  assert.equal(state.itinerary.roadLegs, undefined);
});
test("endpoint coordinates drive full round-trip scheduling", () => {
  const venue = {
    ...a,
    locationName: "展馆",
    hours: 1,
    windows: [{ open: "09:00", close: "18:00" }],
  };
  const origin = { id: "_origin", coords: b.coords },
    end = { id: "_return", coords: b.coords };
  const roadLegs = {
    ...R.parseTable(raw, [origin, a], "bike", Date.now()),
    ...R.parseTable(raw, [a, end], "bike", Date.now()),
  };
  const c = {
    date: "2026-09-19",
    start: "09:00",
    end: "11:00",
    mode: "bike",
    roundTrip: true,
    origin: "学校",
    destination: "学校",
    roadLegs,
    mapPoints: {
      _origin: { name: "学校", coords: b.coords },
      _return: { name: "学校", coords: b.coords },
    },
  };
  const r = P.schedule([venue], c);
  assert.equal(r.visits.length, 1);
  assert.equal(r.totals.travel, 22);
  assert.equal(r.finish, 622);
  assert.equal(r.returnLeg.roadResolved, true);
  const tight = { ...c, end: "10:00" };
  const detail = require("../planning-assistant.js").explain(
    [venue],
    tight,
    P.schedule([venue], tight),
    "a",
  );
  assert.equal(detail.kind, "time");
  assert.match(detail.reason, /返回/);
});
const a = { id: "a", coords: { lat: 30.55, lon: 114.3 } },
  b = { id: "b", coords: { lat: 30.58, lon: 114.31 } };
const raw = {
  code: "Ok",
  sources: [{ distance: 0 }, { distance: 2 }],
  destinations: [{ distance: 0 }, { distance: 2 }],
  durations: [
    [0, 601],
    [701, 0],
  ],
  distances: [
    [0, 2345],
    [2456, 0],
  ],
};
test("mode-specific services and longitude-first coordinates; transit is unsupported", () => {
  for (const [mode, profile] of [
    ["walk", "foot"],
    ["bike", "bike"],
    ["car", "car"],
  ]) {
    const url = R.url("table", [a, b], mode);
    assert.ok(url.includes("/routed-" + profile + "/"));
    assert.ok(url.includes("114.3,30.55;114.31,30.58"));
  }
  assert.throws(() => R.url("table", [a, b], "transit"));
  assert.equal(R.validPoint({ lat: null, lon: 0 }), false);
});
test("matrix durations become directional ceil-minute records, unreachable stays unreachable", () => {
  const r = R.parseTable(raw, [a, b], "bike", 1000);
  assert.equal(r["a>b:bike"].minutes, 11);
  assert.equal(r["b>a:bike"].minutes, 12);
  assert.equal(r["a>b:bike"].km, 2.345);
  const broken = structuredClone(raw);
  broken.durations[0][1] = null;
  broken.distances[0][1] = null;
  assert.equal(
    R.parseTable(broken, [a, b], "bike", 1000)["a>b:bike"].unreachable,
    true,
  );
  assert.throws(() =>
    R.parseTable({ ...raw, code: "Error" }, [a, b], "bike", 1000),
  );
  assert.throws(() =>
    R.parseTable(
      {
        ...raw,
        durations: [
          [0, -1],
          [2, 0],
        ],
      },
      [a, b],
      "bike",
      1000,
    ),
  );
});
test("road records expire, follow endpoints and never override manual time", () => {
  const records = R.parseTable(raw, [a, b], "bike", Date.now());
  const c = { mode: "bike", roadLegs: records };
  assert.equal(P.travel(a, b, c).minutes, 11);
  assert.equal(P.travel(a, b, c).roadResolved, true);
  assert.equal(
    P.travel(a, b, { ...c, legs: { "a>b": { mode: "bike", minutes: 20 } } })
      .minutes,
    20,
  );
  assert.equal(
    R.lookup(a, { ...b, coords: { lat: 30.7, lon: 114.31 } }, "bike", records),
    null,
  );
  assert.equal(R.lookup(a, b, "bike", records, Date.now() + 86400001), null);
  assert.equal(R.lookup(a, b, "walk", records), null);
});
test("unreachable roads are not silently replaced with straight-line estimates", () => {
  const bad = structuredClone(raw);
  bad.durations[0][1] = null;
  bad.distances[0][1] = null;
  const records = R.parseTable(bad, [a, b], "bike", Date.now());
  assert.equal(P.travel(a, b, { mode: "bike", roadLegs: records }), null);
});
test("HTTP errors, malformed geometry and excessive snapping fail explicitly", async () => {
  const client = R.createClient({
    fetchImpl: async () => ({ ok: false, status: 429 }),
    gap: 0,
  });
  await assert.rejects(client.table([a, b], "bike"), /429/);
  assert.throws(() =>
    R.parseRoute(
      {
        code: "Ok",
        routes: [
          {
            duration: 1,
            distance: 1,
            geometry: { type: "LineString", coordinates: [] },
          },
        ],
      },
      [a, b],
      "walk",
      1,
    ),
  );
  const snapped = structuredClone(raw);
  snapped.sources[0].distance = 900;
  assert.throws(() => R.parseTable(snapped, [a, b], "walk", 1), /选点/);
});
test("requests are serialized and fresh cache prevents repeated API calls", async () => {
  let calls = 0,
    active = 0,
    maxActive = 0;
  const client = R.createClient({
    gap: 0,
    fetchImpl: async () => {
      calls++;
      maxActive = Math.max(maxActive, ++active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return { ok: true, json: async () => raw };
    },
  });
  await Promise.all([
    client.table([a, b], "walk"),
    client.table([a, b], "bike"),
  ]);
  await client.table([a, b], "walk");
  assert.equal(calls, 2);
  assert.equal(maxActive, 1);
});
