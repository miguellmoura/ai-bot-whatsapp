# API (Webhook)

## `GET /`

Health check simples.

**Resposta**

- `200 OK`
- body: `ok`

## `POST /twilio`

Endpoint para receber mensagens do Twilio (form-urlencoded).

### Entrada esperada

- `From` (string): remetente
- `Body` (string): texto da mensagem

### Saída

- `200 OK`
- `Content-Type: text/xml`
- Corpo TwiML com a resposta do bot

## Exemplo de fluxo

1. Twilio envia `From` + `Body`.
2. Servidor recupera/abre sessão por `From`.
3. Bot consulta OpenAI com regras + estado atual.
4. Resposta passa pelo `enforceFlow`.
5. Servidor devolve TwiML.

## Erros

Em exceções internas, o bot retorna mensagem amigável e mantém o webhook respondendo com XML.
