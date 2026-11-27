// D-154: formulário "burro" de identidade de canal, reusado para criar e editar.
// Sem I/O: recebe os valores iniciais, devolve o payload via `onSubmit` e mostra
// o estado de envio via `pending`. No modo criar expõe o campo `id` (slug); no
// modo editar o id é fixo e só a identidade básica é editável (escopo mínimo).
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAlteracaoPendente } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Canal, PaletaCanal } from '@/features/channels/api/canais';
import { Icon } from '@/upgrade/Icon';

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

/** Os campos de texto sem os espaços das bordas: é assim que vão para o canal. */
function aparados(v: ChannelFormValues): ChannelFormValues {
  return {
    id: v.id.trim(),
    handle: v.handle.trim(),
    nome: v.nome.trim(),
    credito: v.credito.trim(),
    youtube_channel_id: v.youtube_channel_id.trim(),
    paleta: v.paleta,
  };
}

/** D-1197: há alteração quando o digitado difere do que o formulário mostrava ao abrir. */
function identidadeMudou(initial: Canal | undefined, digitado: ChannelFormValues): boolean {
  const gravado: ChannelFormValues = {
    id: initial?.id ?? '',
    handle: initial?.handle ?? '',
    nome: initial?.nome ?? '',
    credito: initial?.credito ?? '',
    youtube_channel_id: initial?.youtube_channel_id ?? '',
    paleta: initial?.paleta ?? PALETA_VAZIA,
  };
  const textos = ['id', 'handle', 'nome', 'credito', 'youtube_channel_id'] as const;
  const cores = ['primaria', 'secundaria', 'acento'] as const;
  return (
    textos.some((campo) => digitado[campo] !== gravado[campo]) ||
    cores.some((cor) => digitado.paleta[cor] !== gravado.paleta[cor])
  );
}

export function ChannelForm({ mode, initial, pending, onSubmit, onCancel }: ChannelFormProps) {
  const [id, setId] = useState(initial?.id ?? '');
  const [handle, setHandle] = useState(initial?.handle ?? '');
  const [nome, setNome] = useState(initial?.nome ?? '');
  const [credito, setCredito] = useState(initial?.credito ?? '');
  const [youtubeChannelId, setYoutubeChannelId] = useState(initial?.youtube_channel_id ?? '');
  const [paleta, setPaleta] = useState<PaletaCanal>(initial?.paleta ?? PALETA_VAZIA);

  const digitado: ChannelFormValues = {
    id, handle, nome, credito, paleta,
    youtube_channel_id: youtubeChannelId,
  };
  // D-1197: o diálogo em volta pergunta antes de descartar o que não foi salvo.
  useAlteracaoPendente(identidadeMudou(initial, digitado));

  const criando = mode === 'criar';
  const idValido = !criando || id.trim().length > 0;

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!idValido || pending) return;
    onSubmit(aparados(digitado));
  };

  const setPaletaCampo = (campo: keyof PaletaCanal, valor: string) =>
    setPaleta((atual) => ({ ...atual, [campo]: valor }));

  return (
    <form onSubmit={submeter} className="grid gap-4">
      {criando && (
        <div className="grid gap-1.5">
          <Label htmlFor="canal-id">Id do canal (slug da pasta)</Label>
          <Input name="id"
            id="canal-id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="ex: meu-canal"
            autoFocus
            required
          />
          <p className="text-xs text-fg-3">
            Vira o nome da pasta em <code>instance/channels/</code>. Não pode ser alterado depois.
          </p>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="canal-nome">Nome de exibição</Label>
        <Input name="nome"
          id="canal-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="ex: Meu Canal"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="canal-handle">Handle</Label>
        <Input name="handle"
          id="canal-handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="ex: @meucanal"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="canal-credito">Crédito</Label>
        <Input name="credito"
          id="canal-credito"
          value={credito}
          onChange={(e) => setCredito(e.target.value)}
          placeholder="ex: Meu Canal"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="canal-youtube-channel-id">Canal-fonte (YouTube)</Label>
        <Input name="youtube_channel_id"
          id="canal-youtube-channel-id"
          value={youtubeChannelId}
          onChange={(e) => setYoutubeChannelId(e.target.value)}
          placeholder="ex: @meucanal ou UCxxxx"
        />
        <p className="text-xs text-fg-3">
          O @handle ou id do canal do YouTube de onde vêm as lives.
        </p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-xs font-medium tracking-[0.08em] text-fg-3">
          Paleta
        </legend>
        <div className="grid grid-cols-3 gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="canal-primaria" className="text-xs">
              Primária
            </Label>
            <Input name="primaria"
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
            <Input name="secundaria"
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
            <Input name="acento"
              id="canal-acento"
              value={paleta.acento}
              onChange={(e) => setPaletaCampo('acento', e.target.value)}
              placeholder="#22c55e"
            />
          </div>
        </div>
      </fieldset>

      <div className="mt-1 flex items-center justify-end gap-2">
        <Button type="button" variant="fantasma" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button variant="secundario" type="submit" disabled={pending || !idValido}>
          {pending && <Icon name="loader-2" className="animate-spin" />}
          {criando ? 'Criar canal' : 'Salvar identidade'}
        </Button>
      </div>
    </form>
  );
}
