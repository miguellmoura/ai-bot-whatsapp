# Fluxo de conversa

O bot usa três estados principais:

- `idle`
- `collecting_agendamento`
- `awaiting_confirmation`

## Diagrama de estados

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> collecting_agendamento: intenção de agendar
  collecting_agendamento --> collecting_agendamento: faltam campos
  collecting_agendamento --> awaiting_confirmation: todos os campos coletados
  awaiting_confirmation --> idle: confirmação "sim"
  awaiting_confirmation --> collecting_agendamento: resposta "não"
```

## Campos obrigatórios para agendamento

1. procedimento
2. data
3. horário
4. nome
5. telefone

## Regras de atendimento

- Não inventar dados fora do `clinica.json`.
- Fazer no máximo uma pergunta por vez durante coleta.
- Oferecer encaminhamento humano quando necessário.
