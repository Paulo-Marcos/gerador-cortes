# Guia de Setup: n8n + Workflows CortadorLive

## 1. Acessar o n8n

Abra: **http://localhost:5678**

Se for a primeira vez, crie uma conta de administrador local (qualquer email/senha — é apenas local).

---

## 2. Adicionar a credencial do Gemini

1. Vá em **Settings → Credentials → New Credential**
2. Busque por **"Google Gemini"** (ou "Google PaLM")
3. Cole sua `GEMINI_API_KEY` (obtenha em https://aistudio.google.com/app/apikey)
4. Salve com o nome: **`Google Gemini API`**

---

## 3. Importar os Workflows

### Workflow de Análise de Transcrição

1. Vá em **Workflows → Import from File**
2. Selecione: `n8n-workflows/analise-transcricao.json`
3. Após importar:
   - Clique no nó **"Google Gemini Chat Model"**
   - Selecione a credencial **"Google Gemini API"** que criou no passo 2
   - Salve e **Ative** o workflow (toggle no canto superior direito)
4. Copie o **Webhook URL** que aparece no nó "Webhook Trigger"
   - Vai ser algo como: `http://localhost:5678/webhook/analise-transcricao`
   - O **path** que interessa é: `analise-transcricao`

### Workflow de Geração de Metadados

1. Vá em **Workflows → Import from File**
2. Selecione: `n8n-workflows/gerar-metadados.json`
3. Repita os mesmos passos acima
4. Path do webhook: `gerar-metadados`

---

## 4. Configurar o .env do backend

Edite `backend/.env`:

```env
N8N_BASE_URL=http://n8n:5678
N8N_WEBHOOK_ANALISE=analise-transcricao
N8N_WEBHOOK_METADADOS=gerar-metadados
GEMINI_API_KEY=sua_chave_aqui
```

> **Nota:** dentro do Docker, o backend acessa o n8n como `http://n8n:5678` (nome do serviço na rede interna).
> Para testar localmente (fora do Docker), use `http://localhost:5678`.

---

## 5. Reiniciar o backend

```bash
docker compose restart backend
```

---

## 6. Testar a integração

### Testar Análise de Transcrição (no n8n)

Clique em **"Test Webhook"** no nó Webhook Trigger do workflow de análise e envie este JSON de exemplo:

```json
{
  "projeto_id": "teste-001",
  "youtube_url": "https://www.youtube.com/watch?v=EXEMPLO",
  "titulo_live": "Live de Teste",
  "duracao_segundos": 7200,
  "transcricao": [
    {"inicio": "00:01:00.000", "fim": "00:01:30.000", "texto": "Hoje vamos falar sobre..."},
    {"inicio": "00:01:30.000", "fim": "00:02:00.000", "texto": "O problema central da modernidade..."}
  ],
  "guia_cortes": ""
}
```

O workflow deve retornar um JSON com `{ "cortes": [...] }`.

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Workflow não ativa | Verifique se a credencial Gemini está correta |
| Timeout na análise | Lives longas (3h+) podem demorar 2-3 min — normal |
| Backend não conecta no n8n | Verifique se `N8N_BASE_URL=http://n8n:5678` no .env e reiniciou o backend |
| JSON inválido do LLM | O nó "Parseia" tem fallback robusto — verifique os logs do n8n |
