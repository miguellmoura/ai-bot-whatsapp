# AI Bot WhatsApp (Multi-estabelecimento)

Projeto de **atendente virtual para WhatsApp** usando **Twilio + OpenAI + Node.js**, com suporte a **múltiplos estabelecimentos** (clínicas, studios, consultórios etc.) no mesmo backend.

## ✨ Destaques

- Atendimento conversacional em português com regras de negócio.
- Coleta guiada de agendamento (procedimento → data → horário → nome → telefone).
- Confirmação determinística (`sim/não`) antes de fechar o agendamento.
- Webhook para Twilio (`POST /twilio` e `POST /twilio/:establishmentId`) e simulador em terminal.
- Prompt estruturado com saída em JSON Schema para maior previsibilidade.
- Multi-tenant simples por estabelecimento, sem misturar sessão entre operações.

## 🧱 Estrutura do projeto

```text
.
├── README.md
├── docs/
│   ├── api.md
│   ├── architecture.md
│   └── conversation-flow.md
└── clinica-bot/
    ├── .env.example
    ├── establishments.json
    ├── chat.mjs
    ├── clinica.json (fallback legado)
    ├── src/core/
    │   ├── bot-core.mjs
    │   └── establishments.mjs
    ├── package.json
    └── server.mjs
```

## 🚀 Como rodar

### Pré-requisitos

- Node.js 20+
- Conta da OpenAI com chave de API
- (Opcional) Conta Twilio para testes reais no WhatsApp

### 1) Instalação

```bash
cd clinica-bot
npm install
```

### 2) Configuração de ambiente

```bash
cp .env.example .env
```

Preencha o `.env` com sua chave e, em ambiente com Twilio real, com `TWILIO_AUTH_TOKEN` para validar assinatura do webhook.

### 3) Rodar em terminal (simulador)

```bash
npm run chat
```

Opcionalmente selecione o estabelecimento no terminal:

```bash
ESTABLISHMENT_ID=studio-derma npm run chat
```

### 4) Rodar servidor webhook

```bash
npm start
```

Servidor sobe em `http://localhost:3000` por padrão.

## 🔌 Endpoint

- `GET /` → health check + resumo de estabelecimentos carregados
- `POST /twilio` → resolve estabelecimento pelo número de destino (`To`) e responde TwiML
- `POST /twilio/:establishmentId` → força um estabelecimento específico via rota

## 🏪 Como adicionar novo estabelecimento

1. Edite `clinica-bot/establishments.json` e adicione novo objeto com `id`, `name`, `address`, `hours`, `services` e `policies`.
2. (Recomendado) Defina `twilio_number` para roteamento automático por número de destino.
3. Reinicie o servidor.

## 💼 Valor de negócio (story para cliente)

Este bot foi pensado para resolver dores comuns de negócios de atendimento:

- **Resposta mais rápida** para dúvidas frequentes (horários, serviços, políticas).
- **Triagem e pré-agendamento padronizados**, reduzindo retrabalho da equipe.
- **Atendimento fora do horário comercial**, sem deixar o lead “esfriar”.
- **Encaminhamento humano quando necessário**, sem perder contexto da conversa.

### Resultados esperados (KPIs que você pode acompanhar)

- Tempo médio de primeira resposta (FRT).
- Taxa de conclusão de agendamento (início → confirmação).
- Volume de dúvidas resolvidas sem intervenção humana.
- Taxa de abandono durante coleta de dados.

## 📚 Documentação

- Arquitetura: [`docs/architecture.md`](docs/architecture.md)
- Fluxo conversacional: [`docs/conversation-flow.md`](docs/conversation-flow.md)
- API/Webhook: [`docs/api.md`](docs/api.md)

## ⚠️ Limitações atuais

- Sessões em memória (reiniciar processo reseta contexto).
- Validação de assinatura Twilio depende de configurar `TWILIO_AUTH_TOKEN` no ambiente.
- Sem testes automatizados de integração end-to-end.

## 👤 Autor

Projeto organizado para fins de portfólio freelancer.
