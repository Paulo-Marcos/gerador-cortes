import type { Projeto } from '@/types/models';
import { estaProntoPraYoutube } from '@/features/projetos/useProjetos';

// ─────────────────────────────────────────────────────────────
// Pipeline do projeto em 6 etapas — a fita de ícones do card da Biblioteca
// (`ProjetoCardAp`), que pinta cada etapa pelo `TOM_DA_ETAPA` do SeloDeEstado.
//
// A etapa "Pós" existe porque o pipeline real tem render final entre o
// Bruto e os Metadados.
// ─────────────────────────────────────────────────────────────

type EstadoEtapa = 'feito' | 'em-curso' | 'pendente';

interface Etapa {
  label: string;
  hint: string;
  estado: EstadoEtapa;
}

/** Marca `feito` quando `feitos` cobre `alvo` (com alvo > 0); `em-curso` quando começou. */
function porContagem(feitos: number, alvo: number): EstadoEtapa {
  if (alvo > 0 && feitos >= alvo) return 'feito';
  if (feitos > 0) return 'em-curso';
  return 'pendente';
}

/**
 * Torna a tira monotônica: nenhuma etapa aparece "pendente" à esquerda de
 * uma etapa que já andou. Sem isto, a limpeza de mídia pesada (que apaga
 * artefatos intermediários) produzia leituras contraditórias — "Publicação
 * em curso" com "Bruto pendente" antes dela.
 */
function normalizarMonotonico(etapas: Etapa[]): Etapa[] {
  const ultimoAtivo = etapas.reduce(
    (ultimo, etapa, i) => (etapa.estado === 'pendente' ? ultimo : i),
    -1,
  );
  return etapas.map((etapa, i) =>
    i < ultimoAtivo && etapa.estado === 'pendente' ? { ...etapa, estado: 'feito' } : etapa,
  );
}

export function construirEtapas(projeto: Projeto): Etapa[] {
  const baixado = ['transcrevendo', 'pronto', 'analisando', 'analisado'].includes(projeto.status);
  const analisado = projeto.status === 'analisado' && projeto.total_cortes > 0;
  const alvo = projeto.total_aprovados;

  return normalizarMonotonico([
    {
      label: 'Baixado',
      hint: 'Vídeo da live baixado e preparado',
      estado: baixado ? 'feito' : projeto.status === 'baixando' ? 'em-curso' : 'pendente',
    },
    {
      label: 'Analisado',
      hint: 'IA propôs os cortes a partir da transcrição',
      estado: analisado
        ? 'feito'
        : projeto.status === 'analisando' ||
            (projeto.status === 'pronto' && projeto.total_cortes === 0)
          ? 'em-curso'
          : 'pendente',
    },
    {
      label: 'Bruto',
      hint: 'Cortes avaliados e aprovados no editor Bruto',
      // Sinal editorial (aprovados), não o arquivo `total_com_raw`: o raw é
      // apagado pela limpeza de mídia pesada, e um projeto já publicado
      // voltava a exibir "Bruto pendente".
      estado: porContagem(projeto.total_aprovados, projeto.total_cortes),
    },
    {
      label: 'Pós',
      hint: 'Render final (cenas, grade e overlays) concluído',
      estado: porContagem(projeto.total_video_pronto, alvo),
    },
    {
      label: 'Metadados',
      hint: 'Títulos, descrições e capas prontos',
      estado: porContagem(projeto.total_com_meta, alvo),
    },
    {
      label: 'Publicação',
      hint: 'Cortes publicados no YouTube',
      estado: estaProntoPraYoutube(projeto)
        ? 'feito'
        : projeto.total_publicados > 0
          ? 'em-curso'
          : 'pendente',
    },
  ]);
}
