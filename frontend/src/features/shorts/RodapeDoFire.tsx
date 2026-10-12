// D-581/D-593: o rodapé do cartão do Fire — Editar, Workspace e Finalizar.
//
// Saiu do `ShortsPage.tsx` na D-905, quando o cartão ganhou as redes e o
// componente bateu no teto da catraca de tamanho de função. Fica FORA do
// `Link` do corpo: um <a> dentro de outro <a> não é HTML válido, e o clique
// de um engoliria o do outro.
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { estaFinalizado } from './filtrosDosFires';
import type { FireComBruto } from './shortsApi';
import { useMarcarFinalizado } from './useShortsDoCorte';

export function RodapeDoFire({ fire }: { fire: FireComBruto }) {
  const temPronto = fire.shorts.renderizado > 0;

  return (
    <>
      {/* D-581: as duas portas do corte, lado a lado.
          Editar e publicar são trabalhos diferentes — um pede o player e a
          régua, o outro pede a grade dos aprovados — e desde esta demanda são
          telas diferentes. Oferecer as duas aqui evita a escada de "entra na
          edição só para clicar em ir para o workspace". */}
      <footer className="flex items-center gap-1 border-t border-[var(--wb-border-soft)] px-2 py-1.5">
        <Link
          to={`/shorts/${fire.corte_id}`}
          className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-semibold text-[var(--wb-text-dim)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
        >
          <Icon name={ICONE_DO_CONCEITO.editar} />
          Editar
        </Link>
        <Link
          to={`/shorts/${fire.corte_id}/workspace`}
          className={cn(
            'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-semibold transition-colors hover:bg-[var(--wb-bg-inset)]',
            // Sem nada pronto o workspace existe, mas está vazio. O peso menor
            // diz isso sem desabilitar: ver a prateleira vazia é informação.
            temPronto
              ? 'text-[var(--wb-accent)]'
              : 'text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
          )}
          title={
            temPronto
              ? 'Os shorts prontos deste corte, com publicação em massa'
              : 'Ainda não há short finalizado neste corte'
          }
        >
          <Icon name="layout-grid" />
          Workspace
        </Link>
        <AlternarFinalizado fire={fire} />
      </footer>
    </>
  );
}

/**
 * D-593: fecha o corte — os shorts já estão nas três redes — ou o devolve à fila.
 *
 * Sem confirmação de propósito: é reversível no mesmo lugar, a um clique, e o
 * corte continua a um chip de distância na aba "Finalizados".
 */
function AlternarFinalizado({ fire }: { fire: FireComBruto }) {
  const marcar = useMarcarFinalizado();
  const finalizado = estaFinalizado(fire);

  return (
    <button
      type="button"
      disabled={marcar.isPending}
      onClick={() => marcar.mutate({ corteId: fire.corte_id, finalizado: !finalizado })}
      className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-semibold text-[var(--wb-text-dim)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] disabled:opacity-60"
      title={
        finalizado
          ? 'Devolver este corte para a fila de trabalho'
          : 'Os shorts deste corte já subiram para YouTube, TikTok e Instagram — tirar da fila'
      }
    >
      {marcar.isPending ? (
        <Icon name="loader-2" className="animate-spin" />
      ) : finalizado ? (
        <Icon name="rotate-ccw" />
      ) : (
        <Icon name="check-check" />
      )}
      {finalizado ? 'Reabrir' : 'Finalizar'}
    </button>
  );
}
