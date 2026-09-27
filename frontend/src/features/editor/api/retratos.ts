import { api, dados, type Schema } from '@/shared/api';

// O banco de retratos do canal: quando nem a Wikipedia nem o banco têm foto de
// alguém, o operador cola um link e o app guarda a imagem para as próximas
// cenas. D-723: pelo cliente gerado, no lugar do fetch direto do useEditor.

export type RetratoDoBanco = Schema<'RetratoResponse'>;

export const retratosApi = {
  salvarDeUrl: (nome: string, url: string) =>
    dados(api.POST('/api/retratos/salvar-url', { body: { nome, url } })),
};
