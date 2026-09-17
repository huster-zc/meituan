(function (root) {
  "use strict";
  const Road =
    typeof module !== "undefined" && module.exports
      ? require("./road-routing.js")
      : root.WeekendRoadRouting;
  const modes = ["auto", "walk", "bike", "transit", "car"];
  function time(value) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
      throw new Error("请填写有效时间");
    return +value.slice(0, 2) * 60 + +value.slice(3);
  }
  function clock(n) {
    return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  }
  function settings(raw, date) {
    const r = raw && typeof raw === "object" ? raw : {};
    return {
      date,
      start: "09:00",
      end: "21:00",
      mode: "auto",
      shortMode: "walk",
      order: "auto",
      stops: {},
      legs: {},
      roundTrip: false,
      origin: "",
      destination: "",
      buffer: 0,
      ...r,
    };
  }
  function chooseMode(km, c) {
    return c.mode === "auto"
      ? km <= 1
        ? c.shortMode === "bike"
          ? "bike"
          : "walk"
        : "transit"
      : c.mode;
  }
  function distance(a, b) {
    const rad = (x) => (x * Math.PI) / 180;
    const dlat = rad(b.lat - a.lat),
      dlon = rad(b.lon - a.lon);
    const h =
      Math.sin(dlat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h))) * 1.35;
  }
  function travel(a, b, c) {
    const km = a.coords && b.coords ? distance(a.coords, b.coords) : null,
      override = c.legs?.[`${a.id}>${b.id}`];
    const mode =
      override?.mode &&
      modes.includes(override.mode) &&
      override.mode !== "auto"
        ? override.mode
        : chooseMode(km ?? Infinity, c);
    const speed = { walk: 4.5, bike: 12, transit: 22, car: 28 }[mode],
      buffer = { walk: 0, bike: 5, transit: 18, car: 10 }[mode];
    const custom = override?.minutes !== undefined && override?.minutes !== "";
    const road = Road?.lookup(a, b, mode, c.roadLegs);
    if (!custom && road) {
      if (road.unreachable) return null;
      return {
        km: road.km,
        mode,
        minutes: road.minutes,
        estimated: true,
        verified: false,
        roadResolved: true,
        source: "osrm",
        fetchedAt: road.fetchedAt,
      };
    }
    if (!custom && km === null) return null;
    const minutes = custom
      ? Number(override.minutes)
      : Math.max(1, Math.ceil(((km / speed) * 60 + buffer) / 5) * 5);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)
      throw new Error("转场时长须为 1–600 分钟");
    return {
      km: road && !road.unreachable ? road.km : km,
      mode,
      minutes,
      estimated: !custom,
      verified: custom && override?.verified === true,
    };
  }
  function schedule(items, config) {
    const c = settings(config, config?.date);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(c.date) ||
      !Number.isFinite(Date.parse(c.date)) ||
      new Date(c.date).toISOString().slice(0, 10) !== c.date
    )
      throw new Error("请选择有效的出行日期");
    const start = time(c.start),
      end = time(c.end);
    if (start >= end)
      throw new Error("最晚结束须晚于首站到达时间（暂不支持跨天）");
    if (!modes.includes(c.mode)) throw new Error("请选择交通方式");
    const buffer = Number(c.buffer);
    if (!Number.isInteger(buffer) || buffer < 0 || buffer > 120)
      throw new Error("每段机动时间须为 0–120 分钟");
    if (c.roundTrip && (!c.origin?.trim() || !c.destination?.trim()))
      throw new Error("请填写出发地和返程目的地");
    const origin = {
        id: "_origin",
        coords:
          c.mapPoints?._origin?.name === c.origin
            ? c.mapPoints._origin.coords
            : null,
      },
      destination = {
        id: "_return",
        coords:
          c.mapPoints?._return?.name === c.destination
            ? c.mapPoints._return.coords
            : null,
      };
    const weekday = new Date(c.date + "T00:00:00Z").getUTCDay();
    const pending = [],
      valid = [];
    for (const a of items) {
      let reason = a.blockedReason || "";
      if (
        a.archived ||
        (a.startDate && c.date < a.startDate) ||
        (a.endDate && c.date > a.endDate) ||
        (a.weekdays && !a.weekdays.includes(weekday))
      )
        reason = "所选日期不在活动有效期或开放日内";
      else if (
        !a.locationName &&
        (!a.coords ||
          !Number.isFinite(a.coords.lat) ||
          !Number.isFinite(a.coords.lon))
      )
        reason = "尚无具体场地，确认地点和场次后再安排";
      else if (!a.windows?.length)
        reason = "营业时间待确认，请先填写已核实的开放时段";
      if (reason) {
        pending.push({ id: a.id, reason });
        continue;
      }
      const duration =
        a.duration === undefined ? a.hours * 60 : Number(a.duration);
      if (!Number.isInteger(duration) || duration < 15 || duration > 480)
        throw new Error("每站停留须为 15–480 分钟");
      const windows = a.windows.map((w) => ({
        open: time(w.open),
        close: time(w.close),
        lastEntry: w.lastEntry ? time(w.lastEntry) : time(w.close),
      }));
      if (
        windows.some(
          (w) =>
            w.open >= w.close || w.lastEntry < w.open || w.lastEntry > w.close,
        )
      )
        throw new Error("开放、停止入场和关闭时间不合理");
      const preferred = (a.preferred || []).map((p) => ({
        start: time(p.start),
        end: time(p.end),
      }));
      const entryWindow = a.entryWindow
        ? { start: time(a.entryWindow.start), end: time(a.entryWindow.end) }
        : null;
      if (entryWindow && entryWindow.start >= entryWindow.end)
        throw new Error("预约入场时段的结束须晚于开始");
      valid.push({
        ...a,
        duration,
        windows,
        preferred,
        entryWindow,
        fixedStart: a.fixedStart ? time(a.fixedStart) : null,
      });
    }
    if (valid.length > 7) throw new Error("单日最多支持 7 个地点，请分天规划");
    let best = { visits: [], penalty: Infinity, travel: Infinity, finish: end };
    function consider(visits, penalty, travelM, finish) {
      const returnLeg =
        c.roundTrip && visits.length
          ? travel(
              valid.find((a) => a.id === visits.at(-1).id),
              destination,
              c,
            )
          : null;
      if (c.roundTrip && visits.length && !returnLeg) return;
      const complete = finish + (returnLeg ? returnLeg.minutes + buffer : 0);
      const totalTravel = travelM + (returnLeg ? returnLeg.minutes : 0);
      if (complete > end) return;
      if (
        visits.length > best.visits.length ||
        (visits.length === best.visits.length &&
          (penalty < best.penalty ||
            (penalty === best.penalty &&
              (totalTravel < best.travel ||
                (totalTravel === best.travel && complete < best.finish)))))
      )
        best = {
          visits: [...visits],
          penalty,
          travel: totalTravel,
          finish: complete,
          returnLeg,
        };
    }
    function search(remaining, visits, now, penalty, travelM) {
      consider(visits, penalty, travelM, now);
      if (visits.length + remaining.length < best.visits.length) return;
      const choices = c.order === "manual" ? remaining.slice(0, 1) : remaining;
      for (const a of choices) {
        const prev = visits.at(-1),
          leg = prev
            ? travel(
                valid.find((x) => x.id === prev.id),
                a,
                c,
              )
            : c.roundTrip
              ? travel(origin, a, c)
              : null;
        const rest = remaining.filter((x) => x.id !== a.id);
        if ((prev || c.roundTrip) && !leg) {
          if (c.order === "manual") search(rest, visits, now, penalty, travelM);
          continue;
        }
        const arrival = now + (leg ? leg.minutes + buffer : 0);
        const seen = new Set();
        for (const w of a.windows) {
          const earliest = Math.max(arrival, w.open, a.entryWindow?.start ?? 0);
          const candidates =
            a.fixedStart !== null
              ? [a.fixedStart]
              : [
                  earliest,
                  ...a.preferred.flatMap((p) => [
                    Math.max(earliest, p.start),
                    Math.max(earliest, p.end - a.duration),
                  ]),
                ];
          for (const s of candidates) {
            if (
              seen.has(s) ||
              s < earliest ||
              (a.entryWindow && s >= a.entryWindow.end) ||
              s > w.lastEntry ||
              s + a.duration > Math.min(w.close, end)
            )
              continue;
            seen.add(s);
            const overlap = Math.max(
              0,
              ...a.preferred.map((p) =>
                Math.max(
                  0,
                  Math.min(s + a.duration, p.end) - Math.max(s, p.start),
                ),
              ),
            );
            const outside = a.preferred.length ? a.duration - overlap : 0;
            search(
              rest,
              [
                ...visits,
                {
                  id: a.id,
                  arrival,
                  start: s,
                  end: s + a.duration,
                  wait: s - arrival,
                  duration: a.duration,
                  leg,
                  buffer: leg ? buffer : 0,
                  outsidePreferred: outside > 0,
                },
              ],
              s + a.duration,
              penalty + outside,
              travelM + (leg?.minutes || 0),
            );
          }
        }
        if (c.order === "manual") search(rest, visits, now, penalty, travelM);
      }
    }
    search(valid, [], start, 0, 0);
    const chosen = new Set(best.visits.map((v) => v.id));
    for (const a of valid)
      if (!chosen.has(a.id))
        pending.push({
          id: a.id,
          reason: `需要完整游玩 ${a.duration} 分钟；请检查缺失的交通耗时、场次/预约时间、闭馆与最晚返回限制，再调整行程`,
        });
    return {
      visits: best.visits,
      unscheduled: pending,
      finish: best.visits.length ? best.finish : null,
      returnLeg: best.returnLeg || null,
      totals: {
        travel:
          best.visits.reduce((s, v) => s + (v.leg?.minutes || 0), 0) +
          (best.returnLeg?.minutes || 0),
        buffer:
          best.visits.reduce((s, v) => s + v.buffer, 0) +
          (best.returnLeg ? buffer : 0),
        visit: best.visits.reduce((s, v) => s + v.duration, 0),
        wait: best.visits.reduce((s, v) => s + v.wait, 0),
      },
    };
  }
  const api = { time, clock, settings, chooseMode, distance, travel, schedule };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WeekendPlanner = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
