import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { segParaHms } from '@/features/editor/timeUtils';
import { aplicarTempoDigitado, empurrar, PASSOS_FINOS } from './bordasFinas';
import type { Borda, Bordas } from './linhaDoTempoShort';

// D-482: o ajuste que o arraste não alcança.
//
// Três instrumentos para a mesma borda, e cada um serve a um momento:
//
//   - o botão "início aqui" do card — grosso, a partir de onde o player está;
//   - a alça da timeline — visual, você vê onde cai;
//   - este painel — preciso, quando você já sabe o número ou precisa de um
//     quadro a mais.
//
// Não é redundância: nenhum dos três faz o trabalho dos outros dois bem.

interface Props {
  bordas: Bordas;
  duracaoSeg: number;
  ocupado: boolean;
  onAplicar: (bordas: Bordas) => void;
}

export function BordasFinasPanel({ bordas, duracaoSeg, ocupado, onAplicar }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <LinhaDaBorda
        rotulo="início"
        borda="inicio"
        bordas={bordas}
        duracaoSeg={duracaoSeg}
        ocupado={ocupado}
        onAplicar={onAplicar}
      />
      <LinhaDaBorda
        rotulo="fim"
        borda="fim"
        bordas={bordas}
        duracaoSeg={duracaoSeg}
        ocupado={ocupado}
        onAplicar={onAplicar}
      />
    </div>
  );
}

function LinhaDaBorda({
  rotulo,
  borda,
  bordas,
  duracaoSeg,
  ocupado,
  onAplicar,
}: Props & { rotulo: string; borda: Borda }) {
  const valor = borda === 'inicio' ? bordas.inicio : bordas.fim;

  return (
    <div className="flex items-center gap-1">
      <span className="w-11 font-code text-[10.5px] uppercase tracking-wide text-[var(--wb-text-mute)]">
        {rotulo}
      </span>

      {/* Do maior degrau para o menor, indo ao centro: o campo fica entre as
          setas, então empurrar para trás está à esquerda e para frente à
          direita — a mesma direção da timeline logo acima. */}
      {[...PASSOS_FINOS].reverse().map((passo) => (
        <Degrau
          key={`-${passo.rotulo}`}
          titulo={`Recuar ${passo.rotulo}`}
          disabled={ocupado}
          onClick={() => onAplicar(empurrar(bordas, borda, passo, -1, duracaoSeg))}
        >
          <ChevronLeft size={10} aria-hidden />
          {passo.rotulo}
        </Degrau>
      ))}

      <CampoDeTempo
        valor={valor}
        borda={borda}
        bordas={bordas}
        duracaoSeg={duracaoSeg}
        ocupado={ocupado}
        onAplicar={onAplicar}
      />

      {PASSOS_FINOS.map((passo) => (
        <Degrau
          key={`+${passo.rotulo}`}
          titulo={`Avançar ${passo.rotulo}`}
          disabled={ocupado}
          onClick={() => onAplicar(empurrar(bordas, borda, passo, 1, duracaoSeg))}
        >
          {passo.rotulo}
          <ChevronRight size={10} aria-hidden />
        </Degrau>
      ))}
    </div>
  );
}

function Degrau({
  titulo,
  disabled,
  onClick,
  children,
}: {
  titulo: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center rounded-[5px] bg-[var(--wb-bg-inset)] px-1.5 py-1 font-code text-[10px] font-semibold text-[var(--wb-text-dim)] transition-colors hover:text-[var(--wb-text)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}

function CampoDeTempo({
  valor,
  borda,
  bordas,
  duracaoSeg,
  ocupado,
  onAplicar,
}: Props & { valor: number; borda: Borda }) {
  const [texto, setTexto] = useState(() => segParaHms(valor, true));
  const [invalido, setInvalido] = useState(false);

  // O campo é editável, então precisa acompanhar mudanças que vieram de FORA
  // (arraste, nudge, "início aqui") sem atropelar o que está sendo digitado.
  // Enquanto o texto for inválido o operador ainda está no meio de uma edição —
  // sobrescrever ali apagaria o que ele digitou.
  useEffect(() => {
    if (!invalido) setTexto(segParaHms(valor, true));
  }, [valor, invalido]);

  const confirmar = () => {
    const novas = aplicarTempoDigitado(bordas, borda, texto, duracaoSeg);
    if (!novas) {
      setInvalido(true);
      return;
    }
    setInvalido(false);
    onAplicar(novas);
  };

  return (
    <input
      value={texto}
      disabled={ocupado}
      aria-label={`Tempo de ${borda === 'inicio' ? 'início' : 'fim'} do short`}
      aria-invalid={invalido}
      onChange={(e) => {
        setTexto(e.target.value);
        setInvalido(false);
      }}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          // Desistir devolve o valor de verdade, não o rascunho.
          setInvalido(false);
          setTexto(segParaHms(valor, true));
          e.currentTarget.blur();
        }
      }}
      className={cn(
        'w-[92px] rounded-[5px] border bg-[var(--wb-bg-inset)] px-1.5 py-1 text-center font-code text-[11px] tabular-nums text-[var(--wb-text)] outline-none disabled:opacity-45',
        invalido
          ? 'border-[var(--wb-warn-ink)] text-[var(--wb-warn-ink)]'
          : 'border-transparent focus:border-[var(--wb-accent)]',
      )}
    />
  );
}
