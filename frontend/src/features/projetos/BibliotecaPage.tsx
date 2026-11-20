import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { EstadoCarregando } from '@/components/ui/estado-vazio';
import { useToast } from '@/components/ui/toaster';
import { useCanais } from '@/features/channels/useChannels';
import { CanalNovo } from '@/features/projetos/CanalNovo';
import { ListaCompleta } from '@/features/projetos/ListaCompleta';
import { NovoProjetoForm } from '@/features/projetos/NovoProjetoForm';
import { liveDoDestaque } from '@/features/projetos/proximoPasso';
import {
  cabecalhoDaBiblioteca,
  cortesDoMapa,
  diasDaRegua,
  esperandoVoce,
  motivoDoErro,
  noArHaPouco,
} from '@/features/projetos/regrasDaBiblioteca';
import { SalaDaBiblioteca, type SalaDaBibliotecaProps } from '@/features/projetos/SalaDaBiblioteca';
import { useCortesDoDestaque, useNomeDoOperador } from '@/features/projetos/useSalaDaBiblioteca';
import { temFalhados, useProjetos, useReiniciarFalhados } from '@/features/projetos/useProjetos';
import type { Projeto } from '@/types/models';
import type { ScreenAction } from '@/upgrade/ScreenHeader';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { useHistoricoDaCasca } from '@/upgrade/historicoDaCasca';

// ─────────────────────────────────────────────────────────────────
// D-599 · A Biblioteca, primeira tela da casca. D-1148 (E-069 H-15; DIRECAO §7.1 e
// §7.12): a sala de entrada. O cabeçalho é a saudação (o `h1` do `ScreenHeader`, com
// o primeiro nome do operador no feixe) e a frase do estado da casa. Abaixo, um dos
// quatro estados: carregando, erro, vazio (o canal novo) ou cheio (a sala, ou a lista
// inteira com `?ver=todas`, que o "voltar" do navegador desfaz).
//
// Esta função só junta dados e escolhe o estado; o que se vê está em
// `ConteudoDaBiblioteca`, que os testes renderizam sem rede.
// ─────────────────────────────────────────────────────────────────

export type EstadoDaBiblioteca =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; motivo: string; tentar: () => void }
  | { tipo: 'vazio'; destino?: string; onBuscarLives: () => void; onLigarCanal: () => void }
  | { tipo: 'cheio'; sala: SalaDaBibliotecaProps; verTodas: boolean; projetos: Projeto[]; onVoltar: () => void };

/** O que a tela mostra em cada um dos quatro estados (DIRECAO §3.4). */
export function ConteudoDaBiblioteca({ estado }: { estado: EstadoDaBiblioteca }) {
  switch (estado.tipo) {
    case 'carregando':
      return <EstadoCarregando frase="Buscando as lives…" linhas={3} />;
    case 'erro':
      return <EstadoDeErro titulo="Não deu para carregar as lives" motivo={estado.motivo} aoTentar={estado.tentar} />;
    case 'vazio':
      return <CanalNovo destino={estado.destino} onBuscarLives={estado.onBuscarLives} onLigarCanal={estado.onLigarCanal} />;
    default:
      return estado.verTodas ? (
        <ListaCompleta projetos={estado.projetos} onVoltar={estado.onVoltar} />
      ) : (
        <SalaDaBiblioteca {...estado.sala} />
      );
  }
}

function useReiniciarFalhadosComAviso() {
  const reiniciar = useReiniciarFalhados();
  const { notify } = useToast();
  return () =>
    reiniciar.mutate(undefined, {
      onSuccess: (r) =>
        notify(
          r.total === 0 ? 'Nenhum projeto com falha de download para reiniciar.' : `${r.total} download(s) reiniciado(s).`,
          { tone: r.total === 0 ? 'info' : 'success' },
        ),
      onError: (err) => notify(err instanceof Error ? err.message : 'Erro ao reiniciar downloads.', { tone: 'error' }),
    });
}

/** O canal ativo: o "@" para onde os cortes vão, quando ele está ligado ao YouTube. */
function useDestino(): string | undefined {
  const { data } = useCanais();
  const ativo = data?.canais.find((c) => c.id === data.ativo) ?? data?.canais.find((c) => c.ativo);
  return ativo?.youtube_channel_id && ativo.handle ? ativo.handle : undefined;
}

export default function BibliotecaPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [formAberto, setFormAberto] = useState(false);
  const { data, isLoading, isError, error, refetch } = useProjetos();
  const nome = useNomeDoOperador();
  const destino = useDestino();
  const { lugares } = useHistoricoDaCasca();
  const reiniciarFalhados = useReiniciarFalhadosComAviso();

  const projetos = useMemo(() => data ?? [], [data]);
  const destaque = useMemo(() => liveDoDestaque(projetos, lugares), [projetos, lugares]);
  const { data: cortes } = useCortesDoDestaque(destaque?.id);
  const cabecalho = cabecalhoDaBiblioteca(new Date(), nome, data);
  const vazia = !isLoading && !isError && projetos.length === 0;

  const acoes: ScreenAction[] = [
    ...(temFalhados(projetos) ? [{ icone: 'rotate-ccw' as const, texto: 'Reiniciar falhados', onClick: reiniciarFalhados }] : []),
    // "Nova live" é secundária (§7.1): a primária é o próximo passo do "Continue".
    ...(vazia ? [] : [{ icone: 'plus' as const, texto: 'Nova live', onClick: () => setFormAberto((a) => !a) }]),
  ];
  useDefinirChrome({ titulo: cabecalho.titulo, sub: cabecalho.sub, acoes }, [
    cabecalho.titulo,
    cabecalho.sub,
    acoes.length,
    vazia,
  ]);

  const estado: EstadoDaBiblioteca = isLoading
    ? { tipo: 'carregando' }
    : isError
      ? { tipo: 'erro', motivo: motivoDoErro(error), tentar: () => void refetch() }
      : vazia
        ? { tipo: 'vazio', destino, onBuscarLives: () => navigate('/buscar-lives'), onLigarCanal: () => navigate('/canais') }
        : {
            tipo: 'cheio',
            projetos,
            verTodas: params.get('ver') === 'todas',
            onVoltar: () => setParams({}),
            sala: {
              total: projetos.length,
              destaque,
              cortesDoDestaque: destaque && cortes ? cortesDoMapa(cortes, destaque.id) : [],
              destino,
              dias: diasDaRegua(projetos, new Date()),
              esperando: esperandoVoce(projetos, destaque?.id),
              noAr: noArHaPouco(projetos),
              ir: navigate,
              onVerTodas: () => setParams({ ver: 'todas' }),
            },
          };

  return (
    <div className="flex flex-col gap-6">
      {formAberto && !vazia && (
        <Card variante="vidro" className="p-4">
          <NovoProjetoForm onClose={() => setFormAberto(false)} />
        </Card>
      )}
      <ConteudoDaBiblioteca estado={estado} />
    </div>
  );
}
