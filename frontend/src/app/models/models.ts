/**
 * Modelos TypeScript — espelham os schemas do backend FastAPI
 */

export type StatusProjeto =
    | 'pendente' | 'baixando' | 'transcrevendo'
    | 'pronto' | 'analisando' | 'analisado' | 'erro';

export type StatusCorte =
    | 'proposto' | 'aprovado' | 'rejeitado' | 'editado' | 'processado';

export interface Projeto {
    id: string;
    youtube_url: string;
    titulo_live: string;
    canal_origem: string;
    duracao_segundos: number;
    status: StatusProjeto;
    progresso_download: number;
    arquivo_video_path: string;
    criado_em: string;
}

export interface Desvio {
    inicio_hms: string;
    fim_hms: string;
    motivo: string;
}

export interface Corte {
    id: string;
    projeto_id: string;
    numero: number;
    titulo_proposto: string;
    resumo: string;
    tema_central: string;
    inicio_hms: string;
    fim_hms: string;
    inicio_seg: number;
    fim_seg: number;
    desvios: Desvio[];
    status: StatusCorte;
    arquivo_clip_path: string;
    criado_em: string;
}

export interface MetadadoCorte {
    id: string;
    corte_id: string;
    titulo_youtube: string;
    descricao_youtube: string;
    tags_youtube: string[];
    opcoes_titulo: string[];
    opcoes_texto_capa: string[];
    texto_capa: string;
    link_live_com_timestamp: string;
    canal_credito: string;
    prompt_thumbnail: string;
    thumbnail_path: string;
    numero_serie: number;
    cor_serie: string;
    criado_em: string;
}

export interface StatusExportCorte {
    corte_id: string;
    numero: number;
    titulo: string;
    raw_pronto: boolean;
    video_pronto: boolean;
    thumbnail_pronta: boolean;
    metadados_completos: boolean;
    pronto_publicar: boolean;
    titulo_youtube?: string;
    descricao_youtube?: string;
    thumbnail_path?: string;
}

export interface CriarProjetoRequest {
    youtube_url: string;
    canal_origem?: string;
}
