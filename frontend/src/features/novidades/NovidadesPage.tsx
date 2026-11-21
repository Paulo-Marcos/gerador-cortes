// D-922: o que entrou no app, versão a versão, em português.
//
// O operador abria o app sem saber o que tinha mudado — e o que não se sabe
// que existe não se usa nem se avalia. A fonte é o CHANGELOG (o mesmo que a
// release publica); a IA o reescreve para quem usa, com o "como usar", e a
// tradução fica guardada. O que entrou desde a última visita vem marcado.
import { useState } from 'react';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { Button } from '@/components/ui/button';
import { EstadoCarregando, EstadoVazio } from '@/components/ui/estado-vazio';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { Icon } from '@/components/ui/icon';
import { Selo } from '@/components/ui/selo';
import type { VersaoDasNovidades } from './api';
import { CartaoDaNovidade } from './CartaoDaNovidade';
import { tituloDaVersao } from './rotulos';
import { useNovidades, useTraducaoAutomatica } from './useNovidades';

/** Abertas ao entrar: o que ainda não tem número e a última versão. */
const ABERTAS_DE_INICIO = 2;

function useVersoesAbertas(versoes: VersaoDasNovidades[]) {
  const [abertas, setAbertas] = useState<Set<string> | null>(null);
  const efetivas = abertas ?? new Set(versoes.slice(0, ABERTAS_DE_INICIO).map((v) => v.versao));
  const alternar = (versao: string) => {
    const proximas = new Set(efetivas);
    if (proximas.has(versao)) proximas.delete(versao);
    else proximas.add(versao);
    setAbertas(proximas);
  };
  return { abertas: efetivas, alternar };
}

type SecaoProps = {
  versao: VersaoDasNovidades;
  aberta: boolean;
  onAlternar: () => void;
  novas: Set<string>;
  traduzindo: boolean;
};

function SecaoDaVersao({ versao, aberta, onAlternar, novas, traduzindo }: SecaoProps) {
  const quantasNovas = versao.novidades.filter((n) => novas.has(n.chave)).length;
  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberta}
        className="flex items-center gap-2 text-left text-fg"
      >
        <Icon name={aberta ? 'chevron-down' : 'chevron-right'} />
        <h2 className="text-linha font-semibold">{tituloDaVersao(versao.versao, versao.data)}</h2>
        <span className="text-pequeno text-fg-3">
          {versao.novidades.length} {versao.novidades.length === 1 ? 'mudança' : 'mudanças'}
        </span>
        {quantasNovas > 0 && (
          <Selo tom="convite">
            {quantasNovas} {quantasNovas === 1 ? 'nova' : 'novas'}
          </Selo>
        )}
      </button>
      {aberta && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr))]">
          {versao.novidades.map((n) => (
            <CartaoDaNovidade
              key={n.chave}
              novidade={n}
              nova={novas.has(n.chave)}
              traduzindo={traduzindo}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function NovidadesPage() {
  const { lista, novasDaVisita } = useNovidades();
  const versoes = lista.data ?? [];
  const { abertas, alternar } = useVersoesAbertas(versoes);
  const { traduzindo, erro, tentarDeNovo } = useTraducaoAutomatica(versoes, abertas);

  useDefinirChrome(
    {
      sub:
        novasDaVisita.size > 0
          ? `${novasDaVisita.size} desde a sua última visita`
          : 'nada novo desde a sua última visita',
    },
    [novasDaVisita.size],
  );

  if (lista.isError) {
    return (
      <EstadoDeErro
        titulo="Não deu para ler o CHANGELOG"
        motivo="O arquivo de novidades não abriu. Confira se o app está de pé."
        aoTentar={() => void lista.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 text-fg">
      {erro && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-bloco border border-[color-mix(in_srgb,var(--cc-erro)_22%,transparent)] bg-[color-mix(in_srgb,var(--cc-erro)_7%,transparent)] px-3 py-2 text-pequeno text-erro"
        >
          <Icon name="triangle-alert" />
          <span>A IA não traduziu: {erro}. O texto segue em inglês.</span>
          <Button variant="fantasma" size="pq" onClick={tentarDeNovo}>
            Tentar de novo
          </Button>
        </div>
      )}
      {lista.isPending && <EstadoCarregando frase="Carregando as novidades…" linhas={2} />}
      {!lista.isPending && versoes.length === 0 && (
        <EstadoVazio icone="inbox" titulo="O CHANGELOG está vazio" />
      )}
      {versoes.map((v) => (
        <SecaoDaVersao
          key={v.versao}
          versao={v}
          aberta={abertas.has(v.versao)}
          onAlternar={() => alternar(v.versao)}
          novas={novasDaVisita}
          traduzindo={traduzindo === v.versao}
        />
      ))}
    </div>
  );
}
