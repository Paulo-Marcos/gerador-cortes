import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CLAUDE_BRAND, ClaudeIcon } from '@/components/ui/claude-button';
import { GEMINI_BRAND, GeminiIcon } from '@/components/ui/gemini-button';
import type { ProviderIA } from '@/lib/providerIa';
import { cn } from '@/lib/utils';
import { ICONE_DO_CONCEITO, Icon, type IconName } from '@/upgrade/Icon';

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
  sm: { altura: 'h-7', texto: 'text-micro', icone: 14, botao: 'w-7' },
  md: { altura: 'h-9', texto: 'text-corpo', icone: 16, botao: 'w-9' },
} as const;

// D-1114 (E-069 H-07): a Sala escura. Uma pílula de vidro; a faísca em `iris` é o sinal de
// "a IA faz isto" e o provedor é ícone no tom do texto, não cor de marca (DIRECAO §5).
// Sem `backdrop-filter`: o grupo aparece em vários pontos da mesma tela (§3.6).
const TAMANHOS_SALA = {
  sm: { altura: 'h-botao-pq', texto: 'text-pequeno', icone: 14, botao: 'w-[30px]' },
  md: { altura: 'h-botao-md', texto: 'text-corpo', icone: 16, botao: 'w-[38px]' },
} as const;

type MedidasDaAcao =
  (typeof TAMANHOS)[keyof typeof TAMANHOS] | (typeof TAMANHOS_SALA)[keyof typeof TAMANHOS_SALA];

/** As classes de um botão de provedor: o desenho (legado ou Sala escura) e o encaixe na fileira. */
function classeDoProvedor(o: {
  sala: boolean;
  t: MedidasDaAcao;
  comNome: boolean;
  apenasProvedores: boolean;
  /** Sem rótulo, o primeiro botão abre o grupo: a divisória fica só entre eles. */
  comDivisoria: boolean;
  /** Só o que NÃO está gerando esmaece: o que gira precisa ficar legível. */
  esmaecido: boolean;
}) {
  const { sala, t, comNome } = o;
  return cn(
    'grid shrink-0 place-items-center transition-colors',
    o.comDivisoria && ('border-l border-fio'),
    o.apenasProvedores && 'flex-1',
    // Partem da largura natural (auto, não 0): só assim falta espaço e o
    // verbo, e não o nome, é quem encolhe.
    comNome &&
      cn(
        'flex min-w-0 flex-[1_1_auto] items-center justify-center gap-1.5 px-1.5 font-medium',
        t.texto,
      ),
    sala
      ? 'text-fg-2 hover:bg-vidro-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foco active:bg-vidro'
      : cn(comNome ? 'text-fg' : 'text-[var(--marca)]', 'hover:bg-poco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foco'),
    'disabled:cursor-not-allowed',
    o.esmaecido && 'opacity-40',
    !comNome && t.botao,
  );
}

/** O verbo da ação (ícone + texto), à esquerda dos provedores. */
function classeDoRotulo(o: {
  sala: boolean;
  t: MedidasDaAcao;
  comNome: boolean;
  destaque: boolean;
}) {
  const { sala, destaque } = o;
  const cor = destaque ? 'text-iris' : 'text-fg';
  return cn(
    // min-w-0: numa coluna estreita é o TEXTO que encolhe (com reticências),
    // nunca os botões dos provedores — sem eles a ação não existe.
    'flex min-w-0 items-center gap-1.5 whitespace-nowrap font-semibold',
    // Com os nomes, o verbo cede primeiro (shrink 1000 contra 1): numa
    // coluna de notebook ele vira só o ícone e "Claude"/"Gemini" ficam.
    o.comNome ? 'flex-[0_1000_auto] px-2' : 'flex-1 px-2.5',
    sala && 'pl-3.5',
    o.t.texto,
    cor,
  );
}

/** O grupo todo: pílula de vidro (Sala escura) ou o cartão de 8 px de hoje. */
function classeDoGrupo(sala: boolean, altura: string, className?: string) {
  return cn(
    'inline-flex items-stretch overflow-hidden',
    sala
      ? 'rounded-pilula border border-fio-2 bg-vidro-2 text-fg shadow-topo'
      : 'rounded-campo border border-fio-2 bg-painel-solido',
    altura,
    className,
  );
}

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
  /** O desenho da ação. Padrão: IA gera. Analisar com a IA é o cérebro (D-858). */
  icone?: IconName;
  /**
   * Só os dois botões, dividindo a largura. Para colunas estreitas, onde o
   * rótulo ao lado viraria reticências: quem usa põe a legenda acima.
   */
  apenasProvedores?: boolean;
  /**
   * D-871: os provedores pelo NOME, lado a lado e dividindo a largura. Para o
   * painel onde a IA é a ação da coluna: o ícone sozinho pedia passar o mouse
   * para saber qual dos dois gerava.
   */
  comNome?: boolean;
  /**
   * D-977: um terceiro botão, "As duas", que roda a ação com o Claude e depois
   * com o Gemini. Só aparece onde a tela oferece a dupla (a análise da live);
   * `emVoo` deixa o botão ocupado junto do provedor da vez.
   */
  asDuas?: { onGerar: () => void; emVoo: boolean };
  /** `legada` (padrão) é o desenho `--wb-*` das telas de hoje; `sala-escura` é o novo. */
  aparencia?: 'legada' | 'sala-escura';
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
  icone = ICONE_DO_CONCEITO.iaGera,
  apenasProvedores = false,
  comNome = false,
  asDuas,
  aparencia = 'legada',
  className,
}: AcaoDeIaProps) {
  const sala = aparencia === 'sala-escura';
  const t = (sala ? TAMANHOS_SALA : TAMANHOS)[tamanho];
  const travado = desabilitado || emVoo !== null;

  return (
    <div
      role="group"
      aria-label={descricao}
      data-variant="acao-de-ia"
      data-aparencia={aparencia}
      className={classeDoGrupo(sala, t.altura, className)}
    >
      {!apenasProvedores && (
        <span className={classeDoRotulo({ sala, t, comNome, destaque })}>
          {emVoo ? (
            <Icon
              name="loader-2"
              size={t.icone}
              className={cn('animate-spin motion-reduce:animate-none', sala && 'text-iris')}
            />
          ) : (
            <Icon name={icone} size={t.icone} className={cn(sala && 'text-iris')} />
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
          data-sala={sala ? '' : undefined}
          onClick={() => onGerar(id)}
          disabled={travado}
          aria-label={`${descricao} com o ${nome}`}
          aria-busy={emVoo === id}
          title={`${descricao} com o ${nome}`}
          className={classeDoProvedor({
            sala,
            t,
            comNome,
            apenasProvedores,
            comDivisoria: !apenasProvedores || indice > 0,
            esmaecido: travado && emVoo !== id,
          })}
          // Com o nome escrito, a marca fica só no ícone: o texto é neutro (D-871,
          // a cor do painel fica para estado). A cor da marca entra por variável CSS.
          style={sala ? undefined : ({ '--marca': cor } as CSSProperties)}
        >
          {emVoo === id ? (
            <Icon name="loader-2" size={t.icone} className="animate-spin" />
          ) : comNome ? (
            <span className={cn('flex flex-none', !sala && 'text-[var(--marca)]')}>
              <Icone size={t.icone} />
            </span>
          ) : (
            <Icone size={t.icone} />
          )}
          {comNome ? <span className="truncate">{nome}</span> : null}
        </button>
      ))}
      {asDuas && (
        <BotaoDasDuas
          descricao={descricao}
          travado={travado}
          tamanho={tamanho}
          sala={sala}
          {...asDuas}
        />
      )}
    </div>
  );
}

/** D-977: o terceiro botão da ação — o Claude e, depois, o Gemini. */
function BotaoDasDuas({
  descricao,
  onGerar,
  travado,
  emVoo,
  tamanho,
  sala,
}: {
  descricao: string;
  onGerar: () => void;
  travado: boolean;
  emVoo: boolean;
  tamanho: keyof typeof TAMANHOS;
  sala: boolean;
}) {
  const t = (sala ? TAMANHOS_SALA : TAMANHOS)[tamanho];
  return (
    <button
      type="button"
      data-sala={sala ? '' : undefined}
      onClick={onGerar}
      disabled={travado}
      aria-label={`${descricao} com o Claude e o Gemini`}
      aria-busy={emVoo}
      title={`${descricao} com o Claude e depois com o Gemini`}
      className={cn(
        'flex shrink-0 items-center gap-1 border-l px-2 font-medium transition-colors',
        sala
          ? 'border-fio text-fg-2 hover:bg-vidro-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foco'
          : 'border-fio text-fg hover:bg-poco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foco',
        t.texto,
        'disabled:cursor-not-allowed',
        travado && !emVoo && 'opacity-40',
      )}
    >
      {emVoo ? (
        <Icon name="loader-2" size={t.icone} className="animate-spin" />
      ) : (
        PROVEDORES.map(({ id, cor, Icone }) => (
          <span
            key={id}
            className={cn('flex flex-none', !sala && 'text-[var(--marca)]')}
            style={sala ? undefined : ({ '--marca': cor } as CSSProperties)}
          >
            <Icone size={t.icone - 2} />
          </span>
        ))
      )}
      <span>As duas</span>
    </button>
  );
}

interface MenuDeIaProps {
  /** O que a IA vai fazer — vira o título do menu e o nome dos itens. */
  rotulo: string;
  /** Ícone do gatilho, para barras só de ícones. */
  icone: IconName;
  onGerar: (provider: ProviderIA) => void;
  /** Mostra o gatilho girando (a ação já foi disparada). */
  ocupado?: boolean;
  desabilitado?: boolean;
  /**
   * Para que lado o painel abre. Padrão à esquerda: numa barra encostada na
   * lateral da página, abrir para a direita do gatilho o corta pela borda.
   */
  alinhamento?: 'esquerda' | 'direita';
  /** Ajusta o gatilho à fileira em que ele mora (ex.: ícones de 26 px). */
  classeGatilho?: string;
  className?: string;
}

/**
 * A mesma escolha para barras de ferramentas só de ícones, onde um grupo com
 * texto quebraria o ritmo da fileira: o ícone da ação abre as duas opções.
 */
export function MenuDeIa({
  rotulo,
  icone,
  onGerar,
  ocupado = false,
  desabilitado = false,
  alinhamento = 'esquerda',
  classeGatilho,
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
        className={cn(
          'grid h-8 w-8 place-items-center rounded-etiqueta text-aviso transition-colors hover:bg-poco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:opacity-50',
          classeGatilho,
        )}
      >
        {ocupado ? (
          <Icon name="loader-2" size={16} className="animate-spin" />
        ) : (
          <Icon name={icone} size={16} />
        )}
      </button>

      {aberto && (
        <div
          role="menu"
          aria-label={rotulo}
          className={cn(
            'absolute top-[calc(100%+4px)] z-40 flex w-[240px] flex-col gap-0.5 rounded-campo border border-fio-2 bg-painel-solido p-2 shadow-pop',
            alinhamento === 'esquerda' ? 'left-0' : 'right-0',
          )}
        >
          <span className="px-2 pb-1 text-micro font-semibold tracking-[0.06em] text-fg-3">
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
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-pequeno font-normal text-fg transition-colors hover:bg-poco"
            >
              <span style={{ '--marca': cor } as CSSProperties} className="text-[var(--marca)]">
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
