const { initializeApp } = require("firebase-admin/app");
const {
  FieldValue,
  Timestamp,
  getFirestore,
} = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const webPush = require("web-push");

initializeApp();
const db = getFirestore();
const webPushPrivateKey = defineSecret("WEB_PUSH_VAPID_PRIVATE_KEY");

// Esta chave pública precisa ser igual a webPushPublicKey em js/firebase-config.js.
const webPushPublicKey =
  "BE8AD3IifbLNbDo_vWVLbMczcg7spDhioRuMrS5ghUc2e1sg3jb3sADgWrUOfPdlWNOqrl9KvRNCN0z2J9LmP3s";
const webPushSubject = "mailto:bololoth06@gmail.com";

exports.sendUpcomingEventReminders = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
    maxInstances: 1,
    secrets: [webPushPrivateKey],
  },
  async () => {
    webPush.setVapidDetails(
      webPushSubject,
      webPushPublicKey,
      webPushPrivateKey.value(),
    );
    const now = new Date();
    const nowTimestamp = Timestamp.fromDate(now);
    const dueEvents = await db
      .collectionGroup("events")
      .where("done", "==", false)
      .where("reminderSentAt", "==", null)
      .where("reminderAt", "<=", nowTimestamp)
      .orderBy("reminderAt", "asc")
      .limit(300)
      .get();

    for (const eventSnapshot of dueEvents.docs) {
      const eventRef = eventSnapshot.ref;
      const userRef = eventRef.parent.parent;
      if (!userRef) continue;

      // A transação impede que execuções sobrepostas enviem o mesmo aviso.
      const claimed = await db.runTransaction(async (transaction) => {
        const latest = await transaction.get(eventRef);
        if (
          !latest.exists ||
          latest.get("done") === true ||
          latest.get("reminderSentAt") != null
        )
          return false;
        const dueAt = latest.get("reminderAt");
        if (!dueAt || dueAt.toMillis() > now.getTime()) return false;
        const claimedAt = latest.get("reminderClaimedAt");
        if (claimedAt && claimedAt.toMillis() > now.getTime() - 5 * 60_000)
          return false;
        transaction.update(eventRef, { reminderClaimedAt: nowTimestamp });
        return true;
      });
      if (!claimed) continue;

      try {
        const latest = await eventRef.get();
        const event = latest.data();
        if (!event || event.done) {
          await eventRef.update({
            reminderSentAt: FieldValue.serverTimestamp(),
            reminderClaimedAt: null,
          });
          continue;
        }
        const eventAt = event.eventAt?.toDate();
        // Não envie um lembrete atrasado depois de o compromisso já ter começado.
        if (!eventAt || eventAt.getTime() < now.getTime() - 3 * 60_000) {
          await eventRef.update({
            reminderSentAt: FieldValue.serverTimestamp(),
            reminderClaimedAt: null,
          });
          continue;
        }

        const deviceSnapshot = await userRef.collection("devices").get();
        if (deviceSnapshot.empty) {
          await eventRef.update({
            reminderSentAt: FieldValue.serverTimestamp(),
            reminderClaimedAt: null,
          });
          continue;
        }
        const payload = JSON.stringify({
          title: "Lembrete da agenda",
          body: event.time
            ? `${event.title} começa às ${event.time}.`
            : `${event.title} está na sua agenda de hoje.`,
          eventId: eventSnapshot.id,
          url: "./",
        });
        const results = await Promise.all(
          deviceSnapshot.docs.map(async (device) => {
            const subscription = {
              endpoint: device.get("endpoint"),
              keys: { p256dh: device.get("p256dh"), auth: device.get("auth") },
            };
            if (
              !subscription.endpoint ||
              !subscription.keys.p256dh ||
              !subscription.keys.auth
            ) {
              await device.ref.delete();
              return { sent: false, permanent: true };
            }
            try {
              await webPush.sendNotification(subscription, payload, {
                TTL: 3600,
              });
              return { sent: true, permanent: false };
            } catch (error) {
              if (error.statusCode === 404 || error.statusCode === 410) {
                await device.ref.delete();
                return { sent: false, permanent: true };
              }
              logger.warn("Falha temporária ao enviar push", {
                deviceId: device.id,
                statusCode: error.statusCode,
              });
              return { sent: false, permanent: false };
            }
          }),
        );

        const sentAny = results.some((result) => result.sent);
        const onlyPermanentFailures = results.every(
          (result) => result.permanent,
        );
        if (sentAny || onlyPermanentFailures) {
          await eventRef.update({
            reminderSentAt: FieldValue.serverTimestamp(),
            reminderClaimedAt: null,
          });
        } else {
          // Libera para a próxima execução se o serviço push estiver temporariamente indisponível.
          await eventRef.update({ reminderClaimedAt: null });
        }
      } catch (error) {
        logger.error("Falha ao enviar lembrete de compromisso", {
          eventId: eventSnapshot.id,
          error,
        });
        await eventRef.update({ reminderClaimedAt: null });
      }
    }
  },
);
