import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import fs from "fs";
import twilio from "twilio";
import {
  askClinicBot,
  emptyCollected,
  enforceFlow,
  parseYesNo,
} from "./src/core/bot-core.mjs";

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

if (!process.env.OPENAI_API_KEY)
  throw new Error("OPENAI_API_KEY não encontrada.");

const clinic = JSON.parse(
  fs.readFileSync(new URL("./clinica.json", import.meta.url), "utf8"),
);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sessions = new Map();

function newSession() {
  return {
    mode: "idle",
    collected: emptyCollected(),
    history: [],
  };
}

function getSession(from) {
  if (!sessions.has(from)) sessions.set(from, newSession());
  return sessions.get(from);
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

app.get("/", (req, res) => res.status(200).send("ok"));

app.post("/twilio", async (req, res) => {
  const payload = req.body || {};

  console.log("CONTENT-TYPE:", req.headers["content-type"]);
  console.log("TWILIO FROM:", payload.From || "unknown");

  if (shouldValidateTwilioSignature() && !isValidTwilioRequest(req)) {
    return res.status(403).type("text/plain").send("invalid twilio signature");
  }

  const from = payload.From || "unknown";
  const body = String(payload.Body || "").trim();

  const twiml = new twilio.twiml.MessagingResponse();

  if (from === "unknown" && !body) {
    twiml.message(
      "Webhook ok ✅ (mas não recebi From/Body). Confira se o Twilio está chamando via POST com form-urlencoded.",
    );
    return res.type("text/xml").send(twiml.toString());
  }

  const session = getSession(from);

  if (session.mode === "awaiting_confirmation") {
    const yn = parseYesNo(body);

    if (yn === "yes") {
      const c = session.collected;
      twiml.message(
        `Agendamento confirmado ✅\n• ${c.procedimento} — ${c.data} às ${c.horario}\nSe quiser, posso te passar endereço/orientações 🙂`,
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
      clinic,
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
  console.log(`Webhook rodando em http://localhost:${PORT}`),
);
