import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortsApi } from './shortsApi';

// D-499: a cor por trás do short, escolhida na paleta do canal.
//
// O fundo aparece onde o conteúdo não preenche o slot — a faixa acima e abaixo
// da tela compartilhada, a sobra em volta de um insert. É o que se vê mais
// tempo depois do rosto, e até aqui era uma constante no código.
//
// As cores vêm do backend, que as lê do tema. Cravá-las aqui criaria a segunda
// fonte de sempre: o canal trocaria a paleta e o seletor seguiria oferecendo as
// antigas, sem nada ligando uma coisa à outra. O que se grava é a CHAVE, não o
// hex, pelo mesmo motivo — hex gravado congela a paleta do dia.

export const FUNDOS_KEY = ['shorts', 'palco', 'fundos'] as const;

interface Props {
  /** A chave gravada no short. Vazio = o default do canal. */
  escolhido: string;
  ocupado: boolean;
  onEscolher: (chave: string) => void;
}

export function SeletorDeFundo({ escolhido, ocupado, onEscolher }: Props) {
  // A paleta do canal muda por deploy, não por clique: cachear sem revalidar
  // evita uma consulta por candidato aberto.
  const { data } = useQuery({
    queryKey: FUNDOS_KEY,
    queryFn: shortsApi.fundosDoPalco,
    staleTime: Infinity,
  });

  const fundos = data?.fundos ?? [];
  if (fundos.length === 0) return null;

  // Sem escolha, o marcado é o default — e não "nenhum". Deixar tudo apagado
  // sugeriria que o short saiu sem fundo, quando ele sempre tem um.
  const ativo = escolhido || (fundos.find((f) => f.padrao)?.chave ?? '');

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
        fundo
      </span>
      {fundos.map((fundo) => (
        <button
          key={fundo.chave}
          type="button"
          disabled={ocupado}
          title={`${fundo.chave}${fundo.padrao ? ' · padrão do canal' : ''}`}
          aria-label={`Fundo ${fundo.chave}`}
          aria-pressed={fundo.chave === ativo}
          // Marcar o que já está marcado volta ao default — é como se desfaz
          // uma escolha sem precisar de um botão "limpar" só para isso.
          onClick={() => onEscolher(fundo.chave === escolhido ? '' : fundo.chave)}
          style={{ backgroundColor: fundo.cor }}
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-[6px] border transition-transform disabled:opacity-50',
            fundo.chave === ativo
              ? 'scale-110 border-[var(--wb-accent)] ring-2 ring-[var(--wb-accent)]/40'
              : 'border-[var(--wb-border)] hover:scale-105',
          )}
        >
          {fundo.chave === ativo && (
            <Check size={11} className="drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]" color="#fff" />
          )}
        </button>
      ))}
    </div>
  );
}
