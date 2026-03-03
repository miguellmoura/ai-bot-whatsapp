export const SYSTEM_RULES = `
Você é um atendente virtual de clínica (WhatsApp).
Objetivo: responder dúvidas e conduzir para agendamento.

Regras:
- NÃO invente preço/horário/endereço/serviços. Use apenas os dados fornecidos.
- Seja cordial, curto e claro (estilo WhatsApp).
- Se faltar informação, faça no máximo 1 pergunta por vez.
- Em agendamento, colete dados passo a passo: procedimento -> data -> horário -> nome -> telefone.
- Se o usuário pedir algo fora do escopo/sensível, ofereça encaminhar para humano.
`.trim();

export const REQUIRED_FIELDS = [
  "procedimento",
  "data",
  "horario",
  "nome",
  "telefone",
];

export function emptyCollected() {
  return {
    procedimento: null,
    data: null,
    horario: null,
    nome: null,
    telefone: null,
  };
}

export function computeMissing(collected) {
  return REQUIRED_FIELDS.filter((k) => !collected[k]);
}

export function mergeCollected(oldCollected, newCollected) {
  const merged = { ...oldCollected };
  for (const key of Object.keys(merged)) {
    if (
      newCollected &&
      newCollected[key] &&
      String(newCollected[key]).trim() !== ""
    ) {
      merged[key] = newCollected[key];
    }
  }
  return merged;
}

export function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

export function parseYesNo(text) {
  const normalized = normalizeText(text);
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

  if (yes.includes(normalized)) return "yes";
  if (no.includes(normalized)) return "no";
  return null;
}

export function getResponseSchema(name) {
  return {
    type: "json_schema",
    name,
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
  };
}

export async function askClinicBot({
  client,
  clinic,
  session,
  history,
  userText,
  schemaName,
}) {
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
    ...history,
    { role: "user", content: userText },
  ];

  const response = await client.responses.create({
    model: "gpt-5.2",
    input,
    text: {
      format: getResponseSchema(schemaName),
    },
  });

  return JSON.parse(response.output_text);
}

export function enforceFlow(session, output) {
  if (output.intent === "agendamento" && session.mode === "idle") {
    session.mode = "collecting_agendamento";
  }

  session.collected = mergeCollected(session.collected, output.collected_fields);
  const missing = computeMissing(session.collected);

  if (output.intent === "humano" || output.handoff) {
    session.mode = "idle";
    return output.reply || "Posso te encaminhar para um atendente humano 🙂";
  }

  if (session.mode === "collecting_agendamento" && missing.length === 0) {
    session.mode = "awaiting_confirmation";
  }

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
    return output.reply?.trim()
      ? output.reply
      : fallback[first] || "Pode me falar um pouco mais?";
  }

  return output.reply || "Como posso te ajudar? 🙂";
}
