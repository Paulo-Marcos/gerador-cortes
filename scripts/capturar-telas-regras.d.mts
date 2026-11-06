// Tipos do capturar-telas-regras.mjs, para o teste do frontend (D-1069).

export type Alvo =
  | { nome: string }
  | { nomeComeca: string }
  | { nomeContem: string }
  | { nomeRegex: string };

export type Candidato = { texto: string; rotulo: string; desabilitado?: boolean };
export type ResultadoDoClique = { achou: boolean; desabilitado: boolean };

export type ProjetoDaLista = {
  id: string;
  arquivo_video_path?: string | null;
  arquivos_limpos?: boolean;
  total_cortes: number;
};

export class ErroDeCaptura extends Error {
  tela: string;
  constructor(tela: string, mensagem: string);
}

export function acharAlvo(candidatos: Candidato[], alvo: Alvo): number;
export function descreverAlvo(alvo: Alvo): string;
export function montarClique(alvo: Alvo): string;
export function conferirClique(
  resultado: ResultadoDoClique | undefined,
  tela: string,
  alvo: Alvo,
  requisito?: string,
): void;
export function conferirAbertura(antes: number, depois: number, tela: string, seletor: string): void;
export function conferirTema(lido: string | null | undefined, pedido: string, tela: string): void;
export function criarRegistroDeHashes(): {
  registrar(tela: string, arquivo: string, bytes: Uint8Array): string;
};
export function escolherProjetosPadrao(
  projetos: ProjetoDaLista[],
  prontosPorProjeto?: Record<string, number>,
): { comVideo: string; multiCortes: string };
