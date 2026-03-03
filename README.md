# AI Bot WhatsApp (Clínica)

Projeto de **atendente virtual para WhatsApp** usando **Twilio + OpenAI + Node.js**.

A proposta deste repositório é servir como um case de portfólio para automação de atendimento: responder dúvidas de clínica e conduzir o usuário até a confirmação de agendamento.

## ✨ Destaques

- Atendimento conversacional em português com regras de negócio.
- Coleta guiada de agendamento (procedimento → data → horário → nome → telefone).
- Confirmação determinística (`sim/não`) antes de fechar o agendamento.
- Webhook para Twilio (`POST /twilio`) e simulador em terminal.
- Prompt estruturado com saída em JSON Schema para maior previsibilidade.

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
    ├── chat.mjs
    ├── clinica.json
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

Preencha o `.env` com sua chave.

### 3) Rodar em terminal (simulador)

```bash
npm run chat
```

### 4) Rodar servidor webhook

```bash
npm start
```

Servidor sobe em `http://localhost:3000` por padrão.

## 🔌 Endpoint

- `GET /` → health check (`ok`)
- `POST /twilio` → recebe payload do Twilio e responde TwiML

Exemplo de campos esperados do Twilio:

- `From`: identificador/telefone de origem
- `Body`: texto enviado pelo usuário

## 📚 Documentação

- Arquitetura: [`docs/architecture.md`](docs/architecture.md)
- Fluxo conversacional: [`docs/conversation-flow.md`](docs/conversation-flow.md)
- API/Webhook: [`docs/api.md`](docs/api.md)

## 🛣️ Roadmap curto

- [ ] Validar assinatura do Twilio (`X-Twilio-Signature`).
- [ ] Persistir sessão em Redis/DB (hoje está em memória).
- [ ] Criar suíte de testes automatizados do fluxo de agendamento.
- [ ] Adicionar logs estruturados com mascaramento de dados sensíveis.

## ⚠️ Limitações atuais

- Sessões em memória (reiniciar processo reseta contexto).
- Ainda sem autenticação/verificação de assinatura no webhook.
- Sem testes automatizados de integração end-to-end.

## 👤 Autor

Projeto organizado para fins de portfólio freelancer.
