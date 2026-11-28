import type { MouseEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { CorteDoMapa } from '@/components/ui/mapa-da-live';
import { ReguaDeDias, type DiaDaRegua } from '@/components/ui/regua-de-dias';
import { CartaoContinue } from '@/features/projetos/CartaoContinue';
import { ProjetoCardAp } from '@/features/projetos/ProjetoCardAp';
import { proximoPasso } from '@/features/projetos/proximoPasso';
import { tituloDaRegua } from '@/features/projetos/regrasDaBiblioteca';
import type { Projeto } from '@/types/models';

// D-1148 (E-069 H-15; DIRECAO §7.1) · A Biblioteca com lives, de cima para baixo: o
// "Continue" (a primária), "As últimas 8 lives" e, lado a lado, "Esperando você"
// (cartões deitados) e "No ar há pouco" (em pé). "Ver as N lives" abre a lista inteira.
// A saudação é o cabeçalho da casca (`ScreenHeader`), dono do único feixe do h1.

export type SalaDaBibliotecaProps = {
  total: number;
  destaque?: Projeto;
  cortesDoDestaque: CorteDoMapa[];
  destino?: string;
  dias: DiaDaRegua[];
  esperando: Projeto[];
  noAr: Projeto[];
  ir: (to: string) => void;
  onVerTodas: () => void;
};

function Secao({ titulo, vazio, children }: { titulo: string; vazio?: string; children?: ReactNode }) {
  return (
    <section aria-label={titulo} className="flex min-w-0 flex-col gap-3">
      <h2 className="text-secao text-fg">{titulo}</h2>
      {vazio ? <p className="text-corpo text-fg-3">{vazio}</p> : children}
    </section>
  );
}

/** A régua usa `<a href>`; aqui o clique vira navegação da SPA (sem recarregar a página). */
function navegarPeloLink(ir: (to: string) => void) {
  return (e: MouseEvent<HTMLOListElement>) => {
    const link = (e.target as HTMLElement).closest('a');
    const href = link?.getAttribute('href');
    if (!href || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    ir(href);
  };
}

export function SalaDaBiblioteca({
  total,
  destaque,
  cortesDoDestaque,
  destino,
  dias,
  esperando,
  noAr,
  ir,
  onVerTodas,
}: SalaDaBibliotecaProps) {
  return (
    <div className="flex flex-col gap-8">
      {destaque && (
        <CartaoContinue
          projeto={destaque}
          passo={proximoPasso(destaque)}
          cortes={cortesDoDestaque}
          destino={destino}
          ir={ir}
        />
      )}

      <Secao titulo={tituloDaRegua(dias.length)} vazio={dias.length === 0 ? 'Nenhuma live com data ainda.' : undefined}>
        <div className="overflow-x-auto pb-1">
          <ReguaDeDias dias={dias} onClick={navegarPeloLink(ir)} className="min-w-[760px]" />
        </div>
      </Secao>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Secao titulo="Esperando você" vazio={esperando.length === 0 ? 'Nenhuma outra live espera você.' : undefined}>
          <div className="flex flex-col gap-3">
            {esperando.map((p) => (
              <ProjetoCardAp key={p.id} projeto={p} deitado />
            ))}
          </div>
        </Secao>
        <Secao titulo="No ar há pouco" vazio={noAr.length === 0 ? 'Nenhuma live inteira no ar ainda.' : undefined}>
          <div className="grid gap-3 sm:grid-cols-2">
            {noAr.map((p) => (
              <ProjetoCardAp key={p.id} projeto={p} />
            ))}
          </div>
        </Secao>
      </div>

      <div>
        <Button variant="secundario" onClick={onVerTodas}>
          Ver as {total} lives
        </Button>
      </div>
    </div>
  );
}
