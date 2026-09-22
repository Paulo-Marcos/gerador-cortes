import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import { useCriarProjeto } from '@/hooks/useProjetos';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NovoProjetoForm({ open, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [canal, setCanal] = useState('');
  const criar = useCriarProjeto();
  const navigate = useNavigate();
  const { notify } = useToast();

  if (!open) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    criar.mutate(
      { youtube_url: url.trim(), canal_origem: canal.trim() || undefined },
      {
        // D-746: o formulário só fechava — a live nova sumia no meio da
        // biblioteca e o operador não sabia se tinha dado certo. Agora abre a
        // tela dela, onde o download e a transcrição aparecem.
        onSuccess: (projeto) => {
          setUrl('');
          setCanal('');
          onClose();
          notify('Live adicionada — o download começou.', { tone: 'success' });
          navigate(`/projetos/${projeto.id}`);
        },
        onError: (erro) =>
          notify(erro instanceof Error ? erro.message : 'Não consegui adicionar a live.', {
            tone: 'error',
          }),
      },
    );
  };

  return (
    <Card className="animate-fade-in p-4">
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-[1fr_240px_auto] md:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-url">URL da live (YouTube)</Label>
          <Input
            id="np-url"
            type="url"
            required
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-canal">Canal de origem (opcional)</Label>
          <Input
            id="np-canal"
            placeholder="Nome do canal"
            value={canal}
            onChange={(e) => setCanal(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="submit" disabled={criar.isPending || !url.trim()}>
            {criar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Criar
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </Button>
        </div>
        {criar.isError && (
          <p className="md:col-span-3 text-xs text-error">
            Falha ao criar projeto: {(criar.error as Error).message}
          </p>
        )}
      </form>
    </Card>
  );
}
