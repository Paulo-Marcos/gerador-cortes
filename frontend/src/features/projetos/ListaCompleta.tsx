import { useEffect, useMemo, useRef, useState } from 'react';
import { Busca } from '@/components/ui/busca';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EstadoVazio } from '@/components/ui/estado-vazio';
import { Select } from '@/components/ui/select';
import {
  contarPorFiltro,
  filtrarProjetos,
  FILTERS,
  lerPreferenciaDaBiblioteca,
  PREFERENCIA_BIBLIOTECA_KEY,
  SORTS,
  type FilterKey,
  type SortKey,
} from '@/features/projetos/bibliotecaFiltros';
import { ProjetoCardAp } from '@/features/projetos/ProjetoCardAp';
import type { Projeto } from '@/types/models';

// D-1148 (E-069 H-15; DIRECAO §7.1) · "Ver as N lives": a lista inteira, com os chips de
// filtro e a grade. As regras de filtro e a memória do filtro e da ordem (D-610) são as
// de `bibliotecaFiltros`, as mesmas de antes; muda a roupa (Chip, Busca, Select da sala).

function lerPreferenciaSalva() {
  try {
    return lerPreferenciaDaBiblioteca(window.localStorage.getItem(PREFERENCIA_BIBLIOTECA_KEY));
  } catch {
    return lerPreferenciaDaBiblioteca(null);
  }
}

const OPCOES_DE_ORDEM = SORTS.map((s) => ({ valor: s.key, rotulo: s.label }));

export function ListaCompleta({ projetos, onVoltar }: { projetos: Projeto[]; onVoltar: () => void }) {
  const [preferencia] = useState(lerPreferenciaSalva);
  const [filtro, setFiltro] = useState<FilterKey>(preferencia.filtro);
  const [ordem, setOrdem] = useState<SortKey>(preferencia.ordem);
  const [busca, setBusca] = useState('');
  const topo = useRef<HTMLElement>(null);

  // Abrir a lista desde o pé da sala deixava a rolagem lá embaixo, no meio da grade.
  useEffect(() => {
    topo.current?.scrollIntoView({ block: 'start' });
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFERENCIA_BIBLIOTECA_KEY, JSON.stringify({ filtro, ordem }));
    } catch {
      // sem localStorage a Biblioteca só não lembra — nada quebra
    }
  }, [filtro, ordem]);

  const visiveis = useMemo(() => filtrarProjetos(projetos, { filtro, busca, ordem }), [projetos, filtro, busca, ordem]);
  const contagens = useMemo(() => contarPorFiltro(projetos), [projetos]);

  return (
    <section ref={topo} aria-label="Todas as lives" className="flex scroll-mt-6 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="fantasma" size="md" onClick={onVoltar}>
          Voltar à sala
        </Button>
        <h2 className="text-secao text-fg">Todas as lives</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full max-w-[280px]">
          <Busca value={busca} aoMudar={setBusca} placeholder="Buscar pelo título da live" aria-label="Buscar pelo título da live" />
        </div>
        {FILTERS.map((f) => (
          <Chip key={f.key} pressionado={f.key === filtro} contagem={contagens[f.key]} onClick={() => setFiltro(f.key)}>
            {f.label}
          </Chip>
        ))}
        <div className="ml-auto w-[190px]">
          <Select
            aria-label="Ordenar as lives"
            opcoes={OPCOES_DE_ORDEM}
            value={ordem}
            onValueChange={(v) => setOrdem(v as SortKey)}
          />
        </div>
      </div>
      {visiveis.length === 0 ? (
        <EstadoVazio
          icone="search"
          titulo="Nenhuma live neste filtro"
          descricao="Troque o filtro ou apague a busca para ver as outras."
        />
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {visiveis.map((p) => (
            <ProjetoCardAp key={p.id} projeto={p} />
          ))}
        </div>
      )}
    </section>
  );
}
