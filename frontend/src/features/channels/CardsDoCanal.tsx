import { CampoEscolha, CampoPosicao, CampoTamanho, type PosicaoEditavel } from './ControlesDoPalco';

// D-916: os cards (cenas) do canal na tela de Canais — quais tipos aparecem no
// vídeo, de que tamanho, e onde sentam quando a cena está sobre o vídeo cheio.
// Na compartilhada quem posiciona o card é a zona do corte (o retângulo "Cards"
// do modal de posição), e isso continua lá.

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
}

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
}: {
  valor: CardsEditaveis;
  tipos: ReadonlyArray<{ id: string; nome: string }>;
  onMudar: (valor: CardsEditaveis) => void;
}) {
  return (
    <fieldset className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] p-4">
      <legend className="px-1 text-xs font-medium text-text-300">Cards (cenas)</legend>
      <TiposDeCard valor={valor} tipos={tipos} onMudar={onMudar} />
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
}: {
  valor: CardsEditaveis;
  tipos: ReadonlyArray<{ id: string; nome: string }>;
  onMudar: (valor: CardsEditaveis) => void;
  colunas?: string;
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
        {tipos.map((tipo) => (
          <label key={tipo.id} className="flex items-center gap-2 text-sm text-[var(--wb-text)]">
            <input type="checkbox" checked={!valor.ocultos.includes(tipo.id)} onChange={(e) => alternar(tipo.id, e.target.checked)} />
            {tipo.nome}
          </label>
        ))}
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
        <CampoPosicao
          id="palco-cards-posicao"
          rotulo="Posição sobre o vídeo cheio"
          posicao={valor.posicao}
          quadro={QUADRO}
          descricaoAutomatica="no canto inferior esquerdo"
          onMudar={(posicao) => onMudar({ ...valor, posicao })}
        />
      </div>
      <ModosDoCard valor={valor} onMudar={onMudar} />
    </>
  );
}
