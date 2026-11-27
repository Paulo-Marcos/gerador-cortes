import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { aplicarCampo, CANVAS, type Retangulo } from './arrastarSlot';
import { BlocosArrastaveis } from './BlocosArrastaveis';
import { Icon } from '@/upgrade/Icon';

// D-493: os blocos do palco, arrastáveis sobre a própria prévia.
//
// O overlay em si mora em `BlocosArrastaveis` desde a D-499, quando o recorte
// por short pediu o mesmo gesto sobre o quadro-fonte. Aqui fica o que é do
// PALCO: o quadro é o canvas do short, e o que se grava é um ajuste de slot.
//
// Os quatro modelos deixam de ser gaiola e viram ponto de partida: você pega a
// pessoa ou a tela e move onde quiser, com os números ao lado para fechar.
//
// O overlay fica SOBRE o canvas da prévia, não ao lado: mover um bloco olhando
// para outro lugar da tela é pedir que o operador faça a correspondência de
// cabeça — e essa correspondência é justamente o que a prévia veio eliminar.
//
// O PATCH sai no soltar, nunca durante. Durante o arraste manda o estado local,
// senão o bloco andaria atrás do cursor esperando o servidor.

const ROTULO: Record<string, string> = {
  pessoa: 'pessoa',
  tela: 'tela',
  quadro: 'quadro',
};

interface Props {
  /** Slots resolvidos (modelo + ajuste), como o backend os calculou. */
  slots: Record<string, Retangulo>;
  ativo: boolean;
  onGravar: (ajustes: Record<string, Retangulo>) => void;
  /** D-500: cada movimento, para a prévia redesenhar durante o arraste. */
  onArrastando?: (ajustes: Record<string, Retangulo>) => void;
  /** D-500: soltou — descarta o rascunho e volta ao plano gravado. */
  onSoltou?: () => void;
}

export function EditorDePalco({ slots, ativo, onGravar, onArrastando, onSoltou }: Props) {
  if (!ativo) return null;

  return (
    <BlocosArrastaveis
      blocos={slots}
      limites={CANVAS}
      rotulo={(regiao) => ROTULO[regiao] ?? regiao}
      substantivo="o bloco"
      onArrastando={(regiao, retangulo) => onArrastando?.({ [regiao]: retangulo })}
      onSoltar={(regiao, retangulo) => onGravar({ [regiao]: retangulo })}
      onFim={onSoltou}
    />
  );
}

/** Os mesmos slots em números — para fechar o que o arraste aproximou. */
export function CamposDoPalco({
  slots,
  ajustados,
  ocupado,
  onGravar,
  onDesfazer,
}: {
  slots: Record<string, Retangulo>;
  ajustados: string[];
  ocupado: boolean;
  onGravar: (ajustes: Record<string, Retangulo>) => void;
  onDesfazer: () => void;
}) {
  if (Object.keys(slots).length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-code text-micro text-fg-2">
          blocos do palco
        </span>
        <div className="flex-1" />
        {ajustados.length > 0 && (
          <Button variant="fantasma" size="pq" disabled={ocupado} onClick={onDesfazer}>
            <Icon name="rotate-ccw" />
            voltar ao modelo
          </Button>
        )}
      </div>

      {Object.entries(slots).map(([regiao, retangulo]) => (
        <div key={regiao} className="flex flex-wrap items-center gap-1">
          <span
            className={cn(
              'w-[52px] flex-none font-code text-micro',
              ajustados.includes(regiao)
                ? 'font-bold text-iris'
                : 'text-fg-2',
            )}
            title={ajustados.includes(regiao) ? 'Ajustado por você' : 'Vem do modelo'}
          >
            {ROTULO[regiao] ?? regiao}
          </span>
          {(['x', 'y', 'w', 'h'] as const).map((lado) => (
            <CampoDeLado
              key={lado}
              lado={lado}
              valor={retangulo[lado]}
              ocupado={ocupado}
              onAplicar={(texto) => {
                const novo = aplicarCampo(retangulo, lado, texto);
                if (novo) onGravar({ [regiao]: novo });
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function CampoDeLado({
  lado,
  valor,
  ocupado,
  onAplicar,
}: {
  lado: string;
  valor: number;
  ocupado: boolean;
  onAplicar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(String(valor));
  const [editando, setEditando] = useState(false);

  // Enquanto o operador digita, o valor de fora não atropela o rascunho — mas
  // fora da edição ele manda, para o campo acompanhar o arraste.
  const mostrado = editando ? texto : String(valor);

  return (
    <label className="inline-flex items-center gap-0.5">
      <span className="font-code text-micro text-fg-2">{lado}</span>
      <input name={lado} type="text" inputMode="numeric"
        value={mostrado}
        disabled={ocupado}
        aria-label={`${lado} do bloco`}
        onFocus={() => {
          setTexto(String(valor));
          setEditando(true);
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          setEditando(false);
          onAplicar(texto);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setEditando(false);
            e.currentTarget.blur();
          }
        }}
        className="w-[46px] rounded-[5px] border border-fio-2 bg-painel-solido px-1 py-0.5 text-center font-code text-micro tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:border-iris disabled:opacity-50"
      />
    </label>
  );
}
