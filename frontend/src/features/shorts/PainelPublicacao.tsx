// D-468/469/470: para onde o short pronto vai.
//
// A tela trata os dois modos igual de propósito. Para o operador, "publicar no
// YouTube" e "preparar para o TikTok" são a mesma intenção — o que muda é onde
// o trabalho termina: num caso o vídeo já subiu, no outro abre uma pasta pronta
// para ele colar no celular. O rótulo do botão é o que conta essa diferença.
//
// Os avisos aparecem ANTES do botão. Descobrir que o vídeo passa do limite
// depois de subir é o erro que esta tela existe para evitar.
import { FileText, Image, Send, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PacotePublicacao } from './shortsApi';
import {
  useCapaDoShort,
  usePostDoShort,
  usePreviaPublicacao,
  usePublicarShort,
} from './useShortsDoCorte';
import { comSegundos } from './capaDoShort';
import type { ShortSugerido } from './shortsApi';

interface Props {
  /** D-565: o short inteiro, e nao so o id — o modal do post precisa dele. */
  short: ShortSugerido;
  /**
   * D-585: quem ABRE o post e a capa agora e de fora.
   *
   * Os dois modais saíram daqui porque o "Finalizar" precisa abrir o post
   * ANTES de este painel existir — ele só é montado quando o short já está
   * renderizado, e o post se escreve enquanto o render corre. Deixá-los aqui
   * obrigaria a montar o painel cedo só para alcançar um modal, e o painel
   * inteiro passaria a ter de saber lidar com um MP4 que ainda não existe.
   */
  onEscreverPost: () => void;
  onEscolherCapa: () => void;
}

export function PainelPublicacao({ short, onEscreverPost, onEscolherCapa }: Props) {
  const shortId = short.id;
  const previa = usePreviaPublicacao(shortId);
  const publicar = usePublicarShort();
  const post = usePostDoShort(shortId);
  const capa = useCapaDoShort(shortId);

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* D-565 (onda 3): o texto que vai junto com o video.
          Fica ANTES dos destinos por duas razoes. A primeira e de ordem: e a
          ultima coisa a decidir antes de subir, e descobrir que o titulo estava
          errado depois de publicado e o erro que este painel existe para evitar.
          A segunda e que ele fica FORA dos early-returns da previa — o texto nao
          depende do arquivo estar em disco, e prende-lo ali faria um MP4 sumido
          levar junto o acesso ao post, que continua editavel. */}
      <button
        type="button"
        onClick={onEscreverPost}
        className="flex items-center gap-2 rounded-[8px] border border-[var(--wb-border-soft)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--wb-bg-inset)]"
      >
        <FileText size={13} className="flex-none opacity-70" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-[var(--wb-text)]">
            {post.data?.titulo || 'Escrever o post'}
          </span>
          <span className="block truncate text-[11px] text-[var(--wb-text-mute)]">
            {post.data?.gerado
              ? `${post.data.hashtags.length} hashtags`
              : `sem texto proprio — vai publicar como "${short.titulo}"`}
          </span>
        </span>
      </button>

      {/* D-565 (onda 4): o quadro que a plataforma mostra na grade do perfil.
          Ao lado do post porque as duas sao a mesma decisao — o que acompanha o
          video — e ambas sao as ultimas antes de subir. */}
      <button
        type="button"
        onClick={onEscolherCapa}
        className="flex items-center gap-2 rounded-[8px] border border-[var(--wb-border-soft)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--wb-bg-inset)]"
      >
        <Image size={13} className="flex-none opacity-70" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-[var(--wb-text)]">
            {capa.data?.tem_capa ? 'Capa escolhida' : 'Escolher a capa'}
          </span>
          <span className="block truncate text-[11px] text-[var(--wb-text-mute)]">
            {capa.data?.tem_capa
              ? `o quadro de ${comSegundos(capa.data.instante_seg)}`
              : 'sem capa — a plataforma escolhe um quadro sozinha'}
          </span>
        </span>
      </button>

      {previa.isLoading && (
        <p className="text-[12px] text-[var(--wb-text-mute)]">Montando os pacotes…</p>
      )}
      {previa.isError && (
        <p className="text-[12px] text-[var(--wb-text-dim)]">
          {(previa.error as Error)?.message ?? 'nao consegui montar os pacotes'}
        </p>
      )}

      {(previa.data?.pacotes ?? []).map((pacote) => (
        <Destino
          key={pacote.plataforma}
          pacote={pacote}
          ocupado={publicar.isPending}
          onPublicar={() => publicar.mutate({ shortId, plataforma: pacote.plataforma })}
        />
      ))}
      {publicar.isSuccess && (
        <p className="text-[12px] text-[var(--wb-ok-ink)]">
          {publicar.data?.url ?? publicar.data?.pasta ?? 'pronto'}
        </p>
      )}
      {/* D-588: sucesso com ressalva. O short subiu, mas a capa pode nao ter
          entrado — e so este aviso separa isso de "deu tudo certo". */}
      {publicar.isSuccess &&
        (publicar.data?.avisos ?? []).map((aviso) => (
          <p key={aviso} className="text-[11.5px] text-[var(--wb-warn-ink,var(--wb-text-dim))]">
            ⚠ {aviso}
          </p>
        ))}
      {publicar.isError && (
        <p className="text-[12px] text-[var(--wb-text-dim)]">
          {(publicar.error as Error)?.message ?? 'falhou'}
        </p>
      )}
    </div>
  );
}

function Destino({
  pacote,
  ocupado,
  onPublicar,
}: {
  pacote: PacotePublicacao;
  ocupado: boolean;
  onPublicar: () => void;
}) {
  const porApi = pacote.modo === 'api';

  return (
    <article className="rounded-[8px] border border-[var(--wb-border)] p-2.5">
      <div className="flex items-center gap-2">
        <h4 className="flex-1 truncate text-[13px] font-bold">{pacote.rotulo}</h4>
        <button
          type="button"
          onClick={onPublicar}
          disabled={ocupado}
          className={cn(
            'inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
            porApi
              ? 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
              : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]',
          )}
        >
          {porApi ? <Send size={12} aria-hidden /> : <Upload size={12} aria-hidden />}
          {porApi ? 'publicar' : 'preparar pacote'}
        </button>
      </div>

      {pacote.avisos.map((aviso) => (
        <p key={aviso} className="mt-1 text-[11.5px] text-[var(--wb-warn-ink,var(--wb-text-dim))]">
          ⚠ {aviso}
        </p>
      ))}

      <p className="mt-1 truncate text-[11.5px] text-[var(--wb-text-mute)]" title={pacote.titulo}>
        {pacote.titulo_visivel}
        {pacote.titulo.length > pacote.titulo_visivel.length && '…'}
      </p>
    </article>
  );
}
