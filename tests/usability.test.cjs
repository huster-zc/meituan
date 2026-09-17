const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../planner.js");
const D = require("../departure.js");
const A = require("../planning-assistant.js");
const c = { date: "2026-09-19", start: "09:00", end: "12:00", mode: "walk" };
test("removing the last stop retains undo, and stale undo never overwrites later edits", () => {
  const vm = require("node:vm"),
    fs = require("node:fs"),
    main = {};
  const ctx = {
    state: { plans: ["a"], itinerary: { ...c } },
    filters: { date: c.date },
    WeekendPlanner: P,
    WeekendDeparture: D,
    WeekendPlanningData: {},
    persist() {},
    plans() {},
    closeModal() {},
    toast() {},
    empty() {
      return "empty";
    },
    $() {
      return main;
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("planning-assistant-ui.js", "utf8"), ctx);
  vm.runInContext(fs.readFileSync("planner-ui.js", "utf8"), ctx);
  ctx.rememberPlanningChange([], { ...c }, "");
  ctx.renderPlanner([]);
  assert.match(main.innerHTML, /撤销这次调整/);
  ctx.undoPlanningChange();
  assert.equal(ctx.state.plans[0], "a");
  ctx.rememberPlanningChange([], { ...c }, "");
  ctx.state.plans.push("new");
  ctx.undoPlanningChange();
  assert.deepEqual(Array.from(ctx.state.plans), ["new"]);
});
const a = {
  id: "a",
  title: "展馆",
  price: 60,
  hours: 1,
  locationName: "展馆",
  coords: { lat: 30.5, lon: 114.3 },
  windows: [{ open: "09:00", close: "18:00" }],
};
test("day budget includes all wanted activities, food and complete transport reserve", () => {
  const b = A.budget([a, { ...a, id: "b", price: 45 }], {
    limit: 100,
    food: 30,
    transport: 20,
  });
  assert.equal(b.total, 155);
  assert.equal(b.over, 55);
  assert.equal(b.activities, 105);
  assert.equal(A.budget([a], { limit: 0, food: 0, transport: 0 }).over, 60);
  assert.equal(
    A.budget([a], { limit: 100, food: "", transport: 20 }).complete,
    false,
  );
  assert.throws(() => A.budget([a], { limit: 100, food: -1, transport: 20 }));
});
test("budget reduction is a preview, fits reserve and never invents savings", () => {
  const list = [
    a,
    { ...a, id: "b", price: 45 },
    { ...a, id: "free", price: 0 },
  ];
  const r = A.trimBudget(list, { limit: 100, food: 30, transport: 20 });
  assert.deepEqual(r.remove, ["a"]);
  assert.equal(r.after.total, 95);
  assert.equal(list.length, 3);
  assert.equal(
    A.trimBudget(list, { limit: 10, food: 30, transport: 20 }).possible,
    false,
  );
});
test("one place has one combined verification task even if unscheduled", () => {
  const issues = D.issues([a], c, { visits: [], unscheduled: [{ id: "a" }] });
  assert.equal(issues.filter((x) => x.id === "a").length, 1);
  assert.match(issues.find((x) => x.id === "a").text, /入口.*开放.*预约/);
});
test("return conflict reports exact overrun and only offers working adjustments", () => {
  const config = {
    ...c,
    end: "10:30",
    roundTrip: true,
    origin: "学校",
    destination: "学校",
    legs: {
      "_origin>a": { mode: "walk", minutes: 15 },
      "a>_return": { mode: "walk", minutes: 30 },
    },
  };
  const r = P.schedule([a], config);
  const advice = A.resolve([a], config, r, "a");
  assert.match(advice.reason, /15 分钟/);
  assert.ok(advice.actions.length);
  for (const action of advice.actions) {
    const changed = A.apply([a], config, action);
    assert.equal(P.schedule(changed.items, changed.config).visits.length, 1);
  }
});
test("missing traffic is actionable and never replaced by zero minutes", () => {
  const config = { ...c, roundTrip: true, origin: "学校", destination: "学校" };
  const advice = A.resolve([a], config, P.schedule([a], config), "a");
  assert.equal(advice.kind, "traffic");
  assert.equal(advice.actions.length, 0);
});
test("fixed session cannot be shortened to solve a conflict", () => {
  const item = { ...a, duration: 120, fixedStart: "09:00" };
  const config = { ...c, start: "09:30" };
  const r = A.resolve([item], config, P.schedule([item], config), "a");
  assert.match(r.reason, /场次/);
  assert.ok(r.actions.some((x) => x.type === "start"));
  assert.ok(r.actions.every((x) => x.type !== "duration"));
});
test("resolution never drops previously scheduled stops", () => {
  const b = { ...a, id: "b", duration: 90 };
  const config = { ...c, end: "10:45" };
  const before = P.schedule([a, b], config);
  const id = before.unscheduled[0].id;
  for (const action of A.resolve([a, b], config, before, id).actions) {
    const changed = A.apply([a, b], config, action);
    const ids = P.schedule(changed.items, changed.config).visits.map(
      (x) => x.id,
    );
    assert.ok(ids.includes(id));
    for (const v of before.visits) assert.ok(ids.includes(v.id));
  }
});
