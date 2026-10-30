// D-997: formulário "burro" da faixa de duração dos shorts. Sem I/O: recebe a
// faixa do canal e devolve a nova por `onSave`. A regra (mínimo menor que o
// máximo) é do domínio no backend; aqui ela só se repete para avisar antes do
// clique, e o erro que o servidor devolver aparece no mesmo lugar.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FaixaDoShort, FaixaDoShortPayload } from '@/features/channels/api/faixaDoShort';
import { Icon } from '@/upgrade/Icon';

interface Props {
  faixa: FaixaDoShort;
  pending: boolean;
  erroDoServidor: string | null;
  onSave: (faixa: FaixaDoShortPayload) => void;
}

/** O aviso da faixa digitada, ou null quando ela pode ser salva. */
export function erroDaFaixa(minimo: string, maximo: string): string | null {
  const min = Number(minimo);
  const max = Number(maximo);
  if (minimo.trim() === '' || maximo.trim() === '' || !Number.isFinite(min) || !Number.isFinite(max)) {
    return 'Preencha a duração mínima e a máxima, em segundos.';
  }
  if (min <= 0) return 'A duração mínima do short precisa ser maior que zero.';
  if (min >= max) return `A duração mínima (${min} s) precisa ser menor que a máxima (${max} s).`;
  return null;
}

export function FaixaDoShortForm({ faixa, pending, erroDoServidor, onSave }: Props) {
  const [minimo, setMinimo] = useState(String(faixa.duracao_min_seg));
  const [maximo, setMaximo] = useState(String(faixa.duracao_max_seg));

  // Ressincroniza quando a faixa gravada muda (recarga ou salvamento).
  useEffect(() => {
    setMinimo(String(faixa.duracao_min_seg));
    setMaximo(String(faixa.duracao_max_seg));
  }, [faixa.duracao_min_seg, faixa.duracao_max_seg]);

  const erro = erroDaFaixa(minimo, maximo) ?? erroDoServidor;
  const bloqueado = pending || erroDaFaixa(minimo, maximo) !== null;

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    if (bloqueado) return;
    onSave({ duracao_min_seg: Number(minimo), duracao_max_seg: Number(maximo) });
  };

  const voltarAoPadrao = () => {
    setMinimo(String(faixa.padrao_min_seg));
    setMaximo(String(faixa.padrao_max_seg));
  };

  return (
    <form onSubmit={submeter} className="grid gap-3">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <Label htmlFor="faixa-short-min">Mínimo (s)</Label>
          <Input
            id="faixa-short-min"
            type="number"
            inputMode="numeric"
            step="any"
            value={minimo}
            onChange={(e) => setMinimo(e.target.value)}
            aria-invalid={erro !== null}
            className="w-24"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="faixa-short-max">Máximo (s)</Label>
          <Input
            id="faixa-short-max"
            type="number"
            inputMode="numeric"
            step="any"
            value={maximo}
            onChange={(e) => setMaximo(e.target.value)}
            aria-invalid={erro !== null}
            className="w-24"
          />
        </div>
        <span className="pb-2 text-[11px] text-[var(--wb-text-dim)]">
          padrão: {faixa.padrao_min_seg} a {faixa.padrao_max_seg} s
        </span>
      </div>

      {erro && (
        <p role="alert" className="text-xs text-error">
          {erro}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={voltarAoPadrao}
          disabled={pending}
          className="inline-flex items-center gap-1 text-xs text-[var(--wb-text-mute)] hover:text-[var(--wb-text)] disabled:opacity-40"
        >
          <Icon name="rotate-ccw" />
          Voltar ao padrão
        </button>
        <Button type="submit" disabled={bloqueado}>
          {pending && <Icon name="loader-2" className="animate-spin" />}
          Salvar faixa
        </Button>
      </div>
    </form>
  );
}
