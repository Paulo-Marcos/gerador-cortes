// D-458: a porta da fábrica de shorts.
//
// A tela lista os cortes Fire e os indicados a mão. Um Fire SEM bruto também
// aparece (D-502) — a fábrica sabe refazê-lo sem tocar na pós-produção —, e
// desde a D-528 ele traz a ação junto: refazer o bruto é minuto de FFmpeg sobre
// a live inteira, e ninguém quer pagar isso por ter clicado em outra coisa.
//
// O trabalho aqui é assíncrono por desenho — os candidatos nascem na geração do
// bruto (E-030) e a curadoria acontece quando o operador quiser.
//
// ## D-581: por que a lista ganhou filtro e busca
//
// Porque a pergunta mudou de escala. Com cinco Fires, "listar todos" É a
// resposta; com dezenas, o operador abre a tela procurando UM — aquele em que
// parou. O FILTRO responde "em que pé está" e a BUSCA responde "qual era mesmo";
// a regra dos dois vive em `filtrosDosFires.ts`, fora do JSX, porque é regra e
// não desenho.
//
// ## D-803: por que a lista é agrupada por live
//
// Porque os Fires de uma live dividem a matéria-prima. Com a live limpa, a
// pergunta útil é "quantos cortes desta live estão parados?" — e a resposta
// vira UM clique que baixa a live uma vez e atende todos (`agrupamentoPorLive.ts`).
//
// ## D-1168 (E-069 H-20; DIRECAO §7.6): a Sala escura
//
// Lista agrupada por live dentro de um painel; chips de filtro (o vazio fica desabilitado,
// com o zero à vista); uma linha por Fire. SEM primária: a tela é de escolha. O vidro do
// painel é chapado (`bg-vidro`): `backdrop-filter` é da casca (§3.6).
import { useMemo, useState } from 'react';
import { Busca } from '@/components/ui/busca';
import { Chip } from '@/components/ui/chip';
import { EstadoCarregando, EstadoVazio } from '@/components/ui/estado-vazio';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { mensagemErro } from '@/lib/mensagemErro';
import { Lista } from '@/components/ui/lista';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { agruparPorLive } from './agrupamentoPorLive';
import { FaixaDaLive } from './FaixaDaLive';
import { COLUNAS_DOS_FIRES, LinhaDoFire } from './LinhaDoFire';
import { contarPorFiltro, FILTROS, filtrarFires, type FiltroDeFire } from './filtrosDosFires';
import type { AndamentoDaLive, FireComBruto } from './shortsApi';
import { estaRodando, useAndamentoDasLives, useFires } from './useFires';

export { GerarComIa } from './GerarComIa';

export interface EstadoDosShorts {
  fires: FireComBruto[];
  andamento: AndamentoDaLive[];
  carregando: boolean;
  erro?: string;
  filtro: FiltroDeFire;
  busca: string;
}

export interface AcoesDosShorts {
  aoFiltrar: (filtro: FiltroDeFire) => void;
  aoBuscar: (busca: string) => void;
  aoLimpar: () => void;
  /** D-1204: refaz a consulta dos Fires quando ela falha. */
  aoTentar?: () => void;
}

function Filtros({ estado, aoFiltrar }: { estado: EstadoDosShorts; aoFiltrar: AcoesDosShorts['aoFiltrar'] }) {
  const contagens = contarPorFiltro(estado.fires);
  return (
    <div role="group" aria-label="Filtrar os cortes" className="flex flex-wrap items-center gap-2">
      {FILTROS.map(({ id, rotulo, nota }) => (
        <Chip
          key={id}
          pressionado={estado.filtro === id}
          contagem={contagens[id]}
          title={nota}
          disabled={contagens[id] === 0 && estado.filtro !== id}
          onClick={() => aoFiltrar(id)}
        >
          {rotulo}
        </Chip>
      ))}
    </div>
  );
}

function Grupos({ estado }: { estado: EstadoDosShorts }) {
  const visiveis = filtrarFires(estado.fires, estado.filtro, estado.busca);
  const grupos = agruparPorLive(visiveis, estado.fires);
  return (
    <div className="flex flex-col gap-4">
      {grupos.map((grupo) => {
        const daLive = estado.andamento.find((live) => live.projeto_id === grupo.projetoId);
        return (
          <section key={grupo.projetoId} aria-label={grupo.titulo || 'live sem título'} className="overflow-hidden rounded-painel border border-fio bg-vidro">
            <FaixaDaLive grupo={grupo} andamento={daLive} />
            {/* As colunas têm largura fixa: abaixo de ~860 px a lista rola de lado em vez de espremer o título. */}
            <div className="overflow-x-auto">
              <Lista colunas={COLUNAS_DOS_FIRES} className="min-w-[860px] p-2">
                {grupo.fires.map((fire) => (
                  <LinhaDoFire key={fire.corte_id} fire={fire} liveRodando={daLive ? estaRodando(daLive) : false} />
                ))}
              </Lista>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Os quatro estados da tela: carregando, erro, vazio (fábrica ou filtro) e com dados. */
function Corpo({ estado, acoes }: { estado: EstadoDosShorts; acoes: AcoesDosShorts }) {
  const { aoLimpar, aoTentar } = acoes;
  if (estado.carregando) return <EstadoCarregando frase="Procurando os Fires…" linhas={4} />;
  if (estado.erro !== undefined) {
    return <EstadoDeErro titulo="Não consegui carregar os Fires" motivo={estado.erro} aoTentar={aoTentar} />;
  }
  if (estado.fires.length === 0) {
    return (
      <EstadoVazio
        icone="flame"
        titulo="Nenhum corte na fábrica de shorts"
        descricao="Marque um corte com Fire, ou indique um para shorts na tela do corte: a IA propõe os trechos verticais no fim da esteira, e eles aparecem aqui para você trabalhar quando quiser."
      />
    );
  }
  // O vazio do FILTRO é outro: pede trocar de aba, não marcar um Fire (refaria trabalho já feito).
  if (filtrarFires(estado.fires, estado.filtro, estado.busca).length === 0) {
    return (
      <EstadoVazio
        icone="search"
        titulo="Nenhum corte com este recorte"
        descricao="Há Fires na fábrica, mas nenhum se encaixa no filtro e na busca de agora."
        acao="Ver todos de novo"
        aoAgir={aoLimpar}
      />
    );
  }
  return <Grupos estado={estado} />;
}

/** O conteúdo sem hooks de dados: é o que o teste de render e a rodada visual enxergam. */
export function ConteudoDosShorts({ estado, acoes }: { estado: EstadoDosShorts; acoes: AcoesDosShorts }) {
  const temFires = estado.fires.length > 0;
  return (
    <div className="flex flex-col gap-4">
      {temFires ? (
        <div className="flex flex-wrap items-center gap-3">
          <Filtros estado={estado} aoFiltrar={acoes.aoFiltrar} />
          <div className="ml-auto w-full max-w-[260px]">
            <Busca name="busca" value={estado.busca} aoMudar={acoes.aoBuscar} placeholder="Buscar por título, live ou tema" aria-label="Buscar cortes" />
          </div>
        </div>
      ) : null}
      <Corpo estado={estado} acoes={acoes} />
    </div>
  );
}

export default function ShortsPage() {
  const { data, isLoading, isError, error, refetch } = useFires();
  const { data: andamento } = useAndamentoDasLives();
  const [filtro, setFiltro] = useState<FiltroDeFire>('todos');
  const [busca, setBusca] = useState('');

  const fires = useMemo(() => data?.fires ?? [], [data]);
  const prontos = useMemo(() => contarPorFiltro(fires).prontos, [fires]);

  const sub = isError ? 'sem a lista de Fires' : `${fires.length} fire com bruto · ${prontos} com short pronto`;
  useDefinirChrome({ sub }, [sub]);

  const estado: EstadoDosShorts = {
    fires,
    andamento: andamento?.lives ?? [],
    carregando: isLoading,
    erro: isError ? mensagemErro(error, 'erro desconhecido') : undefined,
    filtro,
    busca,
  };
  const acoes: AcoesDosShorts = {
    aoTentar: () => void refetch(),
    aoFiltrar: setFiltro,
    aoBuscar: setBusca,
    aoLimpar: () => {
      setFiltro('todos');
      setBusca('');
    },
  };
  return <ConteudoDosShorts estado={estado} acoes={acoes} />;
}
