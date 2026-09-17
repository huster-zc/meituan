const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../planner.js");
const base = {
  date: "2026-09-19",
  start: "09:00",
  end: "21:00",
  mode: "auto",
  shortMode: "walk",
  order: "auto",
};
const place = (id, extra = {}) => ({
  id,
  hours: 1,
  coords: { lat: 30.55, lon: 114.3 },
  windows: [{ open: "09:00", close: "18:00" }],
  ...extra,
});
test("short trips include 1 km; all modes remain selectable", () => {
  assert.equal(P.chooseMode(1, base), "walk");
  assert.equal(P.chooseMode(1, { ...base, shortMode: "bike" }), "bike");
  assert.equal(P.chooseMode(1.01, base), "transit");
  assert.equal(P.chooseMode(0.5, { ...base, mode: "car" }), "car");
});
test("waits for opening and accounts for full visit", () => {
  const r = P.schedule(
    [place("a", { windows: [{ open: "10:00", close: "12:00" }] })],
    base,
  );
  assert.equal(r.visits[0].start, 600);
  assert.equal(r.visits[0].end, 660);
  assert.equal(r.totals.wait, 60);
});
test("closing and last entry are hard limits", () => {
  assert.equal(
    P.schedule(
      [place("a", { hours: 3, windows: [{ open: "09:00", close: "11:00" }] })],
      base,
    ).visits.length,
    0,
  );
  assert.equal(
    P.schedule(
      [
        place("a", {
          windows: [{ open: "09:00", close: "18:00", lastEntry: "16:00" }],
        }),
      ],
      { ...base, start: "16:01" },
    ).visits.length,
    0,
  );
});
test("does not span a lunch closure", () => {
  const r = P.schedule(
    [
      place("a", {
        hours: 2,
        windows: [
          { open: "09:00", close: "12:00" },
          { open: "14:00", close: "18:00" },
        ],
      }),
    ],
    { ...base, start: "11:00" },
  );
  assert.equal(r.visits[0].start, 840);
});
test("preferred visiting window is soft", () => {
  const a = place("a", { preferred: [{ start: "16:00", end: "18:00" }] });
  assert.equal(P.schedule([a], base).visits[0].start, 960);
  assert.equal(P.schedule([a], { ...base, end: "11:00" }).visits[0].start, 540);
});
test("transport consumes time and manual duration wins", () => {
  const r = P.schedule([place("a"), place("b")], {
    ...base,
    order: "manual",
    legs: { "a>b": { mode: "walk", minutes: 45 } },
    end: "11:30",
  });
  assert.equal(r.visits.length, 1);
  const full = P.schedule([place("a"), place("b")], {
    ...base,
    order: "manual",
    legs: { "a>b": { mode: "bike", minutes: 45 } },
  });
  assert.equal(full.visits[1].start, 645);
  assert.equal(full.totals.travel, 45);
});
test("auto ordering rescues early-closing stop and manual order stays intact", () => {
  const a = place("a");
  const b = place("b", { windows: [{ open: "09:00", close: "10:00" }] });
  assert.deepEqual(
    P.schedule([a, b], base).visits.map((x) => x.id),
    ["b", "a"],
  );
  assert.deepEqual(
    P.schedule([a, b], { ...base, order: "manual" }).visits.map((x) => x.id),
    ["a"],
  );
});
test("unknown hours, missing venue, invalid dates and archives stay pending", () => {
  const r = P.schedule(
    [
      place("a", { windows: [] }),
      place("b", { coords: null }),
      place("c", { archived: true }),
      place("d", { weekdays: [0] }),
      place("e", { endDate: "2026-09-18" }),
    ],
    base,
  );
  assert.equal(r.visits.length, 0);
  assert.equal(r.unscheduled.length, 5);
});
test("validates time and date; old state receives defaults", () => {
  assert.throws(() => P.schedule([], { ...base, date: "2026-02-30" }));
  assert.throws(() => P.schedule([], { ...base, end: "08:00" }));
  assert.throws(() => P.schedule([place("a", { duration: NaN })], base));
  assert.equal(P.settings(undefined, base.date).mode, "auto");
});
test("road estimates vary by distance and mode and never pretend to be live", () => {
  const a = place("a"),
    b = place("b", { coords: { lat: 30.6, lon: 114.4 } });
  assert.ok(
    P.travel(a, b, { ...base, mode: "walk" }).minutes >
      P.travel(a, b, { ...base, mode: "car" }).minutes,
  );
  assert.equal(P.travel(a, b, base).estimated, true);
});

test("per-date confirmations expire and old saved plans remain usable", () => {
  const vm = require("node:vm"),
    fs = require("node:fs");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("planning-data.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync("planner-ui.js", "utf8"), ctx);
  const list = [{ id: "optics-library", hours: 2 }];
  const c = {
    date: "2026-09-19",
    stops: {
      "optics-library": {
        duration: 90,
        hoursDate: "2026-09-19",
        window: { open: "10:00", close: "16:00" },
      },
    },
  };
  assert.equal(ctx.itineraryPlaces(list, c)[0].windows.length, 1);
  assert.equal(
    ctx.itineraryPlaces(list, { ...c, date: "2026-09-20" })[0].windows.length,
    0,
  );
  assert.equal(ctx.itineraryPlaces(list, { date: base.date })[0].duration, 120);
});
test("changing a leg mode drops the old manual duration; resetting removes override", () => {
  const vm = require("node:vm"),
    fs = require("node:fs");
  const ctx = {
    WeekendPlanner: P,
    state: {
      itinerary: { ...base, legs: { "a>b": { mode: "walk", minutes: 120 } } },
    },
    filters: { date: base.date },
    persist() {},
    plans() {},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("planner-ui.js", "utf8"), ctx);
  ctx.updateRouteLeg("a>b", { mode: "bike" });
  assert.equal(ctx.state.itinerary.legs["a>b"].minutes, undefined);
  ctx.updateRouteLeg("a>b", null);
  assert.equal(Object.keys(ctx.state.itinerary.legs).length, 0);
});
test("schedule totals balance and every visit fits a single opening window", () => {
  const items = [
    place("a", { preferred: [{ start: "14:00", end: "16:00" }] }),
    place("b", { coords: { lat: 30.56, lon: 114.4 } }),
    place("c", { hours: 2 }),
  ];
  const r = P.schedule(items, base);
  assert.equal(
    r.finish - P.time(base.start),
    r.totals.travel + r.totals.visit + r.totals.wait,
  );
  for (const v of r.visits) {
    assert.ok(v.start >= 540 && v.end <= 1080);
    assert.equal(v.end - v.start, v.duration);
  }
});
