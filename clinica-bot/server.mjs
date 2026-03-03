import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import fs from "fs";
import twilio from "twilio";

const app = express();

// ✅ parsers (a ordem importa: antes das rotas)
app.use(express.urlencoded({ extended: false })); // Twilio padrão
app.use(express.json()); // ajuda em alguns testes

if (!process.env.OPENAI_API_KEY)
  throw new Error("OPENAI_API_KEY não encontrada.");

const clinic = JSON.parse(
  fs.readFileSync(new URL("./clinica.json", import.meta.url), "utf8"),
);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_RULES = `
Você é um atendente virtual de clínica (WhatsApp).
Objetivo: responder dúvidas e conduzir para agendamento.

Regras:
- NÃO invente preço/horário/endereço/serviços. Use apenas os dados fornecidos.
- Seja cordial, curto e claro (estilo WhatsApp).
- Se faltar informação, faça no máximo 1 pergunta por vez.
- Em agendamento, colete dados passo a passo: procedimento -> data -> horário -> nome -> telefone.
- Se o usuário pedir algo fora do escopo/sensível, ofereça encaminhar para humano.
`.trim();

const REQUIRED = ["procedimento", "data", "horario", "nome", "telefone"];

// sessões por usuário
const sessions = new Map();

function newSession() {
  return {
    mode: "idle", // idle | collecting_agendamento | awaiting_confirmation
    collected: {
      procedimento: null,
      data: null,
      horario: null,
      nome: null,
      telefone: null,
    },
    history: [],
  };
}

function getSession(from) {
  if (!sessions.has(from)) sessions.set(from, newSession());
  return sessions.get(from);
}

function resetSession(session) {
  session.mode = "idle";
  session.collected = {
    procedimento: null,
    data: null,
    horario: null,
    nome: null,
    telefone: null,
  };
  session.history = [];
}

function computeMissing(collected) {
  return REQUIRED.filter((k) => !collected[k]);
}

function mergeCollected(oldC, newC) {
  const merged = { ...oldC };
  for (const k of Object.keys(merged)) {
    if (newC && newC[k] && String(newC[k]).trim() !== "") merged[k] = newC[k];
  }
  return merged;
}

function normalizeText(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function parseYesNo(s) {
  const t = normalizeText(s);
  const yes = [
    "sim",
    "s",
    "confirmo",
    "confirmar",
    "pode",
    "ok",
    "okay",
    "confirmado",
  ];
  const no = [
    "nao",
    "não",
    "n",
    "cancelar",
    "cancela",
    "negativo",
    "trocar",
    "mudar",
  ];
  if (yes.includes(t)) return "yes";
  if (no.includes(t)) return "no";
  return null;
}

async function askGPT(session, userText) {
  const missing = computeMissing(session.collected);

  const input = [
    { role: "system", content: SYSTEM_RULES },
    {
      role: "system",
      content: `DADOS_DA_CLINICA:\n${JSON.stringify(clinic, null, 2)}`,
    },
    {
      role: "system",
      content: `ESTADO_ATUAL:\n${JSON.stringify({ mode: session.mode, collected: session.collected, missing }, null, 2)}`,
    },
    {
      role: "system",
      content: `
- collected_fields: só extraia do texto do usuário.
- Se detectar intenção de agendar, intent="agendamento".
- Se mode="collecting_agendamento": pergunte apenas 1 coisa: o primeiro item de missing.
- Não invente dados.
`.trim(),
    },
    ...session.history,
    { role: "user", content: userText },
  ];

  const res = await client.responses.create({
    model: "gpt-5.2",
    input,
    text: {
      format: {
        type: "json_schema",
        name: "clinic_bot_response_twilio",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            intent: {
              type: "string",
              enum: [
                "faq",
                "agendamento",
                "preco",
                "horario",
                "endereco",
                "politicas",
                "humano",
                "outro",
              ],
            },
            reply: { type: "string" },
            collected_fields: {
              type: "object",
              additionalProperties: false,
              properties: {
                nome: { type: ["string", "null"] },
                telefone: { type: ["string", "null"] },
                procedimento: { type: ["string", "null"] },
                data: { type: ["string", "null"] },
                horario: { type: ["string", "null"] },
              },
              required: ["nome", "telefone", "procedimento", "data", "horario"],
            },
            handoff: { type: "boolean" },
            notes: { type: "string" },
          },
          required: ["intent", "reply", "collected_fields", "handoff", "notes"],
        },
      },
    },
  });

  return JSON.parse(res.output_text);
}

function enforceFlow(session, out) {
  if (out.intent === "agendamento" && session.mode === "idle")
    session.mode = "collecting_agendamento";

  session.collected = mergeCollected(session.collected, out.collected_fields);
  const missing = computeMissing(session.collected);

  if (out.intent === "humano" || out.handoff) {
    session.mode = "idle";
    return out.reply || "Posso te encaminhar para um atendente humano 🙂";
  }

  if (session.mode === "collecting_agendamento" && missing.length === 0)
    session.mode = "awaiting_confirmation";

  if (session.mode === "awaiting_confirmation") {
    const c = session.collected;
    return `Perfeito 🙂 Só confirmando:
• Procedimento: ${c.procedimento}
• Data: ${c.data}
• Horário: ${c.horario}
• Nome: ${c.nome}
• Telefone: ${c.telefone}

Posso confirmar esse agendamento? (sim/não)`;
  }

  if (session.mode === "collecting_agendamento") {
    const first = missing[0];
    const fallback = {
      procedimento:
        "Qual procedimento você quer agendar? (ex: avaliação, limpeza, clareamento)",
      data: "Para qual dia você quer agendar?",
      horario: "Qual horário você prefere?",
      nome: "Qual seu nome, por favor?",
      telefone: "Pode me informar seu telefone com DDD?",
    };
    return out.reply?.trim()
      ? out.reply
      : fallback[first] || "Pode me falar um pouco mais?";
  }

  return out.reply || "Como posso te ajudar? 🙂";
}

// ✅ rota de health check pra você não ver 404 no /
app.get("/", (req, res) => res.status(200).send("ok"));

app.post("/twilio", async (req, res) => {
  // ✅ nunca mais quebra
  const payload = req.body || {};

  // logs básicos (evita exposição de payload sensível em produção)
  console.log("CONTENT-TYPE:", req.headers["content-type"]);
  console.log("TWILIO FROM:", payload.From || "unknown");

  const from = payload.From || "unknown";
  const body = String(payload.Body || "").trim();

  const twiml = new twilio.twiml.MessagingResponse();

  // se o Twilio não mandou o payload esperado
  if (from === "unknown" && !body) {
    twiml.message(
      "Webhook ok ✅ (mas não recebi From/Body). Confira se o Twilio está chamando via POST com form-urlencoded.",
    );
    return res.type("text/xml").send(twiml.toString());
  }

  const session = getSession(from);

  // confirmação determinística
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

    const out = await askGPT(session, body);
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
