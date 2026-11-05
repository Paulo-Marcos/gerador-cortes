import { ErroDaApi } from '@/shared/api';
import type { Corte } from '@/types/models';

export type WaveformWindow = {
  corteId: string;
  startSec: number;
  endSec: number;
  version: string;
  // D-451: o respiro com que ESTA janela foi montada. Guardado junto porque a
  // janela e memoizada entre renders: sem isso, um ajuste que chega da API
  // depois do primeiro render nunca seria aplicado, e o `startSec` congelado
  // deslocaria a onda em relacao ao video pela diferenca entre os dois valores.
  preloadBeforeSec: number;
  preloadAfterSec: number;
};

type ResolveWaveformWindowParams = {
  current: WaveformWindow | null;
  corteId: string;
  inicioSeg: number;
  fimSeg: number;
  refreshKey: number;
  preloadBeforeSec: number;
  preloadAfterSec: number;
};

export function mergeDirtyPatch(current: Partial<Corte>, patch: Partial<Corte>): Partial<Corte> {
  return { ...current, ...patch };
}

export function applyDesvioChange(
  persistedDesvios: Corte['desvios'],
  currentDirty: Partial<Corte>,
  idx: number,
  novoInicio: string,
  novoFim: string,
): Partial<Corte> | null {
  const baseDesvios = currentDirty.desvios ?? persistedDesvios;
  const nextDesvios = [...baseDesvios];
  if (!nextDesvios[idx]) return null;

  const anterior = nextDesvios[idx];
  nextDesvios[idx] = {
    ...anterior,
    inicio_hms: novoInicio,
    fim_hms: novoFim,
    // D-1017: a borda ajustada deixa de ser a que a IA citou, e a tela mostraria a fala antiga.
    ...(novoInicio !== anterior.inicio_hms ? { inicio_texto: undefined } : {}),
    ...(novoFim !== anterior.fim_hms ? { fim_texto: undefined } : {}),
  };

  return mergeDirtyPatch(currentDirty, { desvios: nextDesvios });
}

export function resolveWaveformWindow({
  current,
  corteId,
  inicioSeg,
  fimSeg,
  refreshKey,
  preloadBeforeSec,
  preloadAfterSec,
}: ResolveWaveformWindowParams): WaveformWindow {
  const forceRefresh = refreshKey > 0;
  const mesmoContexto =
    current?.preloadBeforeSec === preloadBeforeSec &&
    current?.preloadAfterSec === preloadAfterSec;
  const currentContainsCut =
    current?.corteId === corteId &&
    inicioSeg >= current.startSec &&
    fimSeg <= current.endSec &&
    mesmoContexto &&
    !forceRefresh;

  if (currentContainsCut) return current;

  const startSec = Math.max(0, inicioSeg - preloadBeforeSec);
  const endSec = fimSeg + preloadAfterSec;

  return {
    corteId,
    startSec,
    endSec,
    version: `${startSec}_${endSec}_${refreshKey}`,
    preloadBeforeSec,
    preloadAfterSec,
  };
}

/**
 * D-1033: a tela viu este trabalho rodar desde que abriu? Só então o fim dele é
 * o gesto que ela acompanhava e vale o salto para a etapa seguinte. O status no
 * cache é de quando o corte esteve aberto da última vez: voltar com J a um corte
 * que terminou longe dali leria "rodando → pronto" e trocaria de tela.
 */
export function viuRodarNestaVisita(
  jaViu: boolean,
  rodando: boolean,
  lidoEm: number,
  visitaDesde: number,
): boolean {
  return jaViu || (rodando && lidoEm >= visitaDesde);
}

/**
 * D-883: o que fazer quando salvar os ajustes na saída do corte falha. 404 é o
 * corte que não existe mais (excluído aqui ou em outra tela): não há onde
 * salvar, e segurar o editor numa tela sem corte não protege nada — descarta o
 * ajuste e sai. Qualquer outra falha pode passar: fica, para ele não se perder.
 */
export function desfechoDaFalhaAoSalvar(erro: unknown): {
  sair: boolean;
  mensagem: string;
  tom: 'info' | 'error';
} {
  if (erro instanceof ErroDaApi && erro.status === 404) {
    return { sair: true, mensagem: 'Este corte não existe mais; os ajustes dele foram descartados.', tom: 'info' };
  }
  const motivo = erro instanceof Error ? erro.message : 'erro';
  return {
    sair: false,
    mensagem: `Não consegui salvar os ajustes (${motivo}). Fiquei no corte — tente Ctrl+S.`,
    tom: 'error',
  };
}

/**
 * D-1044: sem a live no disco, o backend só diz que o arquivo não foi encontrado. O
 * operador precisa saber o que fazer: a limpeza apaga a live, e a Biblioteca baixa de novo.
 */
export function mensagemDaFalhaDoBruto(motivo: string): string {
  return motivo.includes('vídeo original')
    ? 'A live não está mais no disco: baixe de novo na Biblioteca para gerar o bruto.'
    : `Geração de bruto falhou: ${motivo}`;
}

/**
 * D-1041: o bruto sai do que está gravado no banco. Gerar com um ajuste ainda não
 * salvo cortava o trecho antigo em silêncio, agora no gesto mais provável, o botão
 * principal. Salva primeiro; se salvar falhar, avisa e não gera.
 */
export function salvarAntesDe(
  historico: { getPresent: () => Partial<Corte>; reset: (valor: Partial<Corte>) => void },
  atualizar: {
    mutate: (
      patch: Partial<Corte>,
      opcoes: { onSuccess: () => void; onError: (erro: unknown) => void },
    ) => void;
  },
  avisar: (mensagem: string, opcoes: { tone: 'error' }) => void,
  depois: () => void,
) {
  const pendentes = historico.getPresent();
  if (Object.keys(pendentes).length === 0) {
    depois();
    return;
  }
  atualizar.mutate(
    { ...pendentes },
    {
      onSuccess: () => {
        historico.reset({});
        depois();
      },
      onError: (erro) => {
        const motivo = erro instanceof Error ? erro.message : 'erro';
        avisar(`Não consegui salvar os ajustes (${motivo}), então o bruto não foi gerado.`, { tone: 'error' });
      },
    },
  );
}
