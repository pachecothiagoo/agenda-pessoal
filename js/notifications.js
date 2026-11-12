import { doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";
import { webPushPublicKey } from "./firebase-config.js";

function decodeBase64Url(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export async function enablePushForUser(user) {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Este navegador não oferece notificações push. No iPhone, abra a agenda pelo ícone da Tela de Início.");
  }
  if (!window.isSecureContext) throw new Error("Notificações exigem HTTPS. Abra o endereço publicado na Vercel.");
  if (!webPushPublicKey || webPushPublicKey.startsWith("COLE_")) {
    throw new Error("Falta configurar a chave pública VAPID no arquivo js/firebase-config.js.");
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissão negada. Ative as notificações nas configurações do navegador e tente novamente.");
  }

  const registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
  await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(webPushPublicKey),
    });
  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) {
    throw new Error("O navegador não retornou uma assinatura Web Push válida.");
  }

  const deviceKey = `raiz-push-device-${user.uid}`;
  let deviceId = localStorage.getItem(deviceKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(deviceKey, deviceId);
  }
  await setDoc(doc(db, "users", user.uid, "devices", deviceId), {
    endpoint: serialized.endpoint,
    p256dh: serialized.keys.p256dh,
    auth: serialized.keys.auth,
    platform: navigator.userAgent.slice(0, 200),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return subscription;
}
