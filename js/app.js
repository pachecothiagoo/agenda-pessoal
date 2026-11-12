import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth } from "./firebase.js";
import {
  watchEvents,
  createEvent,
  changeEvent,
  removeEvent,
} from "./events.js";
import {
  alertInfo,
  formatDate,
  localISODate,
  parseQuickEntry,
} from "./dates.js";

const $ = (selector) => document.querySelector(selector);
const authView = $("#auth-view"),
  appView = $("#app-view");
let authMode = "login",
  currentUser = null,
  events = [],
  unsubscribe = null,
  editingId = null;
const toneClasses = {
  rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
  orange:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300",
  amber:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
};
const escapeHTML = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
function toast(message, error = false) {
  const node = document.createElement("div");
  node.className = `toast-in rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${error ? "bg-rose-600" : "bg-slate-900 dark:bg-slate-700"}`;
  node.textContent = message;
  $("#toast-region").append(node);
  setTimeout(() => node.remove(), 3500);
}
function setAuthMode(mode) {
  authMode = mode;
  $("#login-tab").className =
    mode === "login"
      ? "rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow-sm dark:bg-slate-700"
      : "rounded-lg px-3 py-2 text-sm font-semibold text-slate-500";
  $("#signup-tab").className =
    mode === "signup"
      ? "rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow-sm dark:bg-slate-700"
      : "rounded-lg px-3 py-2 text-sm font-semibold text-slate-500";
  $("#auth-submit").textContent =
    mode === "login" ? "Entrar na agenda" : "Criar minha conta";
  $("#auth-password").autocomplete =
    mode === "login" ? "current-password" : "new-password";
  $("#auth-error").classList.add("hidden");
}
$("#login-tab").addEventListener("click", () => setAuthMode("login"));
$("#signup-tab").addEventListener("click", () => setAuthMode("signup"));
$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#auth-submit"),
    error = $("#auth-error");
  button.disabled = true;
  error.classList.add("hidden");
  try {
    const email = $("#auth-email").value.trim(),
      password = $("#auth-password").value;
    if (authMode === "signup")
      await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    error.textContent = authMessage(err.code);
    error.classList.remove("hidden");
    console.error("Erro Firebase Auth:", err.code, err.message);
  } finally {
    button.disabled = false;
  }
});
function authMessage(code) {
  const messages = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já possui uma conta.",
    "auth/weak-password": "Use uma senha com pelo menos 6 caracteres.",
    "auth/invalid-email": "Informe um e-mail válido.",
    "auth/too-many-requests":
      "Muitas tentativas. Aguarde um pouco e tente novamente.",
  };
  return (
    messages[code] ||
    "Não foi possível autenticar. Confira a configuração do Firebase e tente novamente."
  );
}
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  authView.classList.toggle("hidden", Boolean(user));
  authView.classList.toggle("flex", !user);
  appView.classList.toggle("hidden", !user);
  if (!user) return;
  $("#user-label").textContent = user.email || "Conta conectada";
  $("#today-label").textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  unsubscribe = watchEvents(
    user.uid,
    (items) => {
      events = items;
      render();
    },
    (error) => {
      console.error(error);
      toast("Não foi possível carregar sua agenda.", true);
    },
  );
});
$("#signout-button").addEventListener("click", () =>
  signOut(auth).catch(() => toast("Não foi possível sair.", true)),
);

$("#quick-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const input = $("#quick-input"),
    feedback = $("#quick-feedback"),
    parsed = parseQuickEntry(input.value);
  if (!parsed) {
    feedback.textContent =
      "Não encontrei uma data clara. Tente “amanhã”, “hoje” ou “dia 14/11”.";
    feedback.classList.remove("hidden");
    return;
  }
  if (!parsed.title || parsed.title.length > 160) {
    feedback.textContent =
      "Inclua um título curto (até 160 caracteres) para o compromisso.";
    feedback.classList.remove("hidden");
    return;
  }
  const original = input.value;
  try {
    await createEvent(currentUser.uid, parsed);
    input.value = "";
    feedback.textContent = `Agendado: ${parsed.title} · ${formatDate(parsed.date, { day: "numeric", month: "long" })}${parsed.time ? ` às ${parsed.time}` : ""}`;
    feedback.classList.remove("hidden");
    toast("Compromisso adicionado à agenda.");
  } catch (error) {
    console.error(error);
    input.value = original;
    toast("Não foi possível salvar. Verifique sua conexão.", true);
  }
});
$("#filter-select").addEventListener("change", render);
function render() {
  renderAlerts();
  renderEvents();
}
function renderAlerts() {
  const upcoming = events
    .filter((item) => !item.done && alertInfo(item.date))
    .sort((a, b) => alertInfo(a.date).days - alertInfo(b.date).days)
    .slice(0, 4);
  $("#alert-count").textContent = upcoming.length
    ? `${upcoming.length} ${upcoming.length === 1 ? "prazo" : "prazos"} próximos`
    : "Tudo em dia";
  $("#alerts").innerHTML = upcoming.length
    ? upcoming
        .map((item) => {
          const info = alertInfo(item.date);
          return `<article class="rounded-2xl border p-4 ${toneClasses[info.tone]}"><div class="flex items-center justify-between gap-2"><span class="rounded-full border border-current/20 px-2.5 py-1 text-xs font-semibold">${escapeHTML(info.label)}</span><span class="text-xs opacity-70">${escapeHTML(formatDate(item.date))}</span></div><h3 class="mt-3 truncate font-semibold">${escapeHTML(item.title)}</h3>${item.time ? `<p class="mt-1 text-sm opacity-80">${escapeHTML(item.time)}</p>` : ""}</article>`;
        })
        .join("")
    : `<div class="col-span-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Nenhum prazo nos próximos 30 dias.</div>`;
}
function renderEvents() {
  const filter = $("#filter-select").value;
  let visible = events.filter(
    (item) =>
      filter === "all" ||
      (filter === "done"
        ? item.done
        : !item.done && item.date >= localISODate()),
  );
  visible = [...visible].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time || "").localeCompare(b.time || ""),
  );
  $("#event-count").textContent =
    `${visible.length} ${visible.length === 1 ? "item" : "itens"}`;
  $("#empty-state").classList.toggle("hidden", visible.length > 0);
  $("#event-list").innerHTML = visible
    .map((item) => {
      const late = !item.done && item.date < localISODate();
      const status = item.done ? "Concluído" : late ? "Vencido" : "Agendado";
      return `<article class="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-900"><div class="flex gap-3"><button data-action="toggle" data-id="${escapeHTML(item.id)}" aria-label="${item.done ? "Reabrir" : "Concluir"} ${escapeHTML(item.title)}" title="${item.done ? "Reabrir" : "Marcar como concluído"}" class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${item.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-indigo-500 dark:border-slate-600"}">${item.done ? "✓" : "✓"}</button><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h3 class="truncate font-semibold ${item.done ? "text-slate-400 line-through" : ""}">${escapeHTML(item.title)}</h3><span class="rounded-full px-2 py-0.5 text-[11px] font-medium ${late ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : item.done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}">${status}</span></div><p class="mt-1 text-sm text-slate-500">${escapeHTML(formatDate(item.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}${item.time ? ` · ${escapeHTML(item.time)}` : ""}</p></div><div class="flex shrink-0 gap-1"><button data-action="edit" data-id="${escapeHTML(item.id)}" aria-label="Editar ${escapeHTML(item.title)}" class="rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800">Editar</button><button data-action="delete" data-id="${escapeHTML(item.id)}" aria-label="Excluir ${escapeHTML(item.title)}" class="rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50">Excluir</button></div></div></article>`;
    })
    .join("");
}
$("#event-list").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || !currentUser) return;
  const item = events.find((entry) => entry.id === button.dataset.id);
  if (!item) return;
  try {
    if (button.dataset.action === "toggle")
      await changeEvent(currentUser.uid, item.id, { done: !item.done });
    if (button.dataset.action === "delete") {
      if (!window.confirm(`Excluir “${item.title}” da agenda?`)) return;
      await removeEvent(currentUser.uid, item.id);
      toast("Compromisso excluído.");
    }
    if (button.dataset.action === "edit") {
      editingId = item.id;
      $("#edit-title").value = item.title;
      $("#edit-date").value = item.date;
      $("#edit-time").value = item.time || "";
      $("#edit-dialog").showModal();
    }
  } catch (error) {
    console.error(error);
    toast("A alteração não foi salva.", true);
  }
});
$("#edit-cancel").addEventListener("click", () => $("#edit-dialog").close());
$("#edit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || !editingId) return;
  try {
    await changeEvent(currentUser.uid, editingId, {
      title: $("#edit-title").value.trim(),
      date: $("#edit-date").value,
      time: $("#edit-time").value,
    });
    $("#edit-dialog").close();
    toast("Compromisso atualizado.");
    editingId = null;
  } catch (error) {
    console.error(error);
    toast("Não foi possível atualizar o compromisso.", true);
  }
});

const savedTheme = localStorage.getItem("agenda-theme");
if (
  savedTheme === "dark" ||
  (!savedTheme && matchMedia("(prefers-color-scheme: dark)").matches)
)
  document.documentElement.classList.add("dark");
$("#theme-toggle").addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
  localStorage.setItem(
    "agenda-theme",
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
});
