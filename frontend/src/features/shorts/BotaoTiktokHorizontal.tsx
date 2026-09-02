import { useState } from 'react';
import { Check, ExternalLink, Loader2, Send } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { shortsApi } from './shortsApi';

// D-503: o corte HORIZONTAL indo para o TikTok, num clique.
//
// O TikTok aceita 16:9, e o MP4 já existe — é o mesmo que foi para o YouTube.
// Não há render novo: só metadados adaptados e uma pasta pronta.
//
// ## O que esta "macro" faz, e o que ela deliberadamente não faz
//
// FAZ: monta o pacote, abre a pasta no explorador (o app roda local), copia a
// legenda para a área de transferência e abre a página de upload numa aba.
// Sobra arrastar o arquivo e colar.
//
// NÃO FAZ: logar. Automatizar o login exigiria guardar a senha do operador e
// viola os Termos do TikTok, que proíbem acesso automatizado. O risco não é a
// macro falhar — é a CONTA ser banida, e aí ele perde o canal, não a
// automação. Abrindo a aba, o navegador dele já está logado e nenhuma
// credencial passa por aqui.
//
// Publicar por API também não resolveria hoje: cliente não auditado só posta
// SELF_ONLY, com a conta privada no momento do post.

interface Props {
  corteId: string;
  /** Some quando não há MP4 final — não há o que publicar. */
  habilitado: boolean;
}

export function BotaoTiktokHorizontal({ corteId, habilitado }: Props) {
  const [copiada, setCopiada] = useState(false);

  const staging = useMutation({
    mutationFn: () => shortsApi.stagingTiktokHorizontal(corteId),
    onSuccess: async (dados) => {
      const legenda = [dados.descricao, (dados.hashtags ?? []).join(' ')]
        .filter(Boolean)
        .join('\n\n');
      try {
        if (legenda) {
          await navigator.clipboard.writeText(legenda);
          setCopiada(true);
        }
      } catch {
        // Área de transferência negada (foco, permissão). O texto está no
        // `pacote.txt` dentro da pasta que acabou de abrir, então o operador
        // não fica sem ele — só não ganha o atalho.
        setCopiada(false);
      }
      // A aba por último: abrir antes tiraria o foco da página e a cópia
      // falharia — a API de clipboard exige documento em foco.
      window.open(dados.url_upload, '_blank', 'noopener');
    },
  });

  if (!habilitado) return null;

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        disabled={staging.isPending}
        onClick={() => staging.mutate()}
        title="Monta o pacote, abre a pasta e a página de upload. O login é seu, no navegador."
      >
        {staging.isPending ? <Loader2 className="animate-spin" /> : <Send />}
        TikTok (horizontal)
      </Button>

      {staging.isSuccess && (
        <p className="flex flex-wrap items-center gap-1 text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
          {copiada ? (
            <>
              <Check size={11} className="text-[var(--wb-ok-ink)]" aria-hidden />
              Legenda copiada.
            </>
          ) : (
            <>A legenda está no `pacote.txt` da pasta.</>
          )}
          <ExternalLink size={11} aria-hidden />
          Arraste o MP4 na aba que abriu.
          {staging.data?.erro_ao_abrir && (
            <span className="text-[var(--wb-warn-ink)]">
              Não consegui abrir a pasta: {staging.data.pasta}
            </span>
          )}
        </p>
      )}

      {staging.isError && (
        <p className="text-[11px] text-[var(--wb-warn-ink)]">
          {(staging.error as Error)?.message ?? 'não consegui montar o pacote'}
        </p>
      )}
    </div>
  );
}
