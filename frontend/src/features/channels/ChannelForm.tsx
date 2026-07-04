// D-154: formulário "burro" de identidade de canal, reusado para criar e editar.
// Sem I/O: recebe os valores iniciais, devolve o payload via `onSubmit` e mostra
// o estado de envio via `pending`. No modo criar expõe o campo `id` (slug); no
// modo editar o id é fixo e só a identidade básica é editável (escopo mínimo).
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Canal, PaletaCanal } from '@/lib/channelsApi';

export interface ChannelFormValues {
  id: string;
  handle: string;
  nome: string;
  credito: string;
  youtube_channel_id: string;
  paleta: PaletaCanal;
}

interface ChannelFormProps {
  mode: 'criar' | 'editar';
  initial?: Canal;
  pending: boolean;
  onSubmit: (values: ChannelFormValues) => void;
  onCancel: () => void;
}

const PALETA_VAZIA: PaletaCanal = { primaria: '', secundaria: '', acento: '' };

export function ChannelForm({ mode, initial, pending, onSubmit, onCancel }: ChannelFormProps) {
  const [id, setId] = useState(initial?.id ?? '');
  const [handle, setHandle] = useState(initial?.handle ?? '');
  const [nome, setNome] = useState(initial?.nome ?? '');
  const [credito, setCredito] = useState(initial?.credito ?? '');
  const [youtubeChannelId, setYoutubeChannelId] = useState(initial?.youtube_channel_id ?? '');
  const [paleta, setPaleta] = useState<PaletaCanal>(initial?.paleta ?? PALETA_VAZIA);

  const criando = mode === 'criar';
  const idValido = !criando || id.trim().length > 0;

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!idValido || pending) return;
    onSubmit({
      id: id.trim(),
      handle: handle.trim(),
      nome: nome.trim(),
      credito: credito.trim(),
      youtube_channel_id: youtubeChannelId.trim(),
      paleta,
    });
  };

  const setPaletaCampo = (campo: keyof PaletaCanal, valor: string) =>
    setPaleta((atual) => ({ ...atual, [campo]: valor }));

  return (
    <form onSubmit={submeter} className="grid gap-4">
      {criando && (
        <div className="grid gap-1.5">
          <Label htmlFor="canal-id">Id do canal (slug da pasta)</Label>
          <Input
            id="canal-id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="ex: meu-canal"
            autoFocus
            required
          />
          <p className="text-xs text-[var(--wb-text-dim)]">
            Vira o nome da pasta em <code>instance/channels/</code>. Não pode ser alterado depois.
          </p>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="canal-nome">Nome de exibição</Label>
        <Input
          id="canal-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="ex: Meu Canal"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="canal-handle">Handle</Label>
        <Input
          id="canal-handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="ex: @meucanal"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="canal-credito">Crédito</Label>
        <Input
          id="canal-credito"
          value={credito}
          onChange={(e) => setCredito(e.target.value)}
          placeholder="ex: Meu Canal"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="canal-youtube-channel-id">Canal-fonte (YouTube)</Label>
        <Input
          id="canal-youtube-channel-id"
          value={youtubeChannelId}
          onChange={(e) => setYoutubeChannelId(e.target.value)}
          placeholder="ex: @meucanal ou UCxxxx"
        />
        <p className="text-xs text-[var(--wb-text-dim)]">
          O @handle ou id do canal do YouTube de onde vêm as lives.
        </p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
          Paleta
        </legend>
        <div className="grid grid-cols-3 gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="canal-primaria" className="text-xs">
              Primária
            </Label>
            <Input
              id="canal-primaria"
              value={paleta.primaria}
              onChange={(e) => setPaletaCampo('primaria', e.target.value)}
              placeholder="#000000"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="canal-secundaria" className="text-xs">
              Secundária
            </Label>
            <Input
              id="canal-secundaria"
              value={paleta.secundaria}
              onChange={(e) => setPaletaCampo('secundaria', e.target.value)}
              placeholder="#ffffff"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="canal-acento" className="text-xs">
              Acento
            </Label>
            <Input
              id="canal-acento"
              value={paleta.acento}
              onChange={(e) => setPaletaCampo('acento', e.target.value)}
              placeholder="#22c55e"
            />
          </div>
        </div>
      </fieldset>

      <div className="mt-1 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !idValido}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {criando ? 'Criar canal' : 'Salvar identidade'}
        </Button>
      </div>
    </form>
  );
}
