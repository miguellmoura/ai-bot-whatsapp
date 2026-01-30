import "dotenv/config";
import fs from "fs";
import readline from "readline";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY)
  throw new Error("OPENAI_API_KEY não encontrada.");

const clinic = JSON.parse(
  fs.readFileSync(new URL("./clinica.json", import.meta.url), "utf8"),
);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

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

const REQUIRED_FOR_APPOINTMENT = [
  "procedimento",
  "data",
  "horario",
  "nome",
  "telefone",
];

let state = {
  mode: "idle", // "idle" | "collecting_agendamento" | "awaiting_confirmation"
  collected: {
    procedimento: null,
    data: null,
    horario: null,
    nome: null,
    telefone: null,
  },
  last_intent: "outro",
};

function computeMissing(collected) {
  return REQUIRED_FOR_APPOINTMENT.filter((k) => !collected[k]);
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
    "isso",
    "isso mesmo",
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

let history = [];

async function askGPT(userText) {
  const missing = computeMissing(state.collected);

  const input = [
    { role: "system", content: SYSTEM_RULES },
    {
      role: "system",
      content: `DADOS_DA_CLINICA:\n${JSON.stringify(clinic, null, 2)}`,
    },
    {
      role: "system",
      content: `ESTADO_ATUAL:\n${JSON.stringify({ state, missing }, null, 2)}`,
    },
    {
      role: "system",
      content: `
- Preencha collected_fields só com o que conseguir extrair do texto do usuário.
- Se detectar intenção de agendar, intent="agendamento".
- Se state.mode="collecting_agendamento": pergunte apenas 1 coisa: o primeiro item de missing.
- Não invente dados.
`.trim(),
    },
    ...history,
    { role: "user", content: userText },
  ];

  const res = await client.responses.create({
    model: "gpt-5.2",
    input,
    text: {
      format: {
        type: "json_schema",
        name: "clinic_bot_response_terminal",
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

function enforceFlow(out) {
  if (out.intent === "agendamento" && state.mode === "idle")
    state.mode = "collecting_agendamento";

  state.collected = mergeCollected(state.collected, out.collected_fields);
  const missing = computeMissing(state.collected);

  if (out.intent === "humano" || out.handoff) {
    state.mode = "idle";
    return {
      reply: out.reply || "Posso te encaminhar para um atendente humano 🙂",
      debug: { out, state, missing },
    };
  }

  if (state.mode === "collecting_agendamento" && missing.length === 0)
    state.mode = "awaiting_confirmation";

  if (state.mode === "awaiting_confirmation") {
    const c = state.collected;
    const confirm = `Perfeito 🙂 Só confirmando:
• Procedimento: ${c.procedimento}
• Data: ${c.data}
• Horário: ${c.horario}
• Nome: ${c.nome}
• Telefone: ${c.telefone}

Posso confirmar esse agendamento? (sim/não)`;
    return { reply: confirm, debug: { out, state, missing } };
  }

  if (state.mode === "collecting_agendamento") {
    const first = missing[0];
    const fallback = {
      procedimento:
        "Qual procedimento você quer agendar? (ex: avaliação, limpeza, clareamento)",
      data: "Para qual dia você quer agendar?",
      horario: "Qual horário você prefere?",
      nome: "Qual seu nome, por favor?",
      telefone: "Pode me informar seu telefone com DDD?",
    };
    const forced = out.reply?.trim() ? out.reply : fallback[first];
    return { reply: forced, debug: { out, state, missing } };
  }

  return { reply: out.reply, debug: { out, state, missing } };
}

function resetAppointmentState() {
  state.mode = "idle";
  state.collected = {
    procedimento: null,
    data: null,
    horario: null,
    nome: null,
    telefone: null,
  };
  state.last_intent = "outro";
}

console.log(`🤖 Bot da ${clinic.name} (ESTADO + JSON) — digite "sair"\n`);

function loop() {
  rl.question("Você: ", async (text) => {
    const trimmed = text.trim();
    if (trimmed.toLowerCase() === "sair") return rl.close();

    if (state.mode === "awaiting_confirmation") {
      const yn = parseYesNo(trimmed);
      if (yn === "yes") {
        const c = state.collected;
        console.log(
          `Bot: Agendamento confirmado ✅\n• ${c.procedimento} — ${c.data} às ${c.horario}\nSe quiser, posso te passar endereço/orientações 🙂\n`,
        );
        resetAppointmentState();
        return loop();
      }
      if (yn === "no") {
        state.mode = "collecting_agendamento";
        console.log(
          "Bot: Sem problemas 🙂 O que você quer alterar? (procedimento, data ou horário)\n",
        );
        return loop();
      }
      console.log(
        "Bot: Só pra eu confirmar: você quer *confirmar* esse agendamento? (sim/não)\n",
      );
      return loop();
    }

    history.push({ role: "user", content: trimmed });
    history = history.slice(-6);

    try {
      const out = await askGPT(trimmed);
      const final = enforceFlow(out);

      console.log(`Bot: ${final.reply}\n`);
      console.log(
        "DEBUG STATE:",
        JSON.stringify(final.debug.state, null, 2),
        "\n",
      );

      history.push({ role: "assistant", content: final.reply });
      history = history.slice(-6);
    } catch (err) {
      console.error("Erro:", err?.message || err);
    }

    loop();
  });
}

loop();
