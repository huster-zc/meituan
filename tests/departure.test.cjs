const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../departure.js");
const P = require("../planner.js");
const date = "2026-09-19";
const cfg = {
  date,
  start: "09:00",
  end: "12:00",
  mode: "transit",
  roundTrip: true,
  origin: "武汉大学正门",
  destination: "武汉大学正门",
  legs: {
    "_origin>a": { minutes: 30, mode: "transit", verified: true },
    "a>_return": { minutes: 45, mode: "transit", verified: true },
  },
};
const a = {
  id: "a",
  place: "武汉博物馆",
  hours: 1,
  coords: { lat: 30.6, lon: 114.2 },
  windows: [{ open: "09:00", close: "18:00" }],
};
test("round-trip ordering compares complete travel including return", () => {
  const b = { ...a, id: "b" };
  const r = P.schedule([a, b], {
    ...cfg, end: "18:00",
    legs: {
      "_origin>a": { minutes: 5, mode: "walk" },
      "_origin>b": { minutes: 10, mode: "walk" },
      "a>b": { minutes: 5, mode: "walk" },
      "b>a": { minutes: 5, mode: "walk" },
      "a>_return": { minutes: 5, mode: "walk" },
      "b>_return": { minutes: 90, mode: "transit" },
    },
  });
  assert.deepEqual(r.visits.map(v => v.id), ["b", "a"]);
  assert.equal(r.totals.travel, 20);
});
test("reservation entry window and complete visit must both fit", () => {
  const booked = { ...a, entryWindow: { start: "10:00", end: "10:30" } };
  assert.equal(P.schedule([booked], { date, start: "09:00", end: "12:00" }).visits[0].start, 600);
  assert.equal(P.schedule([booked], { date, start: "10:30", end: "12:00" }).visits.length, 0);
  assert.equal(P.schedule([booked], { date, start: "09:00", end: "10:45" }).visits.length, 0);
  assert.equal(D.safeUrl("javascript:alert(1)"), "");
});
test("navigation safely encodes names and unsupported cycling is not silently driving", () => {
  const u = new URL(D.routeUrl("武汉大学&北门", "武汉博物馆", "transit"));
  assert.equal(u.searchParams.get("origin"), "武汉大学&北门");
  assert.equal(u.searchParams.get("mode"), "transit");
  assert.equal(u.searchParams.get("output"), "html");
  assert.equal(D.routeUrl("A", "B", "bike"), null);
  assert.equal(new URL(D.searchUrl("A&B")).searchParams.get("keyword"), "A&B");
});
test("complete round trip reserves outbound, inbound and buffer", () => {
  const r = P.schedule([a], { ...cfg, buffer: 10 });
  assert.equal(r.visits[0].start, 580);
  assert.equal(r.finish, 695);
  assert.equal(r.totals.travel, 75);
  assert.equal(r.totals.buffer, 20);
  assert.equal(
    r.finish - P.time(cfg.start),
    r.totals.visit + r.totals.travel + r.totals.wait + r.totals.buffer,
  );
});
test("return deadline cannot be passed and unknown outbound duration is never zero", () => {
  assert.equal(P.schedule([a], { ...cfg, end: "11:00" }).visits.length, 0);
  assert.equal(P.schedule([a], { ...cfg, legs: {} }).visits.length, 0);
});
test("fixed event starts on time; late arrival stays pending", () => {
  const event = { ...a, fixedStart: "10:00", duration: 60 };
  assert.equal(P.schedule([event], cfg).visits[0].start, 600);
  assert.equal(
    P.schedule([event], { ...cfg, start: "10:01", end: "14:00" }).visits.length,
    0,
  );
});
test("unavailable reservation or closed venue cannot be scheduled", () => {
  assert.equal(
    P.schedule([{ ...a, blockedReason: "已无票" }], cfg).visits.length,
    0,
  );
});
test("checks and event dates never carry to another day", () => {
  const saved = {
    checksDate: date,
    entrance: "武汉博物馆正门",
    entranceConfirmed: true,
    reservation: "booked",
    openingConfirmed: true,
  };
  assert.equal(D.prepare(a, {}, saved, date).reservation, "booked");
  assert.equal(D.prepare(a, {}, saved, "2026-09-20").reservation, "unknown");
  const season = { id: "culture-2026", hours: 2, place: "多个城市" };
  assert.ok(D.prepare(season, {}, {}, date).blockedReason);
  const session = {
    title: "测试场次",
    venue: "武汉剧院正门",
    date,
    start: "14:00",
    end: "16:00",
  };
  assert.equal(D.prepare(season, {}, { session }, date).fixedStart, "14:00");
  assert.ok(D.prepare(season, {}, { session }, "2026-09-20").blockedReason);
});
test("named venue with no coordinates needs a manual leg; its coordinates are never fabricated", () => {
  const named = { ...a, id: "b", coords: null, locationName: "武汉剧院" };
  const c = { ...cfg, roundTrip: false, order: "manual", end: "18:00" };
  assert.equal(P.schedule([a, named], c).visits.length, 1);
  assert.equal(
    P.schedule([a, named], {
      ...c,
      legs: { "a>b": { minutes: 30, mode: "transit" } },
    }).visits.length,
    2,
  );
});
test("an estimate-only itinerary cannot pass the departure checklist", () => {
  const r = P.schedule([a], { ...cfg, roundTrip: false });
  assert.ok(D.issues([a], { ...cfg, roundTrip: false }, r).length > 0);
});
