import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';
import { useCriarProjeto } from '@/features/projetos/useProjetos';
import { cn } from '@/lib/utils';

// D-1148 (E-069 H-15; DIRECAO §7.1 e §7.12) · Colar o link de uma live.
//
// Um formulário, dois lugares. No canal novo ele É o cartão "Cole o link", e
// "Baixar a live" é a única primária da tela. Com lives na Biblioteca ele abre por
// "Nova live" (secundária) e o envio também é secundário: a primária da tela é a do
// "Continue" (§5, uma por tela). Campo em pílula, da família da busca.

interface Props {
  /** "Baixar a live" é a primária da tela (só no canal novo). */
  primaria?: boolean;
  /** Fechar o formulário; sem isto ele não mostra o "Cancelar" (o canal novo não fecha). */
  onClose?: () => void;
  className?: string;
}

export function NovoProjetoForm({ primaria = false, onClose, className }: Props) {
  const [url, setUrl] = useState('');
  const [canal, setCanal] = useState('');
  const criar = useCriarProjeto();
  const navigate = useNavigate();
  const { notify } = useToast();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    criar.mutate(
      { youtube_url: url.trim(), canal_origem: canal.trim() || undefined },
      {
        // D-746: a live nova abre a tela dela, onde o download e a transcrição aparecem.
        onSuccess: (projeto) => {
          setUrl('');
          setCanal('');
          onClose?.();
          notify('Live adicionada — o download começou.', { tone: 'success' });
          navigate(`/projetos/${projeto.id}`);
        },
        onError: (erro) =>
          notify(erro instanceof Error ? erro.message : 'Não consegui adicionar a live.', { tone: 'error' }),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className={cn('grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end', className)}>
      <Field
        rotulo="Link da live no YouTube"
        obrigatorio
        erro={criar.isError ? `Não deu para adicionar: ${(criar.error as Error).message}` : undefined}
      >
        <Input name="youtube_url" inputMode="url"
          aparencia="sala"
          type="url"
          placeholder="https://youtube.com/watch?v=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="rounded-pilula"
          autoFocus={!primaria}
        />
      </Field>
      <Field rotulo="Canal de origem (opcional)">
        <Input name="canal_origem"
          aparencia="sala"
          placeholder="Nome do canal"
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          className="rounded-pilula"
        />
      </Field>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant={primaria ? 'primario' : 'secundario'}
          size="md"
          carregando={criar.isPending}
        >
          {criar.isPending ? 'Baixando…' : 'Baixar a live'}
        </Button>
        {onClose && (
          <Button type="button" variant="fantasma" size="md" onClick={onClose}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
