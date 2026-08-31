const STORAGE_KEY = "mein-dienst-v1";
const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const SHIFT_DEFAULTS = {
  O: { name: "Frei", start: "", end: "", kind: "off" },
  U: { name: "Urlaub", start: "", end: "", kind: "leave" },
  AZV: { name: "AZV", start: "", end: "", kind: "leave" },
  K: { name: "Krank", start: "", end: "", kind: "leave" },
  MS: { name: "Mutterschutz", start: "", end: "", kind: "leave" },
  BV: { name: "BV", start: "", end: "", kind: "leave" },
  FB: { name: "Fortbildung", start: "08:00", end: "16:00", kind: "day" },
  N: { name: "Nachtdienst", start: "21:00", end: "06:00", kind: "night" },
  N2: { name: "Nachtdienst 2", start: "22:00", end: "06:30", kind: "night" },
  1: { name: "Dienst 1:00", start: "01:00", end: "09:00", kind: "early" },
  2: { name: "Dienst 2:00", start: "02:00", end: "10:00", kind: "early" },
  4: { name: "Dienst 4:00", start: "04:00", end: "12:00", kind: "early" },
  5: { name: "Dienst 5:00", start: "05:00", end: "13:00", kind: "early" },
  7: { name: "Dienst 7:00", start: "07:00", end: "15:00", kind: "day" },
  10: { name: "Dienst 10:00", start: "10:00", end: "18:00", kind: "day" },
  11: { name: "Dienst 11:00", start: "11:00", end: "19:00", kind: "late" },
  12: { name: "Dienst 12:00", start: "12:00", end: "20:00", kind: "late" },
  14: { name: "Dienst 14:00", start: "14:00", end: "22:00", kind: "late" },
  GSB: { name: "GSB", start: "07:00", end: "15:00", kind: "day" },
  SFT: { name: "SFT", start: "13:00", end: "21:00", kind: "late" },
  ST: { name: "ST", start: "08:00", end: "16:00", kind: "day" },
  SF: { name: "SF", start: "14:00", end: "22:00", kind: "late" },
  LZK: { name: "LZK", start: "08:00", end: "16:00", kind: "day" },
  DB: { name: "DB", start: "08:00", end: "16:00", kind: "day" },
  IBF: { name: "IBF", start: "08:00", end: "16:00", kind: "day" },
};

const $ = (id) => document.getElementById(id);

const state = {
  personLast: "Bitzer",
  personFirst: "Jan",
  months: {},
  viewYear: 2026,
  viewMonth: 8,
  shifts: { ...SHIFT_DEFAULTS },
  reminderMinutes: 60,
  seenHint: false,
};

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function todayParts() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function parseCsvLine(line, delimiter) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((cell) => cell.trim());
}

function parseDateDE(value) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((value || "").trim());
  if (!m) return null;
  return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
}

function parseTeamCsv(text) {
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length);
  if (rawLines.length < 3) throw new Error("Die Datei sieht nicht nach einem Dienstplan aus.");
  const first = rawLines[0];
  const delimiter = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const rows = rawLines.map((line) => parseCsvLine(line, delimiter));

  const start = parseDateDE(rows[0][0]);
  const end = parseDateDE(rows[1][0]);
  if (!start || !end) throw new Error("Oben in der Datei fehlt das Monatsdatum.");

  const dayCols = [];
  rows[0].forEach((cell, index) => {
    if (index >= 5 && /^\d+$/.test(cell)) dayCols.push({ index, day: Number(cell) });
  });
  if (!dayCols.length) throw new Error("In der Datei wurden keine Tage gefunden.");

  const people = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (row[4] === "P" && row[0]) {
      const next = rows[i + 1] || [];
      people.push({
        last: row[0],
        first: next[0] || "",
        soll: row[1] || "",
        ist: row[2] || "",
        urlaub: row[3] || "",
        days: dayCols.map(({ index, day }) => ({
          day,
          weekday: (rows[1][index] || "").toUpperCase(),
          code: (row[index] || "").trim(),
        })),
      });
    }
  }
  if (!people.length) throw new Error("In der Datei wurden keine Personen gefunden.");

  return { start, end, year: start.year, month: start.month, people };
}

function personToMonth(parsed, person, fileName) {
  return {
    file: fileName || "",
    start: `${pad(parsed.start.day)}.${pad(parsed.start.month)}.${parsed.start.year}`,
    end: `${pad(parsed.end.day)}.${pad(parsed.end.month)}.${parsed.end.year}`,
    year: parsed.year,
    month: parsed.month,
    person: {
      last: person.last,
      first: person.first,
      soll: person.soll,
      ist: person.ist,
      urlaub: person.urlaub,
    },
    days: person.days,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.personLast) state.personLast = saved.personLast;
    if (saved.personFirst) state.personFirst = saved.personFirst;
    if (saved.months) state.months = saved.months;
    if (saved.shifts) state.shifts = { ...SHIFT_DEFAULTS, ...saved.shifts };
    if (saved.reminderMinutes) state.reminderMinutes = saved.reminderMinutes;
    if (saved.seenHint) state.seenHint = true;
    if (saved.viewYear) state.viewYear = saved.viewYear;
    if (saved.viewMonth) state.viewMonth = saved.viewMonth;
  } catch {
    /* ignore broken storage */
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      personLast: state.personLast,
      personFirst: state.personFirst,
      months: state.months,
      shifts: state.shifts,
      reminderMinutes: state.reminderMinutes,
      seenHint: state.seenHint,
      viewYear: state.viewYear,
      viewMonth: state.viewMonth,
    })
  );
}

function seedBundled() {
  if (Object.keys(state.months).length) return;
  const bundled = window.BUNDLED_PLAENE || [];
  for (const month of bundled) {
    if (!month.person) continue;
    state.months[monthKey(month.year, month.month)] = month;
  }
  if (Object.keys(state.months).length) saveState();
}

function currentMonth() {
  return state.months[monthKey(state.viewYear, state.viewMonth)] || null;
}

function monthKeysSorted() {
  return Object.keys(state.months).sort();
}

function shiftInfo(code) {
  const clean = (code || "").split("/")[0].trim();
  if (!clean) return { code: "", name: "kein Eintrag", start: "", end: "", kind: "empty" };
  if (state.shifts[clean]) return { code: clean, ...state.shifts[clean] };
  if (/^\d+$/.test(clean)) {
    const hour = Number(clean);
    const kind = hour < 6 ? "early" : hour < 11 ? "day" : "late";
    const start = `${pad(hour)}:00`;
    const endHour = (hour + 8) % 24;
    return { code: clean, name: `Dienst ${start}`, start, end: `${pad(endHour)}:00`, kind };
  }
  return { code: clean, name: clean, start: "", end: "", kind: "day" };
}

function isWork(info) {
  return info.kind !== "off" && info.kind !== "leave" && info.kind !== "empty" && info.code;
}

function formatRange(info) {
  if (!info.start) return "";
  if (info.kind === "night") return `${info.start} – ${info.end} (+1)`;
  return `${info.start} – ${info.end}`;
}

function isoDate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function weekdayName(year, month, day) {
  const date = new Date(year, month - 1, day);
  return WEEKDAYS[(date.getDay() + 6) % 7];
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function icsStamp(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

function icsLocal(year, month, day, hm, nextDay) {
  const [h, m] = hm.split(":").map(Number);
  const date = new Date(year, month - 1, day + (nextDay ? 1 : 0), h, m, 0);
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    "00"
  );
}

function foldIcs(line) {
  if (line.length <= 73) return line;
  const parts = [];
  for (let i = 0; i < line.length; i += 73) parts.push(line.slice(i, i + 73));
  return parts.join("\r\n ");
}

function buildIcs() {
  const now = icsStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mein Dienstplan//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldIcs(`X-WR-CALNAME:Dienstplan ${state.personFirst} ${state.personLast}`),
    "X-WR-TIMEZONE:Europe/Berlin",
  ];

  for (const key of monthKeysSorted()) {
    const month = state.months[key];
    for (const day of month.days) {
      const info = shiftInfo(day.code);
      if (info.kind === "off" || info.kind === "empty" || !info.code) continue;
      const uid = `${state.personLast.toLowerCase()}-${isoDate(month.year, month.month, day.day)}@meindienst`;
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${now}`);
      if (!info.start) {
        const dayStamp = `${month.year}${pad(month.month)}${pad(day.day)}`;
        const next = new Date(month.year, month.month - 1, day.day + 1);
        const nextStamp = `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
        lines.push(`DTSTART;VALUE=DATE:${dayStamp}`);
        lines.push(`DTEND;VALUE=DATE:${nextStamp}`);
      } else {
        lines.push(
          `DTSTART;TZID=Europe/Berlin:${icsLocal(month.year, month.month, day.day, info.start, false)}`
        );
        lines.push(
          `DTEND;TZID=Europe/Berlin:${icsLocal(
            month.year,
            month.month,
            day.day,
            info.end || info.start,
            info.kind === "night"
          )}`
        );
      }
      lines.push(foldIcs(`SUMMARY:${info.name}`));
      lines.push(
        foldIcs(
          `DESCRIPTION:Dienstplan ${state.personFirst} ${state.personLast} · Kürzel ${info.code}`
        )
      );
      if (isWork(info) && state.reminderMinutes > 0) {
        lines.push("BEGIN:VALARM");
        lines.push("ACTION:DISPLAY");
        lines.push(`TRIGGER:-PT${state.reminderMinutes}M`);
        lines.push(foldIcs(`DESCRIPTION:${info.name} beginnt bald`));
        lines.push("END:VALARM");
      }
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function setViewToBestMonth() {
  const keys = monthKeysSorted();
  if (!keys.length) return;
  const today = todayParts();
  const nowKey = monthKey(today.year, today.month);
  if (state.months[nowKey]) {
    state.viewYear = today.year;
    state.viewMonth = today.month;
    return;
  }
  const next = keys.find((key) => key >= nowKey);
  const pick = next || keys[keys.length - 1];
  const [y, m] = pick.split("-").map(Number);
  state.viewYear = y;
  state.viewMonth = m;
}

function monthStats(month) {
  const stats = { work: 0, free: 0, night: 0, leave: 0 };
  if (!month) return stats;
  for (const day of month.days) {
    const info = shiftInfo(day.code);
    if (info.kind === "night") stats.night += 1;
    if (info.kind === "leave") stats.leave += 1;
    else if (info.kind === "off" || info.kind === "empty") stats.free += 1;
    else stats.work += 1;
  }
  return stats;
}

function renderHero(month) {
  const hero = $("hero");
  const today = todayParts();
  const viewingToday =
    month && month.year === today.year && month.month === today.month;
  const todayEntry = viewingToday
    ? month.days.find((day) => day.day === today.day)
    : null;

  if (!month) {
    hero.className = "hero kind-empty";
    hero.innerHTML = `
      <p class="hero-label">Noch kein Plan</p>
      <h2>CSV laden</h2>
      <p class="sub">Schick die Monatsdatei rein – danach siehst du nur deinen Dienst.</p>`;
    return;
  }

  if (todayEntry) {
    const info = shiftInfo(todayEntry.code);
    hero.className = `hero kind-${info.kind}`;
    hero.innerHTML = `
      <p class="hero-label">Heute · ${weekdayName(today.year, today.month, today.day)}</p>
      <h2>${info.name}</h2>
      <p class="when">${formatRange(info) || "Ganztägig"}</p>
      <p class="sub">${info.code ? `Kürzel ${info.code}` : "Kein Eintrag im Plan"}</p>`;
    return;
  }

  const upcoming = findUpcoming();
  hero.className = "hero kind-empty";
  if (upcoming) {
    const info = shiftInfo(upcoming.day.code);
    const label = `${upcoming.day.day}. ${MONTHS_DE[upcoming.month.month - 1]}`;
    hero.innerHTML = `
      <p class="hero-label">${MONTHS_DE[month.month - 1]} ${month.year}</p>
      <h2>Kein Plan für heute</h2>
      <p class="when">Nächster Dienst: ${info.name}</p>
      <p class="sub">${label}${formatRange(info) ? ` · ${formatRange(info)}` : ""}</p>`;
  } else {
    hero.innerHTML = `
      <p class="hero-label">${MONTHS_DE[month.month - 1]} ${month.year}</p>
      <h2>${MONTHS_DE[month.month - 1]}</h2>
      <p class="sub">Neuen Monat als CSV laden, dann ist er hier.</p>`;
  }
}

function findUpcoming() {
  const today = todayParts();
  const todayKey = `${monthKey(today.year, today.month)}-${pad(today.day)}`;
  for (const key of monthKeysSorted()) {
    const month = state.months[key];
    for (const day of month.days) {
      const stamp = `${monthKey(month.year, month.month)}-${pad(day.day)}`;
      if (stamp < todayKey) continue;
      const info = shiftInfo(day.code);
      if (isWork(info)) return { month, day, info };
    }
  }
  return null;
}

function renderCalendar(month) {
  const wrap = $("calendar");
  if (!month) {
    wrap.innerHTML = `<p class="hint">Noch kein Monat geladen.</p>`;
    return;
  }

  const firstWd = new Date(month.year, month.month - 1, 1).getDay();
  const offset = (firstWd + 6) % 7;
  const total = daysInMonth(month.year, month.month);
  const today = todayParts();
  const cells = [];

  for (let i = 0; i < offset; i++) cells.push(`<div class="cell empty"></div>`);
  for (let day = 1; day <= total; day++) {
    const entry = month.days.find((item) => item.day === day);
    const info = shiftInfo(entry ? entry.code : "");
    const weekend =
      new Date(month.year, month.month - 1, day).getDay() === 0 ||
      new Date(month.year, month.month - 1, day).getDay() === 6;
    const isToday =
      month.year === today.year && month.month === today.month && day === today.day;
    cells.push(`
      <button class="cell kind-${info.kind}${isToday ? " today" : ""}${weekend ? " weekend" : ""}"
        type="button" data-day="${day}" ${entry ? "" : "disabled"}>
        <span class="num">${day}</span>
        <span class="code">${info.code || "·"}</span>
      </button>`);
  }

  const stats = monthStats(month);
  wrap.innerHTML = `
    <div class="weekdays">${WEEKDAYS.map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="grid">${cells.join("")}</div>
    <div class="stats">
      <div class="stat"><b>${stats.work}</b><span>Dienste</span></div>
      <div class="stat"><b>${stats.night}</b><span>Nächte</span></div>
      <div class="stat"><b>${stats.free}</b><span>Frei</span></div>
      <div class="stat"><b>${stats.leave}</b><span>Urlaub</span></div>
    </div>`;

  wrap.querySelectorAll("button.cell").forEach((btn) => {
    btn.addEventListener("click", () => openDay(Number(btn.dataset.day)));
  });
}

function renderList(month) {
  const wrap = $("list");
  if (!month) {
    wrap.innerHTML = "";
    return;
  }
  const today = todayParts();
  const rows = month.days
    .map((day) => ({ day, info: shiftInfo(day.code) }))
    .filter((item) => item.info.kind !== "off" && item.info.kind !== "empty");

  const upcoming = rows.filter((item) => {
    if (month.year !== today.year || month.month !== today.month) {
      const stamp = monthKey(month.year, month.month);
      return stamp >= monthKey(today.year, today.month);
    }
    return item.day.day >= today.day;
  });

  const show = (month.year === today.year && month.month === today.month ? upcoming : rows).slice(
    0,
    12
  );
  if (!show.length) {
    wrap.innerHTML = `<h3>Im Blick</h3><p class="hint">In diesem Monat stehen keine Dienste mehr an.</p>`;
    return;
  }

  wrap.innerHTML = `
    <h3>${month.year === today.year && month.month === today.month ? "Als Nächstes" : "Dienste"}</h3>
    ${show
      .map(({ day, info }) => {
        const wd = weekdayName(month.year, month.month, day.day);
        return `
          <button class="row" type="button" data-day="${day.day}">
            <span class="date">${day.day}.<small>${wd}</small></span>
            <span>
              <span class="title">${info.name}</span>
              <span class="meta">${formatRange(info) || "Ganztägig"}</span>
            </span>
            <span class="dot kind-${info.kind}"></span>
          </button>`;
      })
      .join("")}`;

  wrap.querySelectorAll(".row").forEach((btn) => {
    btn.addEventListener("click", () => openDay(Number(btn.dataset.day)));
  });
}

function renderHint() {
  const hint = $("hint");
  if (!state.seenHint) {
    hint.hidden = false;
    hint.textContent =
      "Diese Seite zum Home-Bildschirm legen. Neue Pläne als CSV hier laden – sie bleiben auf dem Handy. Uhrzeiten zu GSB, ST, SFT und Nacht stehen unter Einstellungen.";
    return;
  }
  hint.hidden = true;
}

function render() {
  const month = currentMonth();
  $("person-label").textContent = `${state.personFirst} ${state.personLast}`.trim();
  $("month-title").textContent = `${MONTHS_DE[state.viewMonth - 1]} ${state.viewYear}`;

  const keys = monthKeysSorted();
  const current = monthKey(state.viewYear, state.viewMonth);
  $("btn-prev").disabled = !keys.length || keys.indexOf(current) <= 0 && !state.months[prevMonthKey()];
  $("btn-next").disabled = false;
  updateNavButtons();

  renderHero(month);
  renderCalendar(month);
  renderList(month);
  renderHint();
}

function prevMonthKey() {
  const date = new Date(state.viewYear, state.viewMonth - 2, 1);
  return monthKey(date.getFullYear(), date.getMonth() + 1);
}

function nextMonthKey() {
  const date = new Date(state.viewYear, state.viewMonth, 1);
  return monthKey(date.getFullYear(), date.getMonth() + 1);
}

function updateNavButtons() {
  const prev = prevMonthKey();
  const next = nextMonthKey();
  const keys = monthKeysSorted();
  $("btn-prev").disabled = keys.length > 0 ? !keys.some((key) => key < monthKey(state.viewYear, state.viewMonth)) : true;
  $("btn-next").disabled = keys.length > 0 ? !keys.some((key) => key > monthKey(state.viewYear, state.viewMonth)) : true;
  void prev;
  void next;
}

function shiftMonth(delta) {
  const keys = monthKeysSorted();
  const current = monthKey(state.viewYear, state.viewMonth);
  const idx = keys.indexOf(current);
  const next = keys[idx + delta];
  if (!next) return;
  const [y, m] = next.split("-").map(Number);
  state.viewYear = y;
  state.viewMonth = m;
  saveState();
  render();
}

function openDay(dayNum) {
  const month = currentMonth();
  if (!month) return;
  const entry = month.days.find((day) => day.day === dayNum);
  if (!entry) return;
  const info = shiftInfo(entry.code);
  const wd = weekdayName(month.year, month.month, dayNum);
  $("day-body").innerHTML = `
    <p class="muted">${wd}, ${dayNum}. ${MONTHS_DE[month.month - 1]} ${month.year}</p>
    <h2>${info.name}</h2>
    <p class="muted">${formatRange(info) || "Ganztägig"}${info.code ? ` · ${info.code}` : ""}</p>
    <p class="hint">Soll-Stunden im Monat: ${month.person.soll || "–"} · Ist: ${month.person.ist || "–"}</p>`;
  $("day-dialog").showModal();
}

function renderSettings() {
  const used = new Set();
  for (const month of Object.values(state.months)) {
    for (const day of month.days) {
      const code = (day.code || "").split("/")[0].trim();
      if (code) used.add(code);
    }
  }
  const codes = [...used].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
  $("settings-body").innerHTML = `
    <h2>Einstellungen</h2>
    <p class="muted">Zeiten einmal einstellen, dann gelten sie für alle Monate.</p>
    <div class="field">
      <label>Erinnerung vor Dienstbeginn</label>
      <select id="reminder">
        <option value="0">Keine</option>
        <option value="30">30 Minuten</option>
        <option value="60">1 Stunde</option>
        <option value="120">2 Stunden</option>
      </select>
    </div>
    <div class="phone-box">
      <p class="muted">Auf dem Handy behalten</p>
      <p class="muted" style="margin-top:.35rem">Im Browser-Menü „Zum Home-Bildschirm“ / „App installieren“ wählen. Neue CSV kommt per Mail oder WhatsApp – hier laden, fertig. Der Plan bleibt auf diesem Handy.</p>
    </div>
    <h3>Schichtzeiten</h3>
    <div id="shift-list">
      ${codes
        .map((code) => {
          const info = shiftInfo(code);
          return `
            <div class="shift-edit" data-code="${code}">
              <span class="code">${code}</span>
              <input data-field="name" value="${info.name}" />
              <input data-field="start" type="time" value="${info.start || ""}" />
              <input data-field="end" type="time" value="${info.end || ""}" />
            </div>`;
        })
        .join("")}
    </div>`;
  $("reminder").value = String(state.reminderMinutes);
  $("reminder").addEventListener("change", (event) => {
    state.reminderMinutes = Number(event.target.value);
    saveState();
  });
  $("shift-list").addEventListener("change", (event) => {
    const row = event.target.closest(".shift-edit");
    if (!row) return;
    const code = row.dataset.code;
    const field = event.target.dataset.field;
    state.shifts[code] = {
      ...shiftInfo(code),
      [field]: event.target.value,
    };
    saveState();
    render();
  });
}

function pickPerson(parsed, fileName) {
  const wanted = parsed.people.filter(
    (p) => p.last.toLowerCase() === state.personLast.toLowerCase()
  );
  if (wanted.length === 1) {
    importPerson(parsed, wanted[0], fileName);
    return;
  }
  $("pick-body").innerHTML = `
    <h2>Wer bist du?</h2>
    <p class="muted">In der Datei wurde ${state.personLast} nicht eindeutig gefunden.</p>
    <div class="pick-list">
      ${parsed.people
        .map(
          (p, i) =>
            `<button type="button" data-i="${i}">${p.first} ${p.last}</button>`
        )
        .join("")}
    </div>`;
  $("pick-dialog").showModal();
  $("pick-body").onclick = (event) => {
    const btn = event.target.closest("button[data-i]");
    if (!btn) return;
    const person = parsed.people[Number(btn.dataset.i)];
    $("pick-dialog").close();
    importPerson(parsed, person, fileName);
  };
}

function importPerson(parsed, person, fileName) {
  state.personLast = person.last;
  state.personFirst = person.first;
  const month = personToMonth(parsed, person, fileName);
  state.months[monthKey(month.year, month.month)] = month;
  state.viewYear = month.year;
  state.viewMonth = month.month;
  state.seenHint = true;
  saveState();
  render();
}

async function onFile(file) {
  try {
    const text = await file.text();
    const parsed = parseTeamCsv(text);
    pickPerson(parsed, file.name);
  } catch (err) {
    alert(err.message || "Die Datei konnte nicht gelesen werden.");
  }
}

function registerSw() {
  if (!("serviceWorker" in navigator)) return;
  if (!location.protocol.startsWith("http")) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function init() {
  loadState();
  seedBundled();
  if (!state.viewYear) setViewToBestMonth();
  if (!currentMonth()) setViewToBestMonth();
  const today = todayParts();
  if (state.months[monthKey(today.year, today.month)]) {
    state.viewYear = today.year;
    state.viewMonth = today.month;
  } else if (!currentMonth()) {
    setViewToBestMonth();
  }

  $("btn-prev").addEventListener("click", () => shiftMonth(-1));
  $("btn-next").addEventListener("click", () => shiftMonth(1));
  $("btn-upload").addEventListener("click", () => $("file-input").click());
  $("file-input").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) onFile(file);
    event.target.value = "";
  });
  $("btn-ics").addEventListener("click", () => {
    if (!monthKeysSorted().length) return;
    const ics = buildIcs();
    downloadFile(
      `Dienstplan-${state.personFirst}-${state.personLast}.ics`,
      ics,
      "text/calendar;charset=utf-8"
    );
  });
  $("btn-settings").addEventListener("click", () => {
    renderSettings();
    $("settings-dialog").showModal();
  });
  $("btn-close-day").addEventListener("click", () => $("day-dialog").close());
  $("btn-close-settings").addEventListener("click", () => {
    state.seenHint = true;
    saveState();
    $("settings-dialog").close();
    render();
  });
  ["day-dialog", "settings-dialog", "pick-dialog"].forEach((id) => {
    $(id).addEventListener("click", (event) => {
      if (event.target === $(id)) $(id).close();
    });
  });
  document.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  document.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) onFile(file);
  });

  render();
  registerSw();
}

init();
