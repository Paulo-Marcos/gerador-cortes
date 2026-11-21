// D-1168 (E-069 H-20; DIRECAO §7.6) · Uma linha por Fire: chama · capa 9:16 · título e live ·
// duração e bruto em mono · UM selo · contagem de shorts · "Abrir workspace" · ⋯.
//
// A linha nunca tem botão primário: a tela é de escolha. A ação de texto é uma só; o resto
// (editar a curadoria, finalizar, gerar) mora no ⋯. O título é o link da Curadoria — ele fica
// fora do ⋯ e do "Abrir workspace" porque um <a> dentro de outro não é HTML válido.
import { Link, useNavigate } from 'react-router-dom';
import { LinkDeAcao } from '@/components/ui/link-de-acao';
import { LinhaDaLista } from '@/components/ui/lista';
import { Miniatura } from '@/components/ui/miniatura';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { Selo } from '@/components/ui/selo';
import { formatarDuracao } from '@/lib/utils';
import { Icon } from '@/upgrade/Icon';
import { dicaDoWorkspace, itensDoMenuDoFire } from './acoesDoFire';
import { ContagemChips } from './ContagemChips';
import { RedesDoFire } from './RedesDoFire';
import { seloDoFire } from './seloDoFire';
import { semDeOndeRecortar, useGerarShortsDoFire } from './GerarComIa';
import type { FireComBruto } from './shortsApi';
import { useMarcarFinalizado } from './useShortsDoCorte';

/** As colunas da lista, na ordem da linha. Uma só definição: o cabeçalho e a linha alinham. */
export const COLUNAS_DOS_FIRES = '20px 40px minmax(0,1fr) 124px 124px 112px 140px 32px';

export function LinhaDoFire({ fire, liveRodando }: { fire: FireComBruto; liveRodando: boolean }) {
  const navegar = useNavigate();
  const marcar = useMarcarFinalizado();
  const { gerar, aviso } = useGerarShortsDoFire(fire);
  const selo = seloDoFire(fire);
  const finalizado = Boolean(fire.finalizado_em);

  const itens = itensDoMenuDoFire(fire, {
    editar: () => navegar(`/shorts/${fire.corte_id}`),
    alternarFinalizado: () => marcar.mutate({ corteId: fire.corte_id, finalizado: !finalizado }),
    gerar: () => gerar.mutate(),
    liveRodando,
    marcando: marcar.isPending,
    gerando: gerar.isPending,
  });

  return (
    <LinhaDaLista data-fire={fire.corte_id}>
      <span aria-hidden className="grid place-items-center text-fire">
        {fire.is_fire ? <Icon name="flame" size={16} /> : null}
      </span>
      <Miniatura proporcao="9/16" className="w-10" />
      <div className="min-w-0">
        <Link
          to={`/shorts/${fire.corte_id}`}
          title={fire.titulo}
          className="block truncate rounded-etiqueta text-linha text-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
        >
          {fire.titulo || `Corte ${fire.numero}`}
        </Link>
        <p className="truncate text-pequeno text-fg-3">
          {fire.projeto_titulo || 'live sem título'}
          {fire.tema_central ? ` · ${fire.tema_central}` : ''}
          {!fire.is_fire && fire.indicado ? ' · indicado' : ''}
        </p>
        {fire.shorts.total > 0 ? <RedesDoFire fire={fire} /> : null}
        {semDeOndeRecortar(fire) && !finalizado ? (
          <p className="text-micro text-aviso">Sem bruto e com a live limpa: use “Baixar a live e gerar” na faixa da live.</p>
        ) : null}
        {aviso ? <p className="text-micro text-fg-3">{aviso}</p> : null}
      </div>
      <p className="num m-0 flex flex-col text-fg-2">
        <span>{formatarDuracao(fire.duracao_seg)}</span>
        {/* D-502: sem bruto o corte aparece assim mesmo; dizer "0 MB" seria fingir um arquivo. */}
        <span className={fire.tem_bruto ? 'text-fg-3' : 'text-aviso'}>{fire.tem_bruto ? `${fire.bruto_mb} MB de bruto` : 'sem bruto'}</span>
      </p>
      <div>
        <Selo tom={selo.tom} dica={selo.dica}>
          {selo.rotulo}
        </Selo>
      </div>
      <ContagemChips shorts={fire.shorts} />
      <LinkDeAcao asChild>
        <Link to={`/shorts/${fire.corte_id}/workspace`} title={dicaDoWorkspace(fire)}>
          Abrir workspace
        </Link>
      </LinkDeAcao>
      <OverflowMenu items={itens} label={`Mais ações do corte ${fire.titulo || fire.numero}`} grande />
    </LinhaDaLista>
  );
}
