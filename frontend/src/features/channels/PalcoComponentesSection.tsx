import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import type { PalcoComponentes, PalcoComponentesEdicao } from '@/features/channels/api/canais';
import { mensagemErro } from '@/lib/mensagemErro';
import { Icon } from '@/upgrade/Icon';
import { urlDaImagem } from './palcoDoCanal';
import {
  useCanais,
  useEnviarImagemDoPalco,
  useGravarPalco,
  usePalcoDoCanal,
  useRemoverImagemDoPalco,
} from './useChannels';

// D-911: os componentes do palco do canal ativo — estilo, cabeçalho e placa —
// editáveis na tela de Canais. O formulário é "burro" (recebe valor e avisa);
// a seção liga os hooks. Imagem sobe na hora (é um arquivo, não um rascunho);
// o resto vai junto no Salvar.

const ESTILOS: { id: 'atual' | 'limpo'; nome: string; descricao: string }[] = [
  {
    id: 'atual',
    nome: 'Atual',
    descricao: 'Chrome chanfrado com brackets verdes, textura de fundo e placa em pílula.',
  },
  {
    id: 'limpo',
    nome: 'Limpo',
    descricao:
      'Fundo grafite chapado, janelas com cantos arredondados, sem linhas. Cabeçalho com imagem, nome e @.',
  },
];

/** O que o operador está editando; vira a edição parcial no Salvar. */
export interface RascunhoDoPalco {
  estilo: 'atual' | 'limpo';
  cabecalhoAtivo: boolean;
  nome: string;
  handle: string;
  placaAtiva: boolean;
}

export function rascunhoDe(palco: PalcoComponentes): RascunhoDoPalco {
  return {
    estilo: palco.estilo === 'limpo' ? 'limpo' : 'atual',
    cabecalhoAtivo: palco.cabecalho.ativo,
    nome: palco.cabecalho.nome,
    handle: palco.cabecalho.handle,
    placaAtiva: palco.placa.ativo,
  };
}

export function edicaoDe(rascunho: RascunhoDoPalco): PalcoComponentesEdicao {
  return {
    estilo: rascunho.estilo,
    cabecalho: { ativo: rascunho.cabecalhoAtivo, nome: rascunho.nome, handle: rascunho.handle },
    placa: { ativo: rascunho.placaAtiva },
  };
}

export function PalcoComponentesForm({
  rascunho,
  palco,
  pendente,
  enviandoImagem,
  onMudar,
  onSalvar,
  onEnviarImagem,
  onRemoverImagem,
}: {
  rascunho: RascunhoDoPalco;
  palco: PalcoComponentes;
  pendente: boolean;
  enviandoImagem: boolean;
  onMudar: (rascunho: RascunhoDoPalco) => void;
  onSalvar: () => void;
  onEnviarImagem: (arquivo: File) => void;
  onRemoverImagem: () => void;
}) {
  const arquivoRef = useRef<HTMLInputElement>(null);
  const imagem = urlDaImagem(palco.cabecalho.imagem_url);
  const imagemPropria = Boolean(palco.cabecalho.imagem);

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSalvar();
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="text-xs font-medium text-text-300">Estilo do palco</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ESTILOS.map((estilo) => {
            const atual = rascunho.estilo === estilo.id;
            return (
              <button
                key={estilo.id}
                type="button"
                aria-pressed={atual}
                onClick={() => onMudar({ ...rascunho, estilo: estilo.id })}
                className={`grid gap-2 rounded-[var(--radius)] border p-4 text-left transition ${
                  atual
                    ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                    : 'border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] hover:border-[var(--wb-border)]'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--wb-text)]">{estilo.nome}</span>
                  {atual && (
                    <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--wb-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                      <Icon name="check" />
                      Selecionado
                    </span>
                  )}
                </span>
                <AmostraDoEstilo estilo={estilo.id} />
                <span className="text-xs text-[var(--wb-text-dim)]">{estilo.descricao}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] p-4">
        <legend className="px-1 text-xs font-medium text-text-300">Cabeçalho do canal</legend>
        <label className="flex items-center gap-2 text-sm text-[var(--wb-text)]">
          <input
            type="checkbox"
            checked={rascunho.cabecalhoAtivo}
            onChange={(e) => onMudar({ ...rascunho, cabecalhoAtivo: e.target.checked })}
          />
          Mostrar o cabeçalho (imagem, nome e @) no palco
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            {imagem ? (
              <img
                src={imagem}
                alt="Imagem do cabeçalho"
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--wb-bg-card)] text-[var(--wb-text-dim)]">
                <Icon name="image-off" />
              </span>
            )}
            <div className="grid gap-1 text-xs text-[var(--wb-text-dim)]">
              <span>{imagemPropria ? 'Imagem do canal' : 'Pose padrão do mascote'}</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={enviandoImagem}
                  onClick={() => arquivoRef.current?.click()}
                >
                  <Icon name="image-plus" />
                  {enviandoImagem ? 'Enviando…' : 'Trocar imagem'}
                </Button>
                {imagemPropria && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={enviandoImagem}
                    onClick={onRemoverImagem}
                  >
                    <Icon name="trash-2" />
                    Voltar ao mascote
                  </Button>
                )}
              </div>
            </div>
            <input
              ref={arquivoRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Imagem do cabeçalho"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) onEnviarImagem(arquivo);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="palco-nome">Nome</Label>
            <Input
              id="palco-nome"
              value={rascunho.nome}
              placeholder={palco.cabecalho.nome_efetivo || 'Nome do canal'}
              onChange={(e) => onMudar({ ...rascunho, nome: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="palco-handle">@ (handle)</Label>
            <Input
              id="palco-handle"
              value={rascunho.handle}
              placeholder={palco.cabecalho.handle_efetivo || '@seucanal'}
              onChange={(e) => onMudar({ ...rascunho, handle: e.target.value })}
            />
          </div>
        </div>
        <p className="text-xs text-[var(--wb-text-dim)]">
          Vazio usa a identidade do canal: <strong>{palco.cabecalho.nome_efetivo || '—'}</strong>{' '}
          <span>{palco.cabecalho.handle_efetivo}</span>.
        </p>
      </fieldset>

      <fieldset className="grid gap-2 rounded-[var(--radius)] border border-[var(--wb-border-soft)] p-4">
        <legend className="px-1 text-xs font-medium text-text-300">Placa do interlocutor</legend>
        <label className="flex items-center gap-2 text-sm text-[var(--wb-text)]">
          <input
            type="checkbox"
            checked={rascunho.placaAtiva}
            onChange={(e) => onMudar({ ...rascunho, placaAtiva: e.target.checked })}
          />
          Mostrar a placa (nome e papel de quem fala, preenchida em cada corte)
        </label>
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente ? 'Salvando…' : 'Salvar palco'}
        </Button>
      </div>
    </form>
  );
}

/** Um desenho mínimo de cada estilo, para escolher sem renderizar. */
function AmostraDoEstilo({ estilo }: { estilo: 'atual' | 'limpo' }) {
  if (estilo === 'limpo') {
    return (
      <svg viewBox="0 0 160 90" className="h-[90px] w-full rounded-[var(--radius-sm)]" aria-hidden>
        <rect width="160" height="90" fill="#121417" />
        <rect x="44" y="10" width="106" height="70" rx="4" fill="#2a2724" />
        <rect x="8" y="56" width="30" height="24" rx="3" fill="#3a3632" />
        <circle cx="12" cy="13" r="4" fill="#8fd07e" />
        <rect x="19" y="10" width="16" height="3" rx="1.5" fill="#F3F2EE" />
        <rect x="8" y="28" width="2" height="18" rx="1" fill="#FF6E5A" />
        <rect x="13" y="29" width="22" height="3" rx="1.5" fill="#F3F2EE" />
        <rect x="13" y="36" width="18" height="2" rx="1" fill="rgba(243,242,238,0.6)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 160 90" className="h-[90px] w-full rounded-[var(--radius-sm)]" aria-hidden>
      <rect width="160" height="90" fill="#0e1410" />
      <path d="M44 10 H140 L150 20 V80 H44 Z" fill="#2a2724" stroke="#ebf5eb" strokeWidth="0.8" />
      <rect x="8" y="56" width="30" height="24" rx="2" fill="#3a3632" stroke="#ebf5eb" strokeWidth="0.8" />
      <path d="M8 12 H34 L38 16 V46 H8 Z" fill="#1c2a22" stroke="#ebf5eb" strokeWidth="0.6" />
      <path d="M4 10 H10 M4 10 V16 M156 80 H150 M156 80 V74" stroke="#6aaa84" strokeWidth="2" fill="none" />
    </svg>
  );
}

export function PalcoComponentesSection() {
  const { notify } = useToast();
  const canaisQuery = useCanais();
  const canalAtivo = canaisQuery.data?.canais.find((c) => c.ativo);
  const palcoQuery = usePalcoDoCanal(canalAtivo?.id);
  const gravar = useGravarPalco();
  const enviarImagem = useEnviarImagemDoPalco();
  const removerImagem = useRemoverImagemDoPalco();

  const [rascunho, setRascunho] = useState<RascunhoDoPalco | null>(null);
  const palco = palcoQuery.data;
  useEffect(() => {
    if (palco) setRascunho(rascunhoDe(palco));
  }, [palco]);

  const aoSalvar = () => {
    if (!canalAtivo || !rascunho) return;
    gravar.mutate(
      { canalId: canalAtivo.id, edicao: edicaoDe(rascunho) },
      {
        onSuccess: () =>
          notify('O próximo render já sai com o palco novo.', {
            tone: 'success',
            title: 'Palco salvo',
          }),
        onError: (erro) => notify(mensagemErro(erro, 'Erro ao salvar o palco.'), { tone: 'error' }),
      },
    );
  };

  return (
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <div className="flex items-center gap-2">
        <Icon name="layout-template" size={20} className="text-[var(--wb-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--wb-text)]">Palco do canal</h2>
      </div>
      <p className="text-sm text-[var(--wb-text-mute)]">
        O <strong>estilo</strong> do palco (fundo, molduras das janelas) e os componentes fixos que
        ele leva: o <strong>cabeçalho</strong> com imagem, nome e @, e a <strong>placa</strong> do
        interlocutor. Vale para o horizontal e para os shorts do <strong>canal ativo</strong>, no
        próximo render; a geometria das janelas continua a de cada corte.
      </p>

      {canaisQuery.isSuccess && !canalAtivo && (
        <p className="text-sm text-[var(--wb-text-dim)]">
          Nenhum canal ativo. Selecione um canal para editar o palco.
        </p>
      )}
      {palcoQuery.isLoading && (
        <p className="flex items-center gap-2 text-sm text-[var(--wb-text-mute)]">
          <Icon name="loader-2" size={16} className="animate-spin" />
          Carregando o palco…
        </p>
      )}
      {palcoQuery.isError && (
        <p className="text-sm text-[var(--wb-err)]">
          {mensagemErro(palcoQuery.error, 'Não foi possível carregar o palco.')}
        </p>
      )}

      {canalAtivo && palco && rascunho && (
        <PalcoComponentesForm
          rascunho={rascunho}
          palco={palco}
          pendente={gravar.isPending}
          enviandoImagem={enviarImagem.isPending || removerImagem.isPending}
          onMudar={setRascunho}
          onSalvar={aoSalvar}
          onEnviarImagem={(arquivo) =>
            enviarImagem.mutate(
              { canalId: canalAtivo.id, arquivo },
              {
                onError: (erro) =>
                  notify(mensagemErro(erro, 'Erro ao enviar a imagem.'), { tone: 'error' }),
              },
            )
          }
          onRemoverImagem={() =>
            removerImagem.mutate(canalAtivo.id, {
              onError: (erro) =>
                notify(mensagemErro(erro, 'Erro ao remover a imagem.'), { tone: 'error' }),
            })
          }
        />
      )}
    </section>
  );
}
