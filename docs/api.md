# API (Webhook)

## `GET /`

Health check com resumo de estabelecimentos carregados.

**Resposta**

- `200 OK`
- JSON com `ok`, `establishments` e `source`

## `POST /twilio`

Endpoint para receber mensagens do Twilio (form-urlencoded).

### Resolução de estabelecimento

Prioridade:
1. `:establishmentId` na rota (quando usar `/twilio/:establishmentId`)
2. `To` do payload Twilio (comparado com `twilio_number` do `establishments.json`)
3. primeiro estabelecimento da lista (fallback)

### Entrada esperada

- `From` (string): remetente
- `Body` (string): texto da mensagem
- `To` (string): número de destino Twilio (recomendado para multi-estabelecimento)

### Saída

- `200 OK`
- `Content-Type: text/xml`
- Corpo TwiML com a resposta do bot

### Segurança

Quando `TWILIO_AUTH_TOKEN` está configurado e `TWILIO_VALIDATE_SIGNATURE=true`, o servidor valida `X-Twilio-Signature` e rejeita requisições inválidas com `403`.

## `POST /twilio/:establishmentId`

Força o contexto do estabelecimento informado na rota.
