(function (root) {
  "use strict";
  const labels = {
    unknown: "预约要求待核实",
    pending: "待预约 / 待领票",
    booked: "已预约 / 已领票",
    notRequired: "已确认无需预约",
    unavailable: "无票 / 无法预约",
  };
  function searchUrl(name) {
    return (
      "https://uri.amap.com/search?" +
      new URLSearchParams({
        keyword: name,
        city: "武汉",
        view: "list",
        src: "weekend-wander",
        callnative: "0",
      })
    );
  }
  function routeUrl(from, to, mode) {
    const mapped = { walk: "walking", car: "driving", transit: "transit" }[
      mode
    ];
    if (!mapped || !from?.trim() || !to?.trim()) return null;
    return (
      "https://api.map.baidu.com/direction?" +
      new URLSearchParams({
        origin: from,
        destination: to,
        mode: mapped,
        region: "武汉",
        output: "html",
        coord_type: "wgs84",
        src: "webapp.weekend.wander",
      })
    );
  }
  function safeUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
    } catch {
      return "";
    }
  }
  function prepare(a, meta, saved, date) {
    const current = saved.checksDate === date;
    const custom = saved.hoursDate === date && saved.window;
    const out = {
      ...a,
      ...meta,
      duration: saved.duration ?? a.hours * 60,
      locationName: saved.entrance?.trim() || a.place,
      entranceConfirmed: current && !!saved.entranceConfirmed,
      reservation:
        current && labels[saved.reservation] ? saved.reservation : "unknown",
      openingConfirmed: current && !!saved.openingConfirmed,
      confirmationDate: current ? date : null,
      bookingUrl: safeUrl(current ? saved.bookingUrl : ""),
      slot: current ? saved.slot : null,
    };
    if (saved.entrance?.trim() && saved.entrance.trim() !== a.place)
      out.coords = null;
    if (custom) {
      out.windows = [saved.window];
      out.hoursKind = "user";
      out.hoursNote = `你确认的 ${date} 开放时段，请留意临时调整。`;
      out.openingConfirmed = true;
    }
    if (out.reservation === "unavailable")
      out.blockedReason = "无票或无法预约，请更换日期 / 场次";
    if (current && saved.closed)
      out.blockedReason = "你已标记该日关闭，暂不排入行程";
    if (a.id === "culture-2026") {
      const s = saved.session;
      out.locationName = "";
      out.coords = null;
      if (
        !s?.title?.trim() ||
        !s?.venue?.trim() ||
        s.date !== date ||
        !s.start ||
        !s.end ||
        s.start >= s.end
      )
        out.blockedReason =
          "请先确认该日具体场次、场地和起止时间，活动季本身不能作为一站";
      else {
        out.title = s.title.trim();
        out.place = s.venue.trim();
        out.locationName = s.venue.trim();
        out.fixedStart = s.start;
        out.duration =
          +s.end.slice(0, 2) * 60 +
          +s.end.slice(3) -
          (+s.start.slice(0, 2) * 60 + +s.start.slice(3));
        out.windows = [{ open: s.start, close: s.end, lastEntry: s.start }];
        out.hoursKind = "user";
        out.hoursNote = `你填写的 ${date} ${s.start}–${s.end} 场次；请提前到场。`;
        out.openingConfirmed = current && !!saved.openingConfirmed;
      }
    }
    if (out.slot && out.reservation === "booked") out.entryWindow = out.slot;
    return out;
  }
  function issues(places, c, result) {
    const problems = [];
    if (!c.roundTrip)
      problems.push({
        text: "尚未包含从出发地出门及返回目的地的路程",
        action: "endpoints",
      });
    if (result.unscheduled.length)
      problems.push({
        text: `${result.unscheduled.length} 个地点未排入，请调整或移出清单`,
        action: "pending",
      });
    for (const a of places) {
      const missing = [];
      if (!a.entranceConfirmed) missing.push("入口待核实");
      if (!a.openingConfirmed) missing.push("当天开放待核实");
      if (!["booked", "notRequired"].includes(a.reservation))
        missing.push(labels[a.reservation] || labels.unknown);
      if (missing.length)
        problems.push({
          id: a.id,
          text: `${a.title || a.place}：${missing.join("、")}`,
        });
    }
    for (const v of result.visits) {
      const a = places.find((a) => a.id === v.id);
      if (v.leg && !v.leg.verified && !v.leg.roadResolved)
        problems.push({
          text: `前往${a.title || a.place}的交通耗时待地图核实`,
          action: "traffic",
        });
    }
    if (
      result.returnLeg &&
      !result.returnLeg.verified &&
      !result.returnLeg.roadResolved
    )
      problems.push({ text: "返程交通耗时待地图核实", action: "traffic" });
    return problems;
  }
  const api = { labels, searchUrl, routeUrl, safeUrl, prepare, issues };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WeekendDeparture = api;
})(globalThis);
