import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';
import { mensagemErro } from '@/lib/mensagemErro';
import { api, dados } from '@/shared/api';

// D-1172 (E-069 H-21; DIRECAO §7.7) · "Como o app chama você": o nome do operador, da
// aplicação e não do canal (D-1129, `GET`/`PUT /api/operador`). A saudação da Biblioteca lê
// a MESMA chave de cache (`['operador']`): salvar aqui já atualiza lá. Vazio é válido: sem
// nome, a saudação sai sem ele.

export const CHAVE_DO_OPERADOR = ['operador'] as const;

export const operadorApi = {
  ler: () => dados(api.GET('/api/operador')),
  definir: (nome: string) => dados(api.PUT('/api/operador', { body: { nome } })),
};

export function NomeDoOperador() {
  const { notify } = useToast();
  const qc = useQueryClient();
  const consulta = useQuery({
    queryKey: CHAVE_DO_OPERADOR,
    queryFn: operadorApi.ler,
    staleTime: 5 * 60_000,
  });
  const salvo = consulta.data?.nome ?? '';
  const [rascunho, setRascunho] = useState(salvo);

  // O campo nasce com o nome gravado e volta a ele quando a gravação o devolve normalizado.
  useEffect(() => setRascunho(salvo), [salvo]);

  const gravar = useMutation({
    mutationFn: operadorApi.definir,
    onSuccess: (res) => {
      qc.setQueryData(CHAVE_DO_OPERADOR, res);
      notify(res.nome ? `Pronto: o app agora chama você de ${res.nome}.` : 'Nome removido.', {
        tone: 'success',
      });
    },
    onError: (erro) =>
      notify(mensagemErro(erro, 'Não foi possível gravar o nome.'), { tone: 'error' }),
  });

  const aoEnviar = (e: FormEvent) => {
    e.preventDefault();
    gravar.mutate(rascunho.trim());
  };

  return (
    <section
      data-sala=""
      aria-label="Como o app chama você"
      className="grid gap-3 rounded-painel border border-fio bg-vidro p-5 shadow-topo"
    >
      <h2 className="text-secao text-fg">Como o app chama você</h2>
      <form onSubmit={aoEnviar} className="flex flex-wrap items-end gap-3">
        <Field
          rotulo="Seu nome"
          ajuda="Aparece na saudação da Biblioteca. Vale para o app todo, não para um canal."
          className="min-w-[260px] flex-1"
        >
          <Input
            aparencia="sala"
            value={rascunho}
            maxLength={60}
            autoComplete="given-name"
            onChange={(e) => setRascunho(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          variant="secundario"
          carregando={gravar.isPending}
          disabled={rascunho.trim() === salvo}
        >
          Salvar nome
        </Button>
      </form>
    </section>
  );
}
