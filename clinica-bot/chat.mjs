import "dotenv/config";
import readline from "readline";
import OpenAI from "openai";
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

if (!process.env.OPENAI_API_KEY)
  throw new Error("OPENAI_API_KEY não encontrada.");

const { establishments } = loadEstablishments();
const selectedId = process.env.ESTABLISHMENT_ID;
const establishment = findEstablishment({
  establishments,
  establishmentId: selectedId,
});

if (!establishment) {
  throw new Error(
    `ESTABLISHMENT_ID inválido. Opções: ${establishments.map((e) => e.id).join(", ")}`,
  );
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let state = {
  mode: "idle",
  collected: emptyCollected(),
};

let history = [];

function resetAppointmentState() {
  state.mode = "idle";
  state.collected = emptyCollected();
}

console.log(
  `🤖 Bot de ${establishment.name} [${establishment.id}] (ESTADO + JSON) — digite "sair"\n`,
);

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
      const out = await askClinicBot({
        client,
        clinic: establishment,
        session: state,
        history,
        userText: trimmed,
        schemaName: "clinic_bot_response_terminal",
      });
      const reply = enforceFlow(state, out);

      console.log(`Bot: ${reply}\n`);
      console.log("DEBUG STATE:", JSON.stringify(state, null, 2), "\n");

      history.push({ role: "assistant", content: reply });
      history = history.slice(-6);
    } catch (err) {
      console.error("Erro:", err?.message || err);
    }

    loop();
  });
}

loop();
