// D-908: os blocos de publicação de UM destino, editáveis. Formulário burro:
// recebe o destino (valor do canal + padrão) e devolve os parâmetros via
// `onSave`; reset e sugestão são delegados. Ressincroniza quando o destino muda.
//
// "N shorts em X horas, depois o dia seguinte" cabe aqui sem campo próprio:
// um bloco só, N por bloco e intervalo X/N — e a nota embaixo diz isso.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  DestinoEscalonado,
  ParametrosDoDestino,
} from '@/features/channels/api/escalonamento';
import { cn } from '@/lib/utils';
import { Icon } from '@/upgrade/Icon';

interface Props {
  destino: DestinoEscalonado;
  diasDaSemana: string[];
  pending: boolean;
  onSave: (parametros: ParametrosDoDestino) => void;
  onReset: () => void;
  onSugerir: () => Promise<string[]>;
}

/** Como o padrão se lê numa linha: "12:00, 18:00 · 4 por bloco · até 8 por dia · 15 min". */
export function resumoDosParametros(p: ParametrosDoDestino): string {
  return `${p.blocos.join(', ')} · ${p.itens_por_bloco} por bloco · até ${p.teto_por_dia} por dia · ${p.intervalo_minimo_min} min entre itens`;
}

export function parametrosValidos(p: ParametrosDoDestino): boolean {
  return (
    p.blocos.length > 0 &&
    p.blocos.every((b) => /^\d{2}:\d{2}$/.test(b)) &&
    p.itens_por_bloco >= 1 &&
    p.teto_por_dia >= 1 &&
    p.intervalo_minimo_min >= 1 &&
    p.dias_ativos.length > 0
  );
}

export function BlocosDoDestinoForm({
  destino,
  diasDaSemana,
  pending,
  onSave,
  onReset,
  onSugerir,
}: Props) {
  const [valores, setValores] = useState<ParametrosDoDestino>(destino.parametros);
  const [sugerindo, setSugerindo] = useState(false);

  useEffect(() => {
    setValores(destino.parametros);
  }, [destino.parametros]);

  const mudar = (parte: Partial<ParametrosDoDestino>) =>
    setValores((atual) => ({ ...atual, ...parte }));
  const valido = parametrosValidos(valores);

  const sugerir = async () => {
    setSugerindo(true);
    try {
      mudar({ blocos: await onSugerir() });
    } finally {
      setSugerindo(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valido) onSave(valores);
      }}
      className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg)] p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-bold text-[var(--wb-text)]">{destino.rotulo}</h3>
        {destino.personalizado && (
          <span className="rounded-full border border-[var(--wb-border-soft)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--wb-text-dim)]">
            personalizado
          </span>
        )}
        <span className="ml-auto text-[11px] text-[var(--wb-text-dim)]" title="Valor padrão (reset)">
          padrão: {resumoDosParametros(destino.padrao)}
        </span>
      </div>

      <div className="grid gap-2">
        <span className="text-xs font-medium text-[var(--wb-text-mute)]">
          Blocos do dia (hora em que um grupo sai)
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {valores.blocos.map((bloco, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <Input
                type="time"
                step={300}
                aria-label={`Bloco ${i + 1}`}
                value={bloco}
                onChange={(e) =>
                  mudar({ blocos: valores.blocos.map((b, j) => (j === i ? e.target.value : b)) })
                }
                className="w-[110px]"
              />
              <button
                type="button"
                aria-label={`Remover bloco ${i + 1}`}
                disabled={valores.blocos.length === 1}
                onClick={() => mudar({ blocos: valores.blocos.filter((_, j) => j !== i) })}
                className="text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] disabled:opacity-30"
              >
                <Icon name="x" />
              </button>
            </span>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => mudar({ blocos: [...valores.blocos, '20:00'] })}
          >
            <Icon name="plus" />
            bloco
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={sugerindo || pending}
            title="Realinha os mesmos blocos à janela forte da referência do público"
            onClick={() => void sugerir()}
          >
            <Icon name={sugerindo ? 'loader-2' : 'sparkle'} className={cn(sugerindo && 'animate-spin')} />
            sugerir pela referência
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <CampoNumero
          id={`${destino.destino}-itens`}
          rotulo="Itens por bloco"
          valor={valores.itens_por_bloco}
          onChange={(v) => mudar({ itens_por_bloco: v })}
        />
        <CampoNumero
          id={`${destino.destino}-teto`}
          rotulo="Teto por dia"
          valor={valores.teto_por_dia}
          onChange={(v) => mudar({ teto_por_dia: v })}
        />
        <CampoNumero
          id={`${destino.destino}-intervalo`}
          rotulo="Intervalo mínimo (min)"
          valor={valores.intervalo_minimo_min}
          onChange={(v) => mudar({ intervalo_minimo_min: v })}
        />
      </div>

      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-[var(--wb-text-mute)]">Dias ativos</span>
        <div className="flex flex-wrap gap-1.5">
          {diasDaSemana.map((nome, dia) => {
            const ligado = valores.dias_ativos.includes(dia);
            return (
              <button
                key={dia}
                type="button"
                aria-pressed={ligado}
                onClick={() =>
                  mudar({
                    dias_ativos: ligado
                      ? valores.dias_ativos.filter((d) => d !== dia)
                      : [...valores.dias_ativos, dia].sort(),
                  })
                }
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px] capitalize',
                  ligado
                    ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-text)]'
                    : 'border-[var(--wb-border)] text-[var(--wb-text-dim)]',
                )}
              >
                {nome}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-[var(--wb-text-mute)]">
        Quando um bloco enche, o próximo item vai para o bloco seguinte; quando o dia enche, para o
        próximo dia ativo. "N em X horas e depois amanhã" é um bloco só com N itens e intervalo X/N.
      </p>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={pending || !destino.personalizado}
          className="inline-flex items-center gap-1 text-xs text-[var(--wb-text-mute)] hover:text-[var(--wb-text)] disabled:opacity-40"
        >
          <Icon name="rotate-ccw" />
          Voltar ao padrão
        </button>
        <Button type="submit" size="sm" disabled={pending || !valido}>
          Salvar {destino.rotulo}
        </Button>
      </div>
    </form>
  );
}

function CampoNumero({
  id,
  rotulo,
  valor,
  onChange,
}: {
  id: string;
  rotulo: string;
  valor: number;
  onChange: (valor: number) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-[var(--wb-text-mute)]">
        {rotulo}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        /* `step="any"`: com `min=1` e um passo de 5, o navegador recusava 180
           (a base do passo é o `min`) e o submit morria antes do React, sem
           aviso. A grade de 5 do TikTok é regra do backend, não do campo. */
        step="any"
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24"
      />
    </div>
  );
}
