import { Layers, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EstadoPalco } from './shortsApi';
import { useEscolherPreset, usePalcoDoCorte } from './useShortsDoCorte';

// E-036/D-487: de onde saem as regiões que o palco recorta.
//
// Este painel existe por causa de um caso concreto: o corte que o operador
// renderizou está com `regioes: []`. Sem região, o palco usa o quadro inteiro —
// e o chrome verde da live volta, que é exatamente o que o palco veio evitar.
//
// Por isso o painel mostra a ORIGEM, não só o resultado. Um short torto precisa
// dizer por que está torto, senão o operador troca de arranjo achando que o
// problema é o modelo, quando é a falta de região.

const ROTULO_ORIGEM: Record<EstadoPalco['origem'], string> = {
  preset: 'preset escolhido',
  layout_do_corte: 'posicionamento do corte',
  nenhuma: 'sem região marcada',
};

const ROTULO_REGIAO: Record<string, string> = {
  pessoa: 'pessoa',
  tela: 'tela compartilhada',
  quadro: 'quadro',
};

export function PalcoDoCorte({ corteId }: { corteId: string }) {
  const palco = usePalcoDoCorte(corteId);
  const escolher = useEscolherPreset(corteId);

  if (palco.isLoading) return null;

  if (palco.isError) {
    return (
      <p className="text-[11.5px] text-[var(--wb-text-dim)]">
        Nao consegui ler o palco: {(palco.error as Error)?.message ?? 'erro desconhecido'}
      </p>
    );
  }

  const estado = palco.data;
  if (!estado) return null;

  const semRegiao = estado.origem === 'nenhuma';
  const regioes = Object.keys(estado.regioes);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="inline-flex items-center gap-1 font-code text-[10.5px] uppercase tracking-wide text-[var(--wb-text-mute)]">
        <Layers size={11} aria-hidden />
        palco
      </span>

      <select
        aria-label="Preset que alimenta o palco vertical"
        value={estado.presets_disponiveis.find((p) => p.nome === estado.preset)?.id ?? ''}
        disabled={escolher.isPending}
        onChange={(e) => escolher.mutate(e.target.value)}
        className="rounded-[5px] border border-transparent bg-[var(--wb-bg-inset)] px-1.5 py-1 text-[11.5px] text-[var(--wb-text)] outline-none focus:border-[var(--wb-accent)] disabled:opacity-45"
      >
        <option value="">automático</option>
        {estado.presets_disponiveis.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.nome}
          </option>
        ))}
      </select>

      <span
        className={cn(
          'inline-flex items-center gap-1 font-code text-[11px]',
          semRegiao ? 'font-bold text-[var(--wb-warn-ink)]' : 'text-[var(--wb-text-mute)]',
        )}
        title={
          semRegiao
            ? 'Sem região, o palco usa o quadro inteiro — e a moldura da live entra junto no short.'
            : `Regiões: ${regioes.map((r) => ROTULO_REGIAO[r] ?? r).join(', ')}`
        }
      >
        {semRegiao && <TriangleAlert size={11} aria-hidden />}
        {ROTULO_ORIGEM[estado.origem]}
        {!semRegiao && ` · ${regioes.map((r) => ROTULO_REGIAO[r] ?? r).join(' + ')}`}
      </span>

      {escolher.isError && (
        <span className="text-[11px] text-[var(--wb-warn-ink)]">
          {(escolher.error as Error)?.message ?? 'nao consegui trocar'}
        </span>
      )}
    </div>
  );
}
