import { estaAprovado } from '@/lib/statusDoCorte';
import type { StatusCorte, StatusExportCorte } from '@/types/models';
import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import type { ChromeBarra, ChromeEstado } from '@/upgrade/UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-870 · O rodapé do Workspace (Onda 3, nota 5).
//
// "O botão vermelho diz o próximo passo da live e fica sempre no canto
// inferior direito, como no editor." A tela respondia "o que fazer agora?"
// em vários lugares (um Publicar na faixa, o Aprovar em cada linha); o
// rodapé responde num só, com o verbo do passo. Decisões do Paulo:
//   analisar → Aprovar os N propostos (com confirmação) → renderizar →
//   publicar. "Gerar trechos" fica fora (não há sinal confiável de "já
//   feito", e pede a escolha Claude/Gemini). Não há render em lote: o
//   rodapé leva à Pós do próximo corte sem render.
// ─────────────────────────────────────────────────────────────────

export type ProximaAcao =
  | { tipo: 'analisar' }
  | { tipo: 'aprovar'; quantos: number }
  | { tipo: 'renderizar'; corteId: string; numero: number }
  | { tipo: 'publicar'; total: number; liberado: boolean; motivo: string }
  | { tipo: 'no-ar' };

export type DadosDoRodape = {
  cortes: Array<{ id: string; numero: number; status: StatusCorte }>;
  statusList: StatusExportCorte[];
  prontidao: { total: number; liberado: boolean; detalhe: string };
  /** Live limpa é live encerrada (D-866): o vídeo apagado não se renderiza. */
  arquivosLimpos: boolean;
};

export function proximaAcaoDaLive(d: DadosDoRodape): ProximaAcao {
  if (d.cortes.length === 0) return { tipo: 'analisar' };

  const propostos = d.cortes.filter((c) => c.status === 'proposto').length;
  if (propostos > 0) return { tipo: 'aprovar', quantos: propostos };

  if (!d.arquivosLimpos) {
    const porId = new Map(d.statusList.map((s) => [s.corte_id, s]));
    const semRender = [...d.cortes]
      .sort((a, b) => a.numero - b.numero)
      .find((c) => {
        const s = porId.get(c.id);
        return estaAprovado(c.status) && !s?.video_pronto && !s?.youtube_url_publicado;
      });
    if (semRender) return { tipo: 'renderizar', corteId: semRender.id, numero: semRender.numero };
  }

  if (d.prontidao.total > 0)
    return {
      tipo: 'publicar',
      total: d.prontidao.total,
      liberado: d.prontidao.liberado,
      motivo: d.prontidao.detalhe,
    };
  return { tipo: 'no-ar' };
}

const cortes = (n: number) => `${n} ${n === 1 ? 'corte' : 'cortes'}`;

/** O passo vira o botão principal do rodapé — o mesmo lugar do editor. */
export function barraDoWorkspace(
  acao: ProximaAcao,
  h: {
    analisar: () => void;
    aprovarPropostos: (quantos: number) => void;
    renderizar: (corteId: string) => void;
    publicar: () => void;
  },
): ChromeBarra {
  switch (acao.tipo) {
    case 'analisar':
      return { primario: { texto: 'Analisar com a IA', icone: 'brain', onClick: h.analisar } };
    case 'aprovar':
      return {
        primario: {
          texto: acao.quantos === 1 ? 'Aprovar o proposto' : `Aprovar os ${acao.quantos} propostos`,
          icone: 'check',
          onClick: () => h.aprovarPropostos(acao.quantos),
        },
      };
    case 'renderizar':
      return {
        primario: {
          texto: `Renderizar o #${acao.numero}`,
          icone: 'clapperboard',
          onClick: () => h.renderizar(acao.corteId),
        },
      };
    case 'publicar':
      return {
        primario: {
          texto: `Publicar ${cortes(acao.total)}`,
          icone: ICONE_DO_CONCEITO.publicar,
          onClick: h.publicar,
          desabilitado: !acao.liberado,
          motivo: acao.motivo,
        },
      };
    case 'no-ar':
      return {
        primario: {
          texto: 'Tudo no ar',
          icone: 'circle-check',
          desabilitado: true,
          motivo: 'Nada a publicar nesta live: tudo no ar ou rejeitado.',
        },
      };
  }
}

/** O pedido de confirmação do lote (decisão do Paulo: "com confirmação"). */
export function pedidoAprovarPropostos(quantos: number) {
  return {
    titulo: quantos === 1 ? 'Aprovar o proposto' : `Aprovar os ${quantos} propostos`,
    descricao:
      'Os cortes propostos pela análise viram aprovados e seguem para a pós-produção. ' +
      'Dá para devolver depois, corte a corte ou em lote.',
    confirmLabel: `Aprovar ${quantos}`,
  };
}

/**
 * O chip de estado da barra superior: o lote pronto ou o que falta. "Nada a
 * publicar" não é alarme — é a live fechada; pintar de amarelo fazia o
 * estado terminal parecer pendência. (Saiu do hook na D-870.)
 */
export function chipDaProntidao(p: { total: number; liberado: boolean; resumo: string }): ChromeEstado {
  if (p.total === 0)
    return { texto: 'nada a publicar', icone: 'circle-check', cor: 'var(--mute)', bg: 'var(--inset)' };
  if (p.liberado)
    return { texto: 'lote pronto', icone: 'circle-check', cor: 'var(--ok)', bg: 'var(--ok-soft)' };
  return { texto: p.resumo, icone: 'triangle-alert', cor: 'var(--warn)', bg: 'var(--warn-soft)' };
}
