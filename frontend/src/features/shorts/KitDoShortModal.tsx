// D-611: o kit de um short — tudo o que se cola numa rede, pronto para copiar.
//
// ## Por que os textos vêm do backend, e não do post cru
//
// Porque cada rede recebe um texto DIFERENTE do mesmo post: o YouTube corta o
// título em 100, o Instagram leva no máximo 5 hashtags e nenhum link, e TikTok e
// Instagram não têm título — têm uma legenda só. Quem sabe essas regras é o
// `adaptar` do backend, o mesmo que os robôs usam. Montar aqui seria manter uma
// segunda cópia das regras, e o kit colaria um texto que o robô não colaria.
//
// ## Por que só texto
//
// O vídeo e a capa já estão no cartão. O kit é o que falta quando o upload é à
// mão: abrir a rede e colar, campo por campo, sem voltar ao editor do post.
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { copyTextToClipboard } from '@/lib/clipboard';
import type { PacotePublicacao, ShortIdentificado } from './shortsApi';
import { usePreviaPublicacao } from './useShortsDoCorte';

interface Props {
  open: boolean;
  onClose: () => void;
  short: ShortIdentificado;
}

export function KitDoShortModal({ open, onClose, short }: Props) {
  const previa = usePreviaPublicacao(open ? short.id : null);
  const cliente = useQueryClient();

  // O post pode ter mudado desde a última abertura (o modal do post grava sem
  // tocar nesta consulta). O kit que copia texto velho é pior que kit nenhum.
  useEffect(() => {
    if (open) void cliente.invalidateQueries({ queryKey: ['shorts', 'publicacao', short.id] });
  }, [open, short.id, cliente]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Kit de publicação"
      description={short.titulo}
      size="xl"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {previa.isLoading && (
        <p className="text-[12px] text-[var(--wb-text-mute)]">Montando os textos de cada rede…</p>
      )}
      {previa.isError && (
        <p className="text-[12px] text-[var(--wb-text-dim)]">
          {(previa.error as Error)?.message ?? 'não consegui montar os textos'}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {(previa.data?.pacotes ?? []).map((pacote) => (
          <KitDaRede key={pacote.plataforma} pacote={pacote} />
        ))}
      </div>
    </Modal>
  );
}

function KitDaRede({ pacote }: { pacote: PacotePublicacao }) {
  // O YouTube é a única das três com campo de título; nas outras o título é a
  // primeira linha da legenda — mostrar os dois separados convidaria a colar
  // o título duas vezes.
  const temTitulo = pacote.plataforma === 'youtube_shorts';

  return (
    <article className="flex flex-col gap-2 rounded-[9px] border border-[var(--wb-border)] p-2.5">
      <h4 className="text-[13px] font-bold">{pacote.rotulo}</h4>
      {pacote.avisos.map((aviso) => (
        <p key={aviso} className="text-[11px] text-[var(--wb-warn-ink,var(--wb-text-dim))]">
          ⚠ {aviso}
        </p>
      ))}
      {temTitulo ? (
        <>
          <CampoCopiavel rotulo="Título" texto={pacote.titulo} linhas={2} />
          <CampoCopiavel rotulo="Descrição" texto={pacote.descricao} linhas={7} />
        </>
      ) : (
        <CampoCopiavel rotulo="Legenda" texto={pacote.legenda} linhas={9} />
      )}
      <CampoCopiavel rotulo="Hashtags" texto={pacote.hashtags.join(' ')} linhas={2} />
    </article>
  );
}

function CampoCopiavel({ rotulo, texto, linhas }: { rotulo: string; texto: string; linhas: number }) {
  // `falhou` existe porque o navegador pode recusar a área de transferência (aba
  // sem foco, permissão negada) — e um clique mudo faria colar o texto ANTERIOR.
  const [resultado, setResultado] = useState<'copiado' | 'falhou' | null>(null);

  useEffect(() => {
    if (!resultado) return;
    const id = window.setTimeout(() => setResultado(null), 1800);
    return () => window.clearTimeout(id);
  }, [resultado]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--wb-text-mute)]">
          {rotulo}
          <span className="ml-1 font-code normal-case tracking-normal">{texto.length}</span>
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={!texto}
          onClick={async () =>
            setResultado((await copyTextToClipboard(texto)) ? 'copiado' : 'falhou')
          }
          aria-label={`Copiar ${rotulo.toLowerCase()}`}
        >
          {resultado === 'copiado' ? <Check aria-hidden /> : <Copy aria-hidden />}
          {resultado === 'copiado'
            ? 'copiado'
            : resultado === 'falhou'
              ? 'não copiou — selecione e copie'
              : 'copiar'}
        </Button>
      </div>
      <textarea
        readOnly
        value={texto || '—'}
        rows={linhas}
        className="w-full resize-none rounded-[7px] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2 text-[12px] leading-snug text-[var(--wb-text)]"
      />
    </div>
  );
}
