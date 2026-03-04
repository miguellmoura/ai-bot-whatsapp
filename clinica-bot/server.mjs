import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import twilio from "twilio";
import {
  askClinicBot,
  emptyCollected,
  enforceFlow,
  parseYesNo,
} from "./src/core/bot-core.mjs";
import {
  findEstablishment,
  loadEstablishments,
} from "./src/core/establishments.mjs";

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

if (!process.env.OPENAI_API_KEY)
  throw new Error("OPENAI_API_KEY não encontrada.");

const { establishments, source } = loadEstablishments();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sessions = new Map();

function newSession() {
  return {
    mode: "idle",
    collected: emptyCollected(),
    history: [],
  };
}

function getSession(sessionKey) {
  if (!sessions.has(sessionKey)) sessions.set(sessionKey, newSession());
  return sessions.get(sessionKey);
}

function resetSession(session) {
  session.mode = "idle";
  session.collected = emptyCollected();
  session.history = [];
}

function shouldValidateTwilioSignature() {
  return (
    Boolean(process.env.TWILIO_AUTH_TOKEN) &&
    process.env.TWILIO_VALIDATE_SIGNATURE !== "false"
  );
}

function isValidTwilioRequest(req) {
  const signature = req.headers["x-twilio-signature"];
  if (!signature) return false;

  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body || {},
  );
}

app.get("/", (req, res) =>
  res.status(200).json({ ok: true, establishments: establishments.length, source }),
);

app.post(["/twilio", "/twilio/:establishmentId"], async (req, res) => {
  const payload = req.body || {};

  if (shouldValidateTwilioSignature() && !isValidTwilioRequest(req)) {
    return res.status(403).type("text/plain").send("invalid twilio signature");
  }

  const establishment = findEstablishment({
    establishments,
    establishmentId: req.params.establishmentId,
    twilioTo: payload.To,
  });

  const twiml = new twilio.twiml.MessagingResponse();
  if (!establishment) {
    twiml.message(
      "Não consegui identificar o estabelecimento. Verifique o número Twilio ou rota do webhook.",
    );
    return res.type("text/xml").send(twiml.toString());
  }

  console.log("ESTABLISHMENT:", establishment.id, "FROM:", payload.From || "unknown");

  const from = payload.From || "unknown";
  const body = String(payload.Body || "").trim();

  if (from === "unknown" && !body) {
    twiml.message(
      "Webhook ok ✅ (mas não recebi From/Body). Confira se o Twilio está chamando via POST com form-urlencoded.",
    );
    return res.type("text/xml").send(twiml.toString());
  }

  const sessionKey = `${establishment.id}:${from}`;
  const session = getSession(sessionKey);

  if (session.mode === "awaiting_confirmation") {
    const yn = parseYesNo(body);

    if (yn === "yes") {
      const c = session.collected;
      twiml.message(
        `Agendamento confirmado ✅\n• ${c.procedimento} — ${c.data} às ${c.horario}\n${establishment.name}: se quiser, posso te passar endereço/orientações 🙂`,
      );
      resetSession(session);
      return res.type("text/xml").send(twiml.toString());
    }

    if (yn === "no") {
      session.mode = "collecting_agendamento";
      twiml.message(
        "Sem problemas 🙂 O que você quer alterar? (procedimento, data ou horário)",
      );
      return res.type("text/xml").send(twiml.toString());
    }

    twiml.message(
      "Só pra eu confirmar: você quer *confirmar* o agendamento? (sim/não)",
    );
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    session.history.push({ role: "user", content: body });
    session.history = session.history.slice(-6);

    const out = await askClinicBot({
      client,
      clinic: establishment,
      session,
      history: session.history,
      userText: body,
      schemaName: "clinic_bot_response_twilio",
    });
    const reply = enforceFlow(session, out);

    session.history.push({ role: "assistant", content: reply });
    session.history = session.history.slice(-6);

    twiml.message(reply);
    return res.type("text/xml").send(twiml.toString());
  } catch (e) {
    console.error(e);
    twiml.message("Tive um problema aqui 😅 Pode tentar de novo em instantes?");
    return res.type("text/xml").send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Webhook rodando em http://localhost:${PORT} com ${establishments.length} estabelecimento(s)`),
);
