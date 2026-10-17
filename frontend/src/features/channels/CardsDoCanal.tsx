import { Button } from '@/components/ui/button';
import { CampoEscolha, CampoNumero, CampoPosicao, CampoTamanho, type PosicaoEditavel } from './ControlesDoPalco';

// D-916: os cards (cenas) do canal na tela de Canais — quais tipos aparecem no
// vídeo, de que tamanho, e onde sentam quando a cena está sobre o vídeo cheio.
// Na compartilhada quem posiciona o card é a zona do corte (o retângulo "Cards"
// do modal de posição), e isso continua lá.

/** D-951: espelha `SEM_LUGAR_NO_LIMPO` do renderer (cenas-limpo/index.tsx). */
export const SEM_LUGAR_NO_LIMPO: readonly string[] = ['tela_cheia'];

/** Os tipos que o estilo desenha — o exemplo da prévia não oferece o que sairia vazio. */
export function tiposQueODesenha<T extends { id: string }>(tipos: ReadonlyArray<T>, limpo: boolean): ReadonlyArray<T> {
  return limpo ? tipos.filter((t) => !SEM_LUGAR_NO_LIMPO.includes(t.id)) : tipos;
}

export type AjusteDoCard = 'preencher' | 'natural';
export type AlinhamentoVertical = 'centro' | 'topo' | 'base';
export type AlinhamentoHorizontal = 'centro' | 'esquerda' | 'direita';

export interface CardsEditaveis {
  ocultos: string[];
  escala: number;
  posicao: PosicaoEditavel;
  /** D-926: ausente = o padrão (ocupar o espaço, no centro). */
  ajuste?: AjusteDoCard;
  alinhamento_vertical?: AlinhamentoVertical;
  alinhamento_horizontal?: AlinhamentoHorizontal;
  /**
   * D-941: a caixa do card no vídeo cheio. Ausente = sem caixa e nada a mudar;
   * null = o operador pediu "sem caixa" (a edição manda a caixa vazia).
   */
  zona_no_cheio?: CaixaDoCard | null;
}

/** D-941: o retângulo do card no vídeo cheio, em px do quadro de 1920x1080. */
export interface CaixaDoCard {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A edição é parcial e descarta nulos: largura 0 é como a tela pede "sem caixa". */
export const SEM_CAIXA: CaixaDoCard = { x: 0, y: 0, w: 0, h: 0 };
/** Espelha `LADO_MINIMO_DA_CAIXA` do domínio. */
export const LADO_MINIMO_DA_CAIXA = 80;
/** A caixa que nasce quando o operador a liga: o canto de sempre, numa coluna larga. */
export const CAIXA_INICIAL: CaixaDoCard = { x: 96, y: 112, w: 760, h: 420 };

const AJUSTES: { id: AjusteDoCard; nome: string }[] = [
  { id: 'preencher', nome: 'Ocupar o espaço' },
  { id: 'natural', nome: 'Tamanho natural' },
];
const VERTICAIS: { id: AlinhamentoVertical; nome: string }[] = [
  { id: 'topo', nome: 'Topo' },
  { id: 'centro', nome: 'Centro' },
  { id: 'base', nome: 'Base' },
];
const HORIZONTAIS: { id: AlinhamentoHorizontal; nome: string }[] = [
  { id: 'esquerda', nome: 'Esquerda' },
  { id: 'centro', nome: 'Centro' },
  { id: 'direita', nome: 'Direita' },
];

/** O que veio do servidor (texto livre) como opções da tela; o desconhecido vira o padrão. */
export function cardsEditaveisDe(cards: {
  ocultos: string[];
  escala: number;
  posicao: PosicaoEditavel;
  ajuste?: string | null;
  alinhamento_vertical?: string | null;
  alinhamento_horizontal?: string | null;
  zona_no_cheio?: CaixaDoCard | null;
}): CardsEditaveis {
  const escolher = <T extends string>(valor: string | null | undefined, opcoes: { id: T }[], padrao: T): T =>
    opcoes.find((o) => o.id === valor)?.id ?? padrao;
  return {
    ocultos: cards.ocultos,
    escala: cards.escala,
    posicao: cards.posicao,
    ajuste: escolher(cards.ajuste, AJUSTES, 'preencher'),
    alinhamento_vertical: escolher(cards.alinhamento_vertical, VERTICAIS, 'centro'),
    alinhamento_horizontal: escolher(cards.alinhamento_horizontal, HORIZONTAIS, 'centro'),
    // O servidor manda null quando não há caixa: aqui isso é "nada a mudar".
    ...(cards.zona_no_cheio ? { zona_no_cheio: cards.zona_no_cheio } : {}),
  };
}

/**
 * D-926: como o card se apresenta dentro do espaço dele (a zona dos cards na
 * compartilhada): ocupar o espaço (cresce com pouco texto, encolhe com muito)
 * ou o tamanho natural, e onde senta quando sobra espaço.
 */
export function ModosDoCard({ valor, onMudar }: { valor: CardsEditaveis; onMudar: (valor: CardsEditaveis) => void }) {
  return (
    <div className="grid gap-3" role="group" aria-label="Modo do card no espaço">
      <CampoEscolha rotulo="No espaço dos cards" valor={valor.ajuste ?? 'preencher'} opcoes={AJUSTES} onEscolher={(ajuste) => onMudar({ ...valor, ajuste })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoEscolha
          rotulo="Alinhamento vertical"
          valor={valor.alinhamento_vertical ?? 'centro'}
          opcoes={VERTICAIS}
          onEscolher={(alinhamento_vertical) => onMudar({ ...valor, alinhamento_vertical })}
        />
        <CampoEscolha
          rotulo="Alinhamento horizontal"
          valor={valor.alinhamento_horizontal ?? 'centro'}
          opcoes={HORIZONTAIS}
          onEscolher={(alinhamento_horizontal) => onMudar({ ...valor, alinhamento_horizontal })}
        />
      </div>
    </div>
  );
}

const QUADRO = { largura: 1920, altura: 1080 };

export function CardsDoCanal({
  valor,
  tipos,
  onMudar,
  limpo = false,
}: {
  valor: CardsEditaveis;
  tipos: ReadonlyArray<{ id: string; nome: string }>;
  onMudar: (valor: CardsEditaveis) => void;
  limpo?: boolean;
}) {
  return (
    <fieldset className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] p-4">
      <legend className="px-1 text-xs font-medium text-text-300">Cards (cenas)</legend>
      <TiposDeCard valor={valor} tipos={tipos} onMudar={onMudar} limpo={limpo} />
      <AjustesDosCards valor={valor} onMudar={onMudar} />
      <p className="text-xs text-[var(--wb-text-dim)]">
        Na tela compartilhada o card fica na zona de cada corte (modal de posição); o modo acima diz como ele
        ocupa essa zona. Tamanho e posição valem no vídeo cheio.
      </p>
    </fieldset>
  );
}

/** Quais tipos de card aparecem no vídeo (D-927: o modal os põe embaixo da prévia, em mais colunas). */
export function TiposDeCard({
  valor,
  tipos,
  onMudar,
  colunas = 'sm:grid-cols-2 lg:grid-cols-3',
  limpo = false,
}: {
  valor: CardsEditaveis;
  tipos: ReadonlyArray<{ id: string; nome: string }>;
  onMudar: (valor: CardsEditaveis) => void;
  colunas?: string;
  /** D-951: no limpo a tela cheia (tese) não existe — fica desligada e diz por quê. */
  limpo?: boolean;
}) {
  const alternar = (id: string, mostrar: boolean) =>
    onMudar({
      ...valor,
      ocultos: mostrar ? valor.ocultos.filter((tipo) => tipo !== id) : [...valor.ocultos, id],
    });
  return (
    <div className="grid gap-1.5" role="group" aria-label="Tipos de card que aparecem no vídeo">
      <span className="text-xs font-medium text-text-300">Aparecem no vídeo</span>
      <div className={`grid gap-1 ${colunas}`}>
        {tipos.map((tipo) => {
          const semLugar = limpo && SEM_LUGAR_NO_LIMPO.includes(tipo.id);
          return (
            <label key={tipo.id} className="flex items-center gap-2 text-sm text-[var(--wb-text)] aria-disabled:opacity-50" aria-disabled={semLugar}>
              <input
                type="checkbox"
                disabled={semLugar}
                checked={!semLugar && !valor.ocultos.includes(tipo.id)}
                onChange={(e) => alternar(tipo.id, e.target.checked)}
              />
              {tipo.nome}
              {semLugar && <span className="text-[11px] text-[var(--wb-text-dim)]">(não existe no limpo)</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** Tamanho, posição no vídeo cheio e o modo na zona dos cards. */
export function AjustesDosCards({ valor, onMudar }: { valor: CardsEditaveis; onMudar: (valor: CardsEditaveis) => void }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoTamanho id="palco-cards-tamanho" escala={valor.escala} onMudar={(escala) => onMudar({ ...valor, escala })} />
        {valor.zona_no_cheio ? (
          <CaixaNoCheio caixa={valor.zona_no_cheio} onMudar={(zona_no_cheio) => onMudar({ ...valor, zona_no_cheio })} />
        ) : (
          <PosicaoNoCheio valor={valor} onMudar={onMudar} />
        )}
      </div>
      <ModosDoCard valor={valor} onMudar={onMudar} />
    </>
  );
}

/** Sem caixa: a posição do card sobre o vídeo cheio e o botão que liga a caixa. */
function PosicaoNoCheio({ valor, onMudar }: { valor: CardsEditaveis; onMudar: (valor: CardsEditaveis) => void }) {
  return (
    <div className="grid content-start gap-2">
      <CampoPosicao
        id="palco-cards-posicao"
        rotulo="Posição sobre o vídeo cheio"
        posicao={valor.posicao}
        quadro={QUADRO}
        descricaoAutomatica="no canto inferior esquerdo"
        onMudar={(posicao) => onMudar({ ...valor, posicao })}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onMudar({ ...valor, zona_no_cheio: CAIXA_INICIAL })}
        title="O card passa a ocupar um retângulo: largura e altura se ajustam separadamente."
      >
        Usar caixa (largura e altura)
      </Button>
    </div>
  );
}

/**
 * D-941: com caixa, o card ocupa o retângulo. "Ocupar o espaço" espalha o texto
 * pela largura; o tamanho (%) vira o da letra; o que não couber encolhe.
 */
function CaixaNoCheio({ caixa, onMudar }: { caixa: CaixaDoCard; onMudar: (caixa: CaixaDoCard | null) => void }) {
  const campo = (chave: keyof CaixaDoCard, rotulo: string, max: number, min = 0) => (
    <CampoNumero
      id={`palco-cards-caixa-${chave}`}
      rotulo={rotulo}
      valor={caixa[chave]}
      min={min}
      max={max}
      unidade="px"
      onMudar={(numero) => onMudar({ ...caixa, [chave]: Math.round(numero) })}
    />
  );
  return (
    <div className="grid content-start gap-2" role="group" aria-label="Caixa do card no vídeo cheio">
      <div className="grid grid-cols-2 gap-2">
        {campo('w', 'Largura', QUADRO.largura, LADO_MINIMO_DA_CAIXA)}
        {campo('h', 'Altura', QUADRO.altura, LADO_MINIMO_DA_CAIXA)}
        {campo('x', 'X', QUADRO.largura)}
        {campo('y', 'Y', QUADRO.altura)}
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => onMudar(null)}>
        Sem caixa (posição e tamanho)
      </Button>
    </div>
  );
}
