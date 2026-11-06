import { useQuery } from '@tanstack/react-query';
import { conferenciaDaOrigemKey } from '@/shared/chavesDeCache';
import type { CenaRemotion, Corte } from '@/types/models';
import { Icon } from '@/upgrade/Icon';
import { cenasApi } from './api/cenas';
import { avisosDoQueVaiAoVideo } from './fase2/planoDasCenas';
import { useStatusBruto } from './useBruto';
import { useCorte } from './useCortes';

// D-1044: o que ficou aberto viaja com o corte. Cada pendência morava numa tela só
// (o Conferir no editor, os avisos na aba Cenas), e 7 de 48 cortes renderizaram sem
// validar as cenas. A barra das três telas mostra a lista e não bloqueia nada: quem
// decide é o operador (RN-35).

export type RetratoDasPendencias = {
  brutoDefasado: boolean;
  alertasAbertos: number;
  avisosDeCena: number;
  totalDeCenas: number;
  cenasValidadas: boolean;
};

const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function listarPendencias(r: RetratoDasPendencias): string[] {
  return [
    ...(r.brutoDefasado ? ['os trechos mudaram depois do bruto'] : []),
    ...(r.alertasAbertos > 0 ? [contar(r.alertasAbertos, 'conferir', 'conferir')] : []),
    ...(r.avisosDeCena > 0 ? [contar(r.avisosDeCena, 'aviso de cena', 'avisos de cena')] : []),
    ...(r.totalDeCenas > 0 && !r.cenasValidadas ? ['cenas por validar'] : []),
  ];
}

export function retratoDoCorte(
  corte: Pick<Corte, 'alertas_conferir' | 'cenas_remotion' | 'cenas_validadas'>,
  extras: { brutoDefasado: boolean; avisosDeCena: number },
): RetratoDasPendencias {
  const cenas = corte.cenas_remotion;
  return {
    ...extras,
    alertasAbertos: (corte.alertas_conferir ?? []).filter((a) => !a.conferido).length,
    totalDeCenas: Array.isArray(cenas) ? cenas.length : (cenas?.cenas?.length ?? 0),
    cenasValidadas: Boolean(corte.cenas_validadas),
  };
}

/**
 * As cenas gravadas do corte, venham como lista ou no envelope com `cenas`. O contrato
 * HTTP tipa a cena por cima (`tipo` é texto livre); daqui só se lê tipo, início e riscada.
 */
function cenasDoCorte(corte: Pick<Corte, 'cenas_remotion'>): CenaRemotion[] {
  const cenas = corte.cenas_remotion;
  return (Array.isArray(cenas) ? cenas : (cenas?.cenas ?? [])) as unknown as CenaRemotion[];
}

// D-1070: o aviso de uma cena riscada não conta; ela não vai ao vídeo.
export function PendenciasDoCorte({ corte }: { corte: Corte }) {
  const { dataUpdatedAt } = useCorte(corte.id);
  const statusBruto = useStatusBruto(corte.id);
  const conferencia = useQuery({
    queryKey: conferenciaDaOrigemKey(corte.id, dataUpdatedAt),
    queryFn: () => cenasApi.conferirOrigem(corte.id),
  });
  if (corte.youtube_video_id) return null;
  const pendencias = listarPendencias(
    retratoDoCorte(corte, {
      brutoDefasado: Boolean(statusBruto.data?.bruto_defasado),
      avisosDeCena: avisosDoQueVaiAoVideo(conferencia.data?.avisos ?? [], cenasDoCorte(corte)).length,
    }),
  );
  if (pendencias.length === 0) return null;
  const texto = pendencias.join(', ');
  return (
    <span
      title={`Em aberto, sem bloquear: ${texto}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontSize: 12,
        color: 'var(--warn)',
      }}
    >
      <Icon name="triangle-alert" />
      {texto}
    </span>
  );
}
