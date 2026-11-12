import { addDays, dateFromISO, formatDate, localISODate, monthTitle, startOfWeek } from "./dates.js";

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const escapeHTML = (value = "") => String(value).replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" })[char]);
const catClass = (category = "") => `cat-${category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}`;
const byTime = (a, b) => (a.time || "").localeCompare(b.time || "") || (a.title || "").localeCompare(b.title || "", "pt-BR");

export function calendarTitle(view, cursor) {
  if (view === "month") return monthTitle(cursor);
  if (view === "day") return formatDate(localISODate(cursor), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "list") return "Todos os compromissos";
  const from = startOfWeek(cursor), to = addDays(from, 6);
  if (from.getMonth() === to.getMonth()) return `${from.getDate()}–${to.getDate()} de ${monthTitle(from)}`;
  return `${formatDate(localISODate(from), { day: "numeric", month: "short" })} – ${formatDate(localISODate(to), { day: "numeric", month: "short", year: "numeric" })}`;
}

export function renderCalendar(container, events, view, cursor) {
  if (view === "month") return renderMonth(container, events, cursor);
  if (view === "week" || view === "day") return renderTime(container, events, view, cursor);
  renderList(container, events);
}

function renderMonth(container, events, cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first), today = localISODate();
  const map = groupByDate(events);
  const headers = WEEKDAYS.map((day) => `<div class="weekday-label">${day}</div>`).join("");
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index), iso = localISODate(date), dayEvents = (map.get(iso) || []).sort(byTime);
    const visible = dayEvents.slice(0, 3).map((event) => `<button class="calendar-event ${catClass(event.category)}${event.done ? " is-done" : ""}" type="button" data-action="event-details" data-event-id="${escapeHTML(event.id)}" title="${escapeHTML(event.title)}">${event.time ? `${escapeHTML(event.time)} ` : ""}${escapeHTML(event.title)}</button>`).join("");
    const more = dayEvents.length > 3 ? `<button class="more-events" type="button" data-action="open-day" data-date="${iso}">+ ${dayEvents.length - 3} mais</button>` : "";
    return `<div class="day-cell${date.getMonth() !== cursor.getMonth() ? " is-outside" : ""}${iso === today ? " is-today" : ""}" data-action="create-date" data-date="${iso}" role="button" tabindex="0" aria-label="${escapeHTML(formatDate(iso, { weekday: "long", day: "numeric", month: "long" }))}"><div class="day-cell-top"><span class="day-number">${date.getDate()}</span><button class="day-add" type="button" data-action="create-date" data-date="${iso}" aria-label="Criar compromisso neste dia">+</button></div>${visible}${more}</div>`;
  }).join("");
  container.innerHTML = `<div class="month-grid">${headers}${cells}</div>`;
}

function renderTime(container, events, view, cursor) {
  const dates = view === "day" ? [new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i));
  const startHour = 7, endHour = 21, height = 54, today = localISODate();
  const map = groupByDate(events);
  const headers = dates.map((date) => {
    const iso = localISODate(date), weekday = view === "day" ? formatDate(iso, { weekday: "long" }) : WEEKDAYS[(date.getDay() + 6) % 7];
    return `<button type="button" class="time-day-heading day-heading-action${iso === today ? " is-today" : ""}" data-action="create-date" data-date="${iso}" aria-label="Criar compromisso em ${escapeHTML(formatDate(iso, { weekday: "long", day: "numeric", month: "long" }))}"><span>${escapeHTML(weekday)}</span><b>${date.getDate()}</b></button>`;
  }).join("");
  const looseRow = dates.map((date) => {
    const iso = localISODate(date), items = (map.get(iso) || []).filter((event) => !event.time || Number(event.time.slice(0, 2)) < startHour || Number(event.time.slice(0, 2)) >= endHour);
    return `<div class="time-loose-cell" data-date="${iso}" data-action="create-date">${items.map((event) => `<button class="calendar-event ${catClass(event.category)}${event.done ? " is-done" : ""}" type="button" data-action="event-details" data-event-id="${escapeHTML(event.id)}">${event.time ? `${escapeHTML(event.time)} ` : "Dia todo · "}${escapeHTML(event.title)}</button>`).join("")}</div>`;
  }).join("");
  const labels = Array.from({ length: endHour - startHour }, (_, index) => `<span class="time-label" style="top:${index * height}px">${String(startHour + index).padStart(2, "0")}:00</span>`).join("");
  const columns = dates.map((date) => {
    const iso = localISODate(date), dayEvents = (map.get(iso) || []).filter((event) => event.time && Number(event.time.slice(0, 2)) >= startHour && Number(event.time.slice(0, 2)) < endHour);
    const slots = Array.from({ length: endHour - startHour }, (_, index) => `<button class="time-slot" type="button" style="top:${index * height}px" data-action="create-slot" data-date="${iso}" data-time="${String(startHour + index).padStart(2, "0")}:00" aria-label="Criar compromisso às ${String(startHour + index).padStart(2, "0")}:00"></button>`).join("");
    const blocks = dayEvents.map((event) => {
      const [hour, minute] = event.time.split(":").map(Number), top = ((hour - startHour) * 60 + minute) / 60 * height;
      const duration = Math.max(15, Math.min(480, Number(event.duration) || 60)), blockHeight = Math.max(24, duration / 60 * height - 2);
      const durationLabel = duration >= 60 ? `${Math.floor(duration / 60)}h${duration % 60 ? ` ${duration % 60}min` : ""}` : `${duration} min`;
      return `<button class="timed-event ${catClass(event.category)}${event.done ? " is-done" : ""}" type="button" data-action="event-details" data-event-id="${escapeHTML(event.id)}" style="top:${top}px;height:${blockHeight}px" title="${escapeHTML(`${event.time} · ${event.title}`)}"><strong>${escapeHTML(event.title)}</strong><span>${escapeHTML(event.time)} · ${durationLabel}</span></button>`;
    }).join("");
    return `<div class="time-day-column" data-date="${iso}">${slots}${blocks}</div>`;
  }).join("");
  const count = dates.length, hourLabels = `<div class="time-labels">${labels}</div>`;
  container.innerHTML = `<div class="time-calendar"><div class="time-calendar-inner" style="--day-count:${count}"><div class="time-header"><div class="time-header-spacer"></div>${headers}</div><div class="time-loose-row"><div class="time-loose-label">Dia todo</div>${looseRow}</div><div class="time-body" style="height:${(endHour - startHour) * height}px">${hourLabels}${columns}</div></div></div>`;
}

function renderList(container, events) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  if (!sorted.length) {
    container.innerHTML = `<div class="agenda-empty"><strong>Um espaço em branco também é bom.</strong>Adicione um compromisso e ele aparece aqui.</div>`;
    return;
  }
  const map = groupByDate(sorted);
  container.innerHTML = `<div class="agenda-list">${[...map.entries()].map(([date, items]) => {
    const parsed = dateFromISO(date), label = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(parsed);
    return `<section class="agenda-date-group"><div class="agenda-date-heading"><b>${parsed.getDate()}</b><span>${escapeHTML(label)}</span></div>${items.map((event) => `<div class="agenda-row" data-action="event-details" data-event-id="${escapeHTML(event.id)}" role="button" tabindex="0"><span class="agenda-row-time">${escapeHTML(event.time || "Dia todo")}</span><i class="agenda-row-mark ${catClass(event.category)}"></i><span class="agenda-row-main"><strong>${escapeHTML(event.title)}${event.done ? " · Concluído" : ""}</strong><span>${escapeHTML(event.notes || event.category || "")}</span></span><span class="agenda-row-category">${escapeHTML(event.category || "Pessoal")}</span></div>`).join("")}</section>`;
  }).join("")}</div>`;
}

function groupByDate(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.date)) map.set(item.date, []);
    map.get(item.date).push(item);
  }
  return map;
}
