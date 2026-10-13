// D-564: as peças burras do modal de lote — a seção, o interruptor com a
// consequência escrita, a caixa de plataforma. Saíram do modal quando ele
// chegou ao teto de tamanho (D-771) e a seção "Quando" ganhou vida própria (D-908).
import { cn } from '@/lib/utils';
import { Icon } from '@/upgrade/Icon';

// As três que recebem um short VERTICAL. O TikTok horizontal existe no backend
// (D-470), mas ele é do MP4 16:9 do corte — não deste lote, e oferecê-lo aqui
// faria o operador escolher um destino para um arquivo que não é o desta tela.
export const PLATAFORMAS = [
  { id: 'youtube_shorts', rotulo: 'YouTube Shorts', nota: 'sobe sozinho, como unlisted' },
  { id: 'tiktok', rotulo: 'TikTok', nota: 'pacote pronto; o upload é seu' },
  { id: 'instagram_reels', rotulo: 'Instagram Reels', nota: 'pacote pronto; sobe do celular' },
] as const;

export function rotuloCurto(plataforma: string): string {
  return PLATAFORMAS.find((p) => p.id === plataforma)?.rotulo ?? plataforma;
}

export function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--wb-text-mute)]">
          {titulo}
        </h3>
        <div className="flex-1" />
        {acao}
      </div>
      {children}
    </section>
  );
}

/**
 * Um interruptor de decisão, com o que ele muda escrito embaixo.
 *
 * A nota não é enfeite: "o robô sobe pelo navegador" e "o robô publica" parecem a
 * mesma frase e são responsabilidades opostas. Quem lê às onze da noite precisa
 * da consequência à vista, não do nome da opção.
 */
export function Interruptor({
  ligado,
  onChange,
  titulo,
  nota,
  alerta = false,
}: {
  ligado: boolean;
  onChange: (valor: boolean) => void;
  titulo: string;
  nota: string;
  alerta?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={ligado}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-3.5 flex-none accent-[var(--wb-accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold">{titulo}</span>
        <span
          className={cn(
            'block text-[11px]',
            alerta && ligado
              ? 'text-[var(--wb-warn-ink,var(--wb-text-dim))]'
              : 'text-[var(--wb-text-mute)]',
          )}
        >
          {nota}
        </span>
      </span>
    </label>
  );
}

export function Caixa({
  marcada,
  onClick,
  titulo,
  nota,
}: {
  marcada: boolean;
  onClick: () => void;
  titulo: string;
  nota: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={marcada}
      aria-label={titulo}
      className={cn(
        'flex min-w-[180px] flex-1 flex-col items-start gap-0.5 rounded-[9px] border px-3 py-2 text-left transition-colors',
        marcada
          ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
          : 'border-[var(--wb-border)] hover:bg-[var(--wb-bg-inset)]',
      )}
    >
      <span className="flex items-center gap-1.5 text-[12.5px] font-bold">
        {marcada && <Icon name="check" />}
        {titulo}
      </span>
      <span className="text-[11px] text-[var(--wb-text-mute)]">{nota}</span>
    </button>
  );
}
