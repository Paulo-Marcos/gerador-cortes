import { api, dados } from '@/shared/api';
import type { ProviderIA } from '@/lib/providerIa';

// As gerações que chamam a IA pela assinatura do operador (Claude CLI ou
// Antigravity): a análise da live e, por corte, trechos, cenas, metadados e o
// prompt da capa. D-722: saiu de lib/api.ts, sobre o cliente gerado.

const doCorte = (corteId: string, provider: ProviderIA) => ({
  params: { path: { corte_id: corteId }, query: { provider } },
});

export const geracaoIaApi = {
  // F-038. D-286: `usarDiarizacao` (default true) injeta o rótulo de falante no
  // prompt quando o projeto já foi diarizado; false analisa ignorando os falantes.
  analisarViaClaude: (projetoId: string, usarDiarizacao = true, provider: ProviderIA = 'claude') =>
    dados(
      api.POST('/api/claude/projeto/{projeto_id}/analisar', {
        params: {
          path: { projeto_id: projetoId },
          query: { usar_diarizacao: usarDiarizacao, provider },
        },
      }),
    ),

  gerarTrechosClaude: (corteId: string, provider: ProviderIA = 'claude') =>
    dados(api.POST('/api/claude/corte/{corte_id}/gerar-trechos', doCorte(corteId, provider))),

  gerarCenasClaude: (corteId: string, provider: ProviderIA = 'claude') =>
    dados(api.POST('/api/claude/corte/{corte_id}/gerar-cenas', doCorte(corteId, provider))),

  // D-1037: a geração pode ser da cadeia do bruto, que nenhuma mutação da tela vê.
  cenasEmGeracao: (corteId: string) =>
    dados(
      api.GET('/api/claude/corte/{corte_id}/cenas-em-geracao', {
        params: { path: { corte_id: corteId } },
      }),
    ),

  gerarMetadadosClaude: (corteId: string, provider: ProviderIA = 'claude') =>
    dados(api.POST('/api/claude/corte/{corte_id}/gerar-metadados', doCorte(corteId, provider))),

  // D-1043: a geração preenche só o que falta; substituir é pedido explícito.
  regerarMetadadosClaude: (corteId: string, provider: ProviderIA = 'claude') =>
    dados(
      api.POST('/api/claude/corte/{corte_id}/gerar-metadados', {
        params: { path: { corte_id: corteId }, query: { provider, substituir: true } },
      }),
    ),

  gerarPromptThumbnailClaude: (corteId: string, provider: ProviderIA = 'claude') =>
    dados(
      api.POST('/api/claude/corte/{corte_id}/gerar-prompt-thumbnail', doCorte(corteId, provider)),
    ),
};
