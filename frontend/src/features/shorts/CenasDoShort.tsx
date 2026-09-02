import { useEffect, useState } from 'react';
import { Plus, Quote, Sparkles, Trash2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CenaShort, TipoCenaShort } from './shortsApi';

// D-494: as cenas desenhadas sobre o short.
//
// Elas existem no renderer desde a D-465 e o render as desenha — mas
// `cenas_remotion` nascia vazio e ficava assim, porque não havia por onde
// criá-las. Este painel é essa porta.
//
// O repertório é pequeno de propósito: quatro tipos, cada um resolvendo um
// momento. Um short tem uma ideia só; repertório grande aqui não é riqueza, é
// distração — e cada tipo a mais é um tipo que se escolhe errado com pressa.

const TIPOS: { id: TipoCenaShort; nome: string; para: string; Icone: typeof Sparkles }[] = [
  { id: 'hook', nome: 'Gancho', para: 'Segura os 3 primeiros segundos', Icone: Sparkles },
  { id: 'numero', nome: 'Número', para: 'O dado que sustenta o argumento', Icone: TrendingUp },
  { id: 'citacao', nome: 'Citação', para: 'A frase que vale ser lida', Icone: Quote },
  { id: 'cta', nome: 'Chamada', para: 'O convite para o vídeo longo', Icone: Plus },
];

const META = Object.fromEntries(TIPOS.map((t) => [t.id, t])) as Record<
  TipoCenaShort,
  (typeof TIPOS)[number]
>;

/** Duração padrão de uma cena nova, e o mínimo que o domínio aceita. */
const DURACAO_NOVA = 3;
const DURACAO_MINIMA = 0.8;

interface Props {
  cenas: CenaShort[];
  duracaoSeg: number;
  ocupado: boolean;
  erro: string | null;
  onGravar: (cenas: CenaShort[]) => void;
}

export function CenasDoShort({ cenas, duracaoSeg, ocupado, erro, onGravar }: Props) {
  const [tipoNovo, setTipoNovo] = useState<TipoCenaShort>('hook');

  // A lista é EDITADA localmente e persistida em momentos escolhidos.
  //
  // Duas coisas exigiram isso, e as duas só apareceram usando a tela:
  //
  //   1. gravar a cada tecla dispararia um PUT por caractere digitado;
  //   2. "Adicionar" cria uma cena sem texto, que o backend recusa — e com
  //      razão, porque cena sem texto não diz nada. Persistir na hora daria um
  //      erro no lugar de uma linha nova.
  //
  // Então o rascunho vive aqui e só sobe quando está inteiro. Enquanto falta
  // texto, a tela diz o que falta em vez de tentar e falhar.
  const [rascunho, setRascunho] = useState<CenaShort[]>(cenas);

  // Reconciliação com o servidor: só quando não há edição pendente. Sem a
  // guarda, uma resposta chegando no meio da digitação apagaria o que foi
  // escrito.
  const pendente = JSON.stringify(rascunho) !== JSON.stringify(cenas);
  const completas = rascunho.every((c) => c.texto.trim().length > 0);
  useEffect(() => {
    if (!pendente || completas) setRascunho(cenas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cenas]);

  const persistir = (proximas: CenaShort[]) => {
    setRascunho(proximas);
    if (proximas.every((c) => c.texto.trim().length > 0)) onGravar(proximas);
  };

  // Espelha `sugerir_janela` do domínio: acha o primeiro vão livre. Nascer sobre
  // uma cena existente obrigaria a arrumar antes de escrever — a ordem inversa
  // da que o operador tem em mente.
  const proximaJanela = (): { inicio: number; fim: number } => {
    const passo = Math.min(DURACAO_NOVA, Math.max(DURACAO_MINIMA, duracaoSeg));
    let cursor = 0;
    for (const cena of [...rascunho].sort((a, b) => a.inicio - b.inicio)) {
      if (cena.inicio - cursor >= passo) break;
      cursor = Math.max(cursor, cena.fim);
    }
    const inicio = Math.min(cursor, Math.max(0, duracaoSeg - passo));
    return { inicio: round2(inicio), fim: round2(Math.min(duracaoSeg, inicio + passo)) };
  };

  // A cena nova NÃO sobe: ela nasce sem texto, e o backend recusa cena sem
  // texto. Fica local até o operador escrever.
  const adicionar = () => {
    const { inicio, fim } = proximaJanela();
    setRascunho([...rascunho, { tipo: tipoNovo, inicio, fim, texto: '' }]);
  };

  /** Muda no rascunho. Não persiste — quem persiste é o `blur`. */
  const editar = (indice: number, mudanca: Partial<CenaShort>) =>
    setRascunho(rascunho.map((c, i) => (i === indice ? { ...c, ...mudanca } : c)));

  /** Muda e já persiste: mudanças estruturais não têm "fim de digitação". */
  const editarEGravar = (indice: number, mudanca: Partial<CenaShort>) =>
    persistir(rascunho.map((c, i) => (i === indice ? { ...c, ...mudanca } : c)));

  const remover = (indice: number) => persistir(rascunho.filter((_, i) => i !== indice));

  const faltaTexto = rascunho.some((c) => !c.texto.trim());

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
          cenas ({rascunho.length})
        </span>
        <div className="flex-1" />
        <select
          aria-label="Tipo da cena nova"
          value={tipoNovo}
          disabled={ocupado}
          onChange={(e) => setTipoNovo(e.target.value as TipoCenaShort)}
          className="h-7 rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
        >
          {TIPOS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          disabled={ocupado || duracaoSeg <= 0}
          onClick={adicionar}
          title={META[tipoNovo].para}
        >
          <Plus />
          Adicionar
        </Button>
      </div>

      {rascunho.length === 0 && (
        <p className="rounded-[8px] bg-[var(--wb-bg-inset)] p-2 text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
          Sem cenas — o short sai só com o vídeo e a legenda. Um gancho nos primeiros segundos
          é o que costuma decidir se alguém fica.
        </p>
      )}

      {rascunho.map((cena, indice) => {
        const meta = META[cena.tipo] ?? META.hook;
        const Icone = meta.Icone;
        return (
          <div
            key={indice}
            className="space-y-1.5 rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-2"
          >
            <div className="flex items-center gap-1.5">
              <Icone size={12} className="flex-none text-[var(--wb-accent)]" aria-hidden />
              <select
                aria-label={`Tipo da cena ${indice + 1}`}
                value={cena.tipo}
                disabled={ocupado}
                onChange={(e) => editarEGravar(indice, { tipo: e.target.value as TipoCenaShort })}
                className="h-6 rounded-[6px] border border-transparent bg-[var(--wb-bg-inset)] px-1 text-[11px] font-semibold outline-none focus-visible:border-[var(--wb-accent)] disabled:opacity-50"
              >
                {TIPOS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
              <CampoSegundo
                rotulo="de"
                valor={cena.inicio}
                ocupado={ocupado}
                onAplicar={(v) => editarEGravar(indice, { inicio: v })}
              />
              <CampoSegundo
                rotulo="até"
                valor={cena.fim}
                ocupado={ocupado}
                onAplicar={(v) => editarEGravar(indice, { fim: v })}
              />
              <div className="flex-1" />
              <Button
                variant="danger"
                size="icon-sm"
                aria-label={`Remover a cena ${indice + 1}`}
                disabled={ocupado}
                onClick={() => remover(indice)}
              >
                <Trash2 />
              </Button>
            </div>

            <input
              value={cena.texto}
              disabled={ocupado}
              aria-label={`Texto da cena ${indice + 1}`}
              placeholder={meta.para}
              onChange={(e) => editar(indice, { texto: e.target.value })}
              onBlur={() => persistir(rascunho)}
              className="w-full rounded-[6px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-2 py-1 text-[12px] outline-none focus-visible:border-[var(--wb-accent)] disabled:opacity-50"
            />
            <input
              value={cena.apoio ?? ''}
              disabled={ocupado}
              aria-label={`Apoio da cena ${indice + 1}`}
              placeholder="apoio (opcional) — unidade, autor, complemento"
              onChange={(e) => editar(indice, { apoio: e.target.value })}
              onBlur={() => persistir(rascunho)}
              className="w-full rounded-[6px] border border-transparent bg-[var(--wb-bg-inset)] px-2 py-1 text-[11px] text-[var(--wb-text-mute)] outline-none focus-visible:border-[var(--wb-accent)] disabled:opacity-50"
            />
          </div>
        );
      })}

      {/* O motivo vem do backend e é repetido literalmente: ele já diz o que
          fazer ("a cena termina em 40s e o short tem 30s"), e reescrevê-lo aqui
          só criaria uma segunda versão para divergir. */}
      {faltaTexto && (
        <p className="rounded-[8px] bg-[var(--wb-bg-inset)] p-2 text-[11.5px] text-[var(--wb-text-mute)]">
          Escreva o texto da cena para ela ser salva — cena sem texto não diz nada.
        </p>
      )}

      {erro && (
        <p
          className={cn(
            'rounded-[8px] border border-[var(--wb-warn-ink)] bg-[var(--wb-warn-soft)]',
            'p-2 text-[11.5px] leading-relaxed text-[var(--wb-warn-ink)]',
          )}
        >
          {erro}
        </p>
      )}
    </div>
  );
}

function CampoSegundo({
  rotulo,
  valor,
  ocupado,
  onAplicar,
}: {
  rotulo: string;
  valor: number;
  ocupado: boolean;
  onAplicar: (valor: number) => void;
}) {
  const [texto, setTexto] = useState(String(valor));
  const [editando, setEditando] = useState(false);

  return (
    <label className="inline-flex items-center gap-0.5">
      <span className="font-code text-[9.5px] text-[var(--wb-text-mute)]">{rotulo}</span>
      <input
        value={editando ? texto : String(valor)}
        disabled={ocupado}
        aria-label={`${rotulo} da cena, em segundos`}
        onFocus={() => {
          setTexto(String(valor));
          setEditando(true);
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          setEditando(false);
          const numero = Number(texto.trim().replace(',', '.'));
          // Texto que não é número mantém o valor anterior: `Number('')` é 0, e
          // um campo que zera sozinho joga a cena para o início do short.
          if (Number.isFinite(numero) && texto.trim() !== '') onAplicar(round2(numero));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setEditando(false);
            e.currentTarget.blur();
          }
        }}
        className="w-[44px] rounded-[5px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-1 py-0.5 text-center font-code text-[10.5px] tabular-nums outline-none focus-visible:border-[var(--wb-accent)] disabled:opacity-50"
      />
    </label>
  );
}

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}
