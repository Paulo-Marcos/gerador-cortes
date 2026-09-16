import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, Sparkles, type LucideIcon } from 'lucide-react';
import { CLAUDE_BRAND, ClaudeIcon } from '@/components/ui/claude-button';
import { GEMINI_BRAND, GeminiIcon } from '@/components/ui/gemini-button';
import type { ProviderIA } from '@/lib/providerIa';
import { cn } from '@/lib/utils';

// D-609: uma ação de IA, dois provedores — sem repetir o verbo.
//
// Antes, cada tela tinha dois botões com o mesmo texto ("Gerar trechos (Claude)"
// / "Gerar trechos (Gemini)"): o que mudava entre eles era só o provedor, mas o
// olho lia duas ações. Aqui a AÇÃO é dita uma vez e o provedor vira a escolha
// final, por ícone — o mesmo desenho de um botão com opções.
//
// Enquanto gera, os dois travam: o disparo é caro (minutos e cota), e um segundo
// clique no outro provedor rodaria a mesma etapa em paralelo por cima.

const PROVEDORES: {
  id: ProviderIA;
  nome: string;
  cor: string;
  Icone: (props: { size?: number; className?: string }) => ReactNode;
}[] = [
  { id: 'claude', nome: 'Claude', cor: CLAUDE_BRAND, Icone: ClaudeIcon },
  { id: 'gemini', nome: 'Gemini', cor: GEMINI_BRAND, Icone: GeminiIcon },
];

const TAMANHOS = {
  sm: { altura: 'h-7', texto: 'text-[11.5px]', icone: 13, botao: 'w-7' },
  md: { altura: 'h-9', texto: 'text-[13px]', icone: 15, botao: 'w-9' },
} as const;

interface AcaoDeIaProps {
  /** O que a IA vai fazer, no infinitivo: "Gerar trechos", "Regerar metadados". */
  rotulo: string;
  /**
   * A ação completa, para leitor de tela e tooltip, quando o rótulo visível é
   * curto demais para se explicar sozinho ("Refazer" → "Refazer o prompt da arte").
   */
  descricao?: string;
  /** Quem está gerando agora. Só ele gira; o outro trava. */
  emVoo: ProviderIA | null;
  onGerar: (provider: ProviderIA) => void;
  /** Trava os dois provedores (ex.: outra operação ocupando o corte). */
  desabilitado?: boolean;
  /** Texto enquanto gera. Padrão: "gerando…". */
  rotuloEmVoo?: string;
  /** Ação principal da área: rótulo na cor de acento. */
  destaque?: boolean;
  tamanho?: 'sm' | 'md';
  /**
   * Só os dois botões, dividindo a largura. Para colunas estreitas, onde o
   * rótulo ao lado viraria reticências: quem usa põe a legenda acima.
   */
  apenasProvedores?: boolean;
  className?: string;
}

export function AcaoDeIa({
  rotulo,
  descricao = rotulo,
  emVoo,
  onGerar,
  desabilitado = false,
  rotuloEmVoo = 'gerando…',
  destaque = false,
  tamanho = 'sm',
  apenasProvedores = false,
  className,
}: AcaoDeIaProps) {
  const t = TAMANHOS[tamanho];
  const travado = desabilitado || emVoo !== null;

  return (
    <div
      role="group"
      aria-label={descricao}
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-card)]',
        t.altura,
        className,
      )}
    >
      {!apenasProvedores && (
        <span
          className={cn(
            // min-w-0: numa coluna estreita é o TEXTO que encolhe (com reticências),
            // nunca os botões dos provedores — sem eles a ação não existe.
            'flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap px-2.5 font-semibold',
            t.texto,
            destaque ? 'text-[var(--wb-accent)]' : 'text-[var(--wb-text)]',
          )}
        >
          {emVoo ? (
            <Loader2 size={t.icone} className="animate-spin" aria-hidden />
          ) : (
            <Sparkles size={t.icone} aria-hidden />
          )}
          {/* aria-live: quem não vê o spinner ouve que a geração começou. */}
          <span aria-live="polite" className="truncate">
            {emVoo ? rotuloEmVoo : rotulo}
          </span>
        </span>
      )}

      {PROVEDORES.map(({ id, nome, cor, Icone }, indice) => (
        <button
          key={id}
          type="button"
          onClick={() => onGerar(id)}
          disabled={travado}
          aria-label={`${descricao} com o ${nome}`}
          aria-busy={emVoo === id}
          title={`${descricao} com o ${nome}`}
          className={cn(
            'grid shrink-0 place-items-center transition-colors',
            // Sem rótulo, o primeiro botão abre o grupo: a divisória fica só entre eles.
            (!apenasProvedores || indice > 0) && 'border-l border-[var(--wb-border-soft)]',
            apenasProvedores && 'flex-1',
            'hover:bg-[var(--wb-bg-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--wb-focus)]',
            // Só o que NÃO está gerando esmaece: o que gira precisa ficar legível.
            'disabled:cursor-not-allowed',
            travado && emVoo !== id && 'opacity-40',
            t.botao,
          )}
          style={{ color: cor }}
        >
          {emVoo === id ? (
            <Loader2 size={t.icone} className="animate-spin" aria-hidden />
          ) : (
            <Icone size={t.icone} />
          )}
        </button>
      ))}
    </div>
  );
}

interface MenuDeIaProps {
  /** O que a IA vai fazer — vira o título do menu e o nome dos itens. */
  rotulo: string;
  /** Ícone do gatilho, para barras só de ícones. */
  icone: LucideIcon;
  onGerar: (provider: ProviderIA) => void;
  /** Mostra o gatilho girando (a ação já foi disparada). */
  ocupado?: boolean;
  desabilitado?: boolean;
  /**
   * Para que lado o painel abre. Padrão à esquerda: numa barra encostada na
   * lateral da página, abrir para a direita do gatilho o corta pela borda.
   */
  alinhamento?: 'esquerda' | 'direita';
  className?: string;
}

/**
 * A mesma escolha para barras de ferramentas só de ícones, onde um grupo com
 * texto quebraria o ritmo da fileira: o ícone da ação abre as duas opções.
 */
export function MenuDeIa({
  rotulo,
  icone: Icone,
  onGerar,
  ocupado = false,
  desabilitado = false,
  alinhamento = 'esquerda',
  className,
}: MenuDeIaProps) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (evento: MouseEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) setAberto(false);
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        disabled={desabilitado || ocupado}
        aria-label={rotulo}
        title={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className="grid h-8 w-8 place-items-center rounded-[7px] text-[var(--wb-warn)] transition-colors hover:bg-[var(--wb-bg-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
      >
        {ocupado ? (
          <Loader2 size={16} strokeWidth={1.75} className="animate-spin" aria-hidden />
        ) : (
          <Icone size={16} strokeWidth={1.75} aria-hidden />
        )}
      </button>

      {aberto && (
        <div
          role="menu"
          aria-label={rotulo}
          className={cn(
            'absolute top-[calc(100%+4px)] z-40 flex w-[240px] flex-col gap-0.5 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-2 shadow-[shadow:var(--wb-shadow)]',
            alinhamento === 'esquerda' ? 'left-0' : 'right-0',
          )}
        >
          <span className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--wb-text-dim)]">
            {rotulo}
          </span>
          {PROVEDORES.map(({ id, nome, cor, Icone: IconeProvedor }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => {
                setAberto(false);
                onGerar(id);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--wb-text)] transition-colors hover:bg-[var(--wb-bg-inset)]"
            >
              <span style={{ color: cor }}>
                <IconeProvedor size={14} />
              </span>
              com o {nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
