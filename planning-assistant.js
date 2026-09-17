(function (root) {
  "use strict";
  const P =
    typeof module !== "undefined" && module.exports
      ? require("./planner.js")
      : root.WeekendPlanner;
  const cents = (value) => {
    if (value === "" || value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 99999)
      throw Error("费用须为 0–99999 元");
    return Math.round(n * 100);
  };
  function budget(items, config = {}) {
    const activity = items.reduce((sum, a) => sum + (cents(a.price) ?? 0), 0);
    const limit = cents(config.limit),
      food = cents(config.food),
      transport = cents(config.transport);
    const complete = [limit, food, transport].every((n) => n !== null);
    const total = activity + (food ?? 0) + (transport ?? 0);
    return {
      activities: activity / 100,
      food: food === null ? null : food / 100,
      transport: transport === null ? null : transport / 100,
      limit: limit === null ? null : limit / 100,
      total: total / 100,
      complete,
      over: limit === null ? null : Math.max(0, total - limit) / 100,
      remaining: limit === null ? null : (limit - total) / 100,
    };
  }
  function trimBudget(items, config) {
    const before = budget(items, config),
      remove = [];
    if (!before.complete || before.food + before.transport > before.limit)
      return { possible: false, remove, after: before };
    let after = before;
    for (const a of [...items].sort((a, b) => b.price - a.price)) {
      if (after.over <= 0) break;
      if (a.price <= 0) continue;
      remove.push(a.id);
      after = budget(
        items.filter((x) => !remove.includes(x.id)),
        config,
      );
    }
    return { possible: after.over === 0, remove, after };
  }
  function apply(items, config, action) {
    let next = { ...config };
    if (action.type === "duration") {
      items = items.map((a) =>
        a.id === action.id ? { ...a, duration: action.value } : a,
      );
      next.stops = {
        ...config.stops,
        [action.id]: { ...config.stops?.[action.id], duration: action.value },
      };
    } else if (["start", "end", "order"].includes(action.type))
      next[action.type] = action.value;
    else throw Error("不支持的调整");
    return { items, config: next };
  }
  function explain(items, raw, result, id) {
    const c = P.settings(raw, raw.date),
      a = items.find((x) => x.id === id),
      pending = result.unscheduled.find((x) => x.id === id);
    if (!a || !pending)
      return { reason: "该地点已排入当前草案。", kind: "ready" };
    if (a.blockedReason) return { reason: a.blockedReason, kind: "place" };
    if (!a.windows?.length)
      return { reason: "缺少当天开放时间，无法判断能否游玩。", kind: "place" };
    const solo = P.schedule([a], c);
    if (solo.visits.length)
      return {
        reason: `这站单独可以安排，但与已排入的 ${result.visits.length} 站无法同时满足当前时间与交通限制。`,
        kind: "combination",
      };
    if (/有效期|开放日|下架/.test(pending.reason))
      return { reason: pending.reason, kind: "place" };
    const outbound = c.roundTrip ? P.travel({ id: "_origin" }, a, c) : null;
    const inbound = c.roundTrip ? P.travel(a, { id: "_return" }, c) : null;
    if (c.roundTrip && (!outbound || !inbound))
      return {
        reason: `缺少${!outbound ? "出发地 → " + (a.place || a.title) : (a.place || a.title) + " → 返程目的地"}的交通耗时。补录后可检查这站的往返安排。`,
        kind: "traffic",
      };
    const arrive =
      P.time(c.start) + (outbound ? outbound.minutes + Number(c.buffer) : 0);
    const duration = Number(a.duration ?? a.hours * 60);
    const fixed = a.fixedStart ? P.time(a.fixedStart) : null;
    if (fixed !== null && arrive > fixed)
      return {
        reason: `最早 ${P.clock(arrive)} 到达，比 ${a.fixedStart} 场次开始晚 ${arrive - fixed} 分钟；固定场次不能顺延。`,
        kind: "time",
      };
    let explanations = [];
    for (const w of a.windows) {
      const start =
        fixed ??
        Math.max(
          arrive,
          P.time(w.open),
          a.entryWindow ? P.time(a.entryWindow.start) : 0,
        );
      const last = Math.min(
        P.time(w.lastEntry || w.close),
        a.entryWindow ? P.time(a.entryWindow.end) - 1 : 1439,
      );
      if (start > last) {
        explanations.push({
          gap: start - last,
          text: `最早 ${P.clock(start)} 到达，已错过停止入场 / 预约入场时段。`,
        });
        continue;
      }
      const finish = start + duration;
      if (finish > P.time(w.close)) {
        explanations.push({
          gap: finish - P.time(w.close),
          text: `按 ${duration} 分钟游玩，需到 ${P.clock(finish)} 才结束，比 ${w.close} 关闭晚 ${finish - P.time(w.close)} 分钟。`,
        });
        continue;
      }
      const back = finish + (inbound ? inbound.minutes + Number(c.buffer) : 0);
      if (back > P.time(c.end))
        explanations.push({
          gap: back - P.time(c.end),
          text: `最早${c.roundTrip ? "返回" : "结束"}时间 ${P.clock(back)}，比 ${c.end} 的限制晚 ${back - P.time(c.end)} 分钟。`,
        });
    }
    explanations.sort((a, b) => a.gap - b.gap);
    return { reason: explanations[0]?.text || pending.reason, kind: "time" };
  }
  function resolve(items, raw, result, id) {
    const c = P.settings(raw, raw.date),
      detail = explain(items, c, result, id),
      actions = [];
    if (["place", "traffic", "ready"].includes(detail.kind))
      return { ...detail, actions };
    const required = new Set([...result.visits.map((v) => v.id), id]);
    const works = (action) => {
      const changed = apply(items, c, action),
        r = P.schedule(changed.items, changed.config);
      return [...required].every((id) => r.visits.some((v) => v.id === id));
    };
    if (c.order === "manual") {
      const action = { type: "order", value: "auto", label: "改为智能排序" };
      if (works(action)) actions.push(action);
    }
    for (const type of ["start", "end"]) {
      const base = P.time(c[type]);
      for (let delta = 15; delta <= 240; delta += 15) {
        const minutes = base + (type === "start" ? -delta : delta);
        if (minutes < 0 || minutes > 1439) break;
        const action = {
          type,
          value: P.clock(minutes),
          label:
            type === "start"
              ? `提前到 ${P.clock(minutes)} ${c.roundTrip ? "出发" : "抵达首站"}`
              : `将最晚${c.roundTrip ? "返回" : "结束"}改为 ${P.clock(minutes)}`,
        };
        if (works(action)) {
          actions.push(action);
          break;
        }
      }
    }
    const a = items.find((x) => x.id === id);
    if (!a.fixedStart) {
      const duration = Number(a.duration ?? a.hours * 60);
      for (let value = duration - 15; value >= 15; value -= 15) {
        const action = {
          type: "duration",
          id,
          value,
          label: `本站停留缩短到 ${value} 分钟`,
        };
        if (works(action)) {
          actions.push(action);
          break;
        }
      }
    }
    return { ...detail, actions };
  }
  const api = { budget, trimBudget, apply, explain, resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WeekendPlanningAssistant = api;
})(globalThis);
