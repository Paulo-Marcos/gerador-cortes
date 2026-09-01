// D-468/469/470: para onde o short pronto vai.
//
// A tela trata os dois modos igual de propósito. Para o operador, "publicar no
// YouTube" e "preparar para o TikTok" são a mesma intenção — o que muda é onde
// o trabalho termina: num caso o vídeo já subiu, no outro abre uma pasta pronta
// para ele colar no celular. O rótulo do botão é o que conta essa diferença.
//
// Os avisos aparecem ANTES do botão. Descobrir que o vídeo passa do limite
// depois de subir é o erro que esta tela existe para evitar.
import { Send, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PacotePublicacao } from './shortsApi';
import { usePreviaPublicacao, usePublicarShort } from './useShortsDoCorte';

interface Props {
  shortId: string;
}

export function PainelPublicacao({ shortId }: Props) {
  const previa = usePreviaPublicacao(shortId);
  const publicar = usePublicarShort();

  if (previa.isLoading) {
    return <p className="p-3 text-[12px] text-[var(--wb-text-mute)]">Montando os pacotes…</p>;
  }
  if (previa.isError) {
    return (
      <p className="p-3 text-[12px] text-[var(--wb-text-dim)]">
        {(previa.error as Error)?.message ?? 'nao consegui montar os pacotes'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {(previa.data?.pacotes ?? []).map((pacote) => (
        <Destino
          key={pacote.plataforma}
          pacote={pacote}
          ocupado={publicar.isPending}
          onPublicar={() => publicar.mutate({ shortId, plataforma: pacote.plataforma })}
        />
      ))}
      {publicar.isSuccess && (
        <p className="text-[12px] text-[var(--wb-ok-ink)]">
          {String(publicar.data?.url ?? publicar.data?.pasta ?? 'pronto')}
        </p>
      )}
      {publicar.isError && (
        <p className="text-[12px] text-[var(--wb-text-dim)]">
          {(publicar.error as Error)?.message ?? 'falhou'}
        </p>
      )}
    </div>
  );
}

function Destino({
  pacote,
  ocupado,
  onPublicar,
}: {
  pacote: PacotePublicacao;
  ocupado: boolean;
  onPublicar: () => void;
}) {
  const porApi = pacote.modo === 'api';

  return (
    <article className="rounded-[8px] border border-[var(--wb-border)] p-2.5">
      <div className="flex items-center gap-2">
        <h4 className="flex-1 truncate text-[13px] font-bold">{pacote.rotulo}</h4>
        <button
          type="button"
          onClick={onPublicar}
          disabled={ocupado}
          className={cn(
            'inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
            porApi
              ? 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
              : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]',
          )}
        >
          {porApi ? <Send size={12} aria-hidden /> : <Upload size={12} aria-hidden />}
          {porApi ? 'publicar' : 'preparar pacote'}
        </button>
      </div>

      {pacote.avisos.map((aviso) => (
        <p key={aviso} className="mt-1 text-[11.5px] text-[var(--wb-warn-ink,var(--wb-text-dim))]">
          ⚠ {aviso}
        </p>
      ))}

      <p className="mt-1 truncate text-[11.5px] text-[var(--wb-text-mute)]" title={pacote.titulo}>
        {pacote.titulo_visivel}
        {pacote.titulo.length > pacote.titulo_visivel.length && '…'}
      </p>
    </article>
  );
}
