import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth } from "./firebase.js";
import { watchEvents, createEvent, changeEvent, removeEvent } from "./events.js";
import { renderCalendar, calendarTitle } from "./calendar.js";
import { alertInfo, addDays, addMonths, dateFromISO, dayDistance, formatDate, isISODate, localISODate, parseQuickEntry } from "./dates.js";

window.__RAIZ_APP_READY = true;
const $ = (selector) => document.querySelector(selector);
const authView = $("#auth-view"), appView = $("#app-view"), bootScreen = $("#boot-screen");
let authMode = "login", currentUser = null, events = [], unsubscribeEvents = null;
let activeView = "month", cursorDate = new Date(), focusedEventId = null, editingEventId = null;

bootScreen.classList.add("is-hidden");
showAuthView();

const escapeHTML = (value = "") => String(value).replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" })[char]);
const categoryClass = (category = "") => `cat-${category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}`;

function showAuthView() {
  authView.classList.remove("is-hidden");
  appView.classList.add("is-hidden");
}

function showAppView() {
  authView.classList.add("is-hidden");
  appView.classList.remove("is-hidden");
}

function showToast(message, isError = false) {
  const node = document.createElement("div");
  node.className = `toast${isError ? " is-error" : ""}`;
  node.textContent = message;
  $("#toast-region").append(node);
  window.setTimeout(() => node.remove(), 4200);
}

function setSyncState(state, label) {
  const status = $("#sync-status");
  status.classList.toggle("is-syncing", state === "syncing");
  status.classList.toggle("is-error", state === "error");
  status.lastChild.textContent = ` ${label}`;
}

function setAuthMode(mode) {
  authMode = mode;
  const login = mode === "login";
  $("#login-tab").classList.toggle("is-selected", login);
  $("#signup-tab").classList.toggle("is-selected", !login);
  $("#login-tab").setAttribute("aria-selected", String(login));
  $("#signup-tab").setAttribute("aria-selected", String(!login));
  $("#auth-submit").textContent = login ? "Entrar na agenda" : "Criar minha conta";
  $("#auth-heading").textContent = login ? "Que bom ter você de volta." : "Vamos organizar seus dias.";
  $("#auth-password").autocomplete = login ? "current-password" : "new-password";
  $("#auth-error").hidden = true;
}

$("#login-tab").addEventListener("click", () => setAuthMode("login"));
$("#signup-tab").addEventListener("click", () => setAuthMode("signup"));
$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#auth-submit"), errorBox = $("#auth-error");
  button.disabled = true;
  errorBox.hidden = true;
  try {
    const email = $("#auth-email").value.trim(), password = $("#auth-password").value;
    if (authMode === "signup") await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    errorBox.textContent = authErrorMessage(error.code);
    errorBox.hidden = false;
    console.error("Firebase Auth:", error.code, error.message);
  } finally {
    button.disabled = false;
  }
});

function authErrorMessage(code) {
  const messages = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Esse e-mail já tem uma conta. Entre com ela.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-email": "Confira o formato do e-mail.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente de novo.",
    "auth/unauthorized-domain": "Este endereço do site ainda não foi autorizado no Firebase Authentication.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "A chave do Firebase em js/firebase-config.js não corresponde a este projeto.",
    "auth/network-request-failed": "Sem conexão com o Firebase. Confira a internet e tente novamente.",
  };
  return messages[code] || `Não foi possível entrar (${code || "erro desconhecido"}). Confira Firebase Authentication e a configuração do projeto.`;
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (unsubscribeEvents) {
    unsubscribeEvents();
    unsubscribeEvents = null;
  }
  if (!user) {
    events = [];
    showAuthView();
    return;
  }
  showAppView();
  $("#user-label").textContent = user.email || "Conta conectada";
  $("#today-label").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  setSyncState("syncing", "Conectando…");
  unsubscribeEvents = watchEvents(user.uid, (items) => {
    events = items;
    setSyncState("ok", "Sincronizado");
    renderAll();
  }, (error) => {
    console.error("Firestore:", error.code, error.message);
    setSyncState("error", "Falha na sincronização");
    showToast(firestoreErrorMessage(error.code), true);
  });
}, (error) => {
  console.error("Firebase Auth state:", error.code, error.message);
  showAuthView();
  const errorBox = $("#auth-error");
  errorBox.textContent = authErrorMessage(error.code);
  errorBox.hidden = false;
});

function firestoreErrorMessage(code) {
  if (code === "permission-denied") return "O Firestore negou o acesso. Confira se publicou as regras atuais e se está na conta correta.";
  if (code === "unavailable" || code === "deadline-exceeded") return "Sem conexão com o Firestore. A agenda tentará sincronizar novamente.";
  return `Não foi possível carregar os compromissos (${code || "erro"}). Confira as regras do Firestore.`;
}

$("#signout-button").addEventListener("click", () => signOut(auth).catch((error) => showToast(authErrorMessage(error.code), true)));

function renderAll() {
  $("#calendar-title").textContent = calendarTitle(activeView, cursorDate);
  $("#previous-period").hidden = activeView === "list";
  $("#next-period").hidden = activeView === "list";
  $("#calendar-container").classList.toggle("is-list-view", activeView === "list");
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-selected", button.dataset.view === activeView));
  const visibleEvents = filteredEvents();
  renderCalendar($("#calendar-container"), visibleEvents, activeView, cursorDate);
  $("#results-summary").textContent = `${visibleEvents.length} ${visibleEvents.length === 1 ? "compromisso" : "compromissos"}`;
  renderUpcoming();
}

function filteredEvents() {
  const term = $("#search-input").value.trim().toLocaleLowerCase("pt-BR");
  const category = $("#category-filter").value;
  const status = $("#status-filter").value;
  return events.filter((event) => {
    const matchesTerm = !term || `${event.title} ${event.notes || ""} ${event.category || ""}`.toLocaleLowerCase("pt-BR").includes(term);
    const matchesCategory = category === "all" || (event.category || "Pessoal") === category;
    const matchesStatus = status === "all" || (status === "done" ? event.done : !event.done);
    return matchesTerm && matchesCategory && matchesStatus;
  });
}

function renderUpcoming() {
  const upcoming = events.filter((event) => !event.done && dayDistance(event.date) <= 30).sort((a, b) => {
    const distanceA = dayDistance(a.date), distanceB = dayDistance(b.date);
    if (distanceA < 0 && distanceB < 0) return distanceB - distanceA;
    return distanceA - distanceB || (a.time || "").localeCompare(b.time || "");
  }).slice(0, 5);
  $("#upcoming-count").textContent = upcoming.length ? String(upcoming.length).padStart(2, "0") : "";
  $("#upcoming-list").innerHTML = upcoming.length ? upcoming.map((event) => {
    const day = dateFromISO(event.date), month = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(day).replace(".", "");
    const info = alertInfo(event.date);
    return `<button type="button" class="upcoming-item" data-action="event-details" data-event-id="${escapeHTML(event.id)}"><span class="upcoming-date"><b>${day.getDate()}</b><small>${escapeHTML(month)}</small></span><span class="upcoming-copy"><strong>${escapeHTML(event.title)}</strong><span>${event.time ? `${escapeHTML(event.time)} · ` : ""}${escapeHTML(info?.label || event.category || "Agendado")}</span></span></button>`;
  }).join("") : `<p class="upcoming-empty">Sua agenda está tranquila. Os próximos compromissos aparecem aqui.</p>`;
}

$("#new-event-button").addEventListener("click", () => openEventDialog());
$("#mobile-new-event").addEventListener("click", () => openEventDialog());
$("#sidebar-today").addEventListener("click", () => { cursorDate = new Date(); activeView = "day"; renderAll(); });
$("#today-button").addEventListener("click", () => { cursorDate = new Date(); renderAll(); });
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => { activeView = button.dataset.view; renderAll(); }));
$("#previous-period").addEventListener("click", () => movePeriod(-1));
$("#next-period").addEventListener("click", () => movePeriod(1));
$("#search-input").addEventListener("input", renderAll);
$("#category-filter").addEventListener("change", renderAll);
$("#status-filter").addEventListener("change", renderAll);

function movePeriod(direction) {
  if (activeView === "month") cursorDate = addMonths(cursorDate, direction);
  else cursorDate = addDays(cursorDate, activeView === "week" ? 7 * direction : direction);
  renderAll();
}

function openEventDialog({ event = null, date = localISODate(), time = "" } = {}) {
  editingEventId = event?.id || null;
  $("#event-dialog-title").textContent = event ? "Editar compromisso" : "Novo compromisso";
  $("#event-title").value = event?.title || "";
  $("#event-date").value = event?.date || date;
  $("#event-time").value = event?.time || time;
  $("#event-duration").value = String(event?.duration || 60);
  $("#event-category").value = event?.category || "Pessoal";
  $("#event-notes").value = event?.notes || "";
  $("#event-form-error").hidden = true;
  $("#event-save").disabled = false;
  $("#details-dialog").close();
  $("#event-dialog").showModal();
  window.setTimeout(() => $("#event-title").focus(), 50);
}

$("#event-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const title = $("#event-title").value.trim(), date = $("#event-date").value;
  const time = $("#event-time").value, duration = Number($("#event-duration").value);
  const category = $("#event-category").value, notes = $("#event-notes").value.trim();
  const errorBox = $("#event-form-error"), saveButton = $("#event-save");
  if (!title || title.length > 160 || !isISODate(date) || !Number.isInteger(duration) || duration < 15 || duration > 480 || notes.length > 1000) {
    errorBox.textContent = "Confira o título, a data e a duração do compromisso.";
    errorBox.hidden = false;
    return;
  }
  saveButton.disabled = true;
  saveButton.textContent = "Salvando…";
  setSyncState("syncing", "Salvando…");
  try {
    const data = { title, date, time, duration, category, notes };
    if (editingEventId) await changeEvent(currentUser.uid, editingEventId, data);
    else await createEvent(currentUser.uid, data);
    $("#event-dialog").close();
    setSyncState("ok", "Sincronizado");
    showToast(editingEventId ? "Compromisso atualizado." : "Compromisso salvo na sua agenda.");
    editingEventId = null;
  } catch (error) {
    console.error("Salvar compromisso:", error.code, error.message);
    setSyncState("error", "Não foi possível salvar");
    errorBox.textContent = firestoreErrorMessage(error.code);
    errorBox.hidden = false;
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Salvar compromisso";
  }
});

$("#quick-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#quick-input"), feedback = $("#quick-feedback"), parsed = parseQuickEntry(input.value);
  feedback.classList.remove("is-error");
  if (!parsed) {
    feedback.textContent = "Não encontrei a data. Use “amanhã”, “hoje” ou “dia 14/11”; para datas diferentes, use Novo compromisso.";
    feedback.classList.add("is-error");
    feedback.hidden = false;
    return;
  }
  try {
    await createEvent(currentUser.uid, parsed);
    feedback.textContent = `Salvo: ${parsed.title} · ${formatDate(parsed.date, { day: "numeric", month: "long" })}${parsed.time ? ` às ${parsed.time}` : ""}`;
    feedback.hidden = false;
    input.value = "";
    showToast("Compromisso salvo na sua agenda.");
  } catch (error) {
    console.error("Entrada rápida:", error.code, error.message);
    feedback.textContent = firestoreErrorMessage(error.code);
    feedback.classList.add("is-error");
    feedback.hidden = false;
    showToast("O compromisso não foi salvo.", true);
  }
});

$("#calendar-container").addEventListener("click", handleCalendarClick);
$("#upcoming-list").addEventListener("click", handleCalendarClick);
$("#calendar-container").addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches(".day-cell, .agenda-row")) {
    event.preventDefault();
    event.target.click();
  }
});

function handleCalendarClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action, date, time, eventId } = target.dataset;
  if (action === "event-details") {
    const item = events.find((entry) => entry.id === eventId);
    if (item) openDetails(item);
  } else if (action === "create-date") {
    if (dateFromISO(date).getMonth() !== cursorDate.getMonth() && activeView === "month") cursorDate = dateFromISO(date);
    openEventDialog({ date });
  } else if (action === "create-slot") {
    openEventDialog({ date, time });
  } else if (action === "open-day") {
    cursorDate = dateFromISO(date);
    activeView = "day";
    renderAll();
  }
}

function openDetails(item) {
  focusedEventId = item.id;
  $("#details-title").textContent = item.title;
  const duration = Number(item.duration) || 60;
  const info = alertInfo(item.date);
  const status = item.done ? "Concluído" : info?.label || "Agendado";
  $("#details-content").innerHTML = `<span class="detail-date-line">${escapeHTML(formatDate(item.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</span><span class="detail-time-line">${item.time ? `${escapeHTML(item.time)} · ${duration >= 60 ? `${Math.floor(duration / 60)}h${duration % 60 ? ` ${duration % 60} min` : ""}` : `${duration} min`}` : "Dia todo"}</span><span class="detail-category ${categoryClass(item.category)}">${escapeHTML(item.category || "Pessoal")}</span>${item.notes ? `<div class="detail-notes">${escapeHTML(item.notes)}</div>` : ""}<span class="detail-done">${escapeHTML(status)}</span>`;
  $("#detail-toggle").textContent = item.done ? "Reabrir" : "Concluir";
  $("#detail-toggle").hidden = item.done && !item.date;
  $("#details-dialog").showModal();
}

$("#detail-edit").addEventListener("click", () => {
  const item = events.find((entry) => entry.id === focusedEventId);
  if (item) openEventDialog({ event: item });
});
$("#detail-delete").addEventListener("click", async () => {
  const item = events.find((entry) => entry.id === focusedEventId);
  if (!item || !window.confirm(`Excluir “${item.title}” da agenda?`)) return;
  try {
    await removeEvent(currentUser.uid, item.id);
    $("#details-dialog").close();
    showToast("Compromisso excluído.");
  } catch (error) {
    console.error("Excluir compromisso:", error.code, error.message);
    showToast(firestoreErrorMessage(error.code), true);
  }
});
$("#detail-toggle").addEventListener("click", async () => {
  const item = events.find((entry) => entry.id === focusedEventId);
  if (!item) return;
  try {
    await changeEvent(currentUser.uid, item.id, { done: !item.done });
    $("#details-dialog").close();
    showToast(item.done ? "Compromisso reaberto." : "Compromisso concluído.");
  } catch (error) {
    console.error("Concluir compromisso:", error.code, error.message);
    showToast(firestoreErrorMessage(error.code), true);
  }
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.closeDialog}`).close()));
document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
  const bounds = dialog.getBoundingClientRect();
  const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  if (!inside) dialog.close();
}));

const savedTheme = localStorage.getItem("raiz-theme");
if (savedTheme === "dark" || (!savedTheme && matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.classList.add("dark");
$("#theme-toggle").addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
  localStorage.setItem("raiz-theme", document.documentElement.classList.contains("dark") ? "dark" : "light");
});
