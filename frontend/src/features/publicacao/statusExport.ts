import type { StatusExportCorte } from '@/types/models';

/**
 * O status de exportação de um corte que ainda não tem linha no backend — nada
 * pronto, nada publicado (D-722).
 *
 * O backend só devolve status para corte aprovado ou processado; as telas que
 * listam todos os cortes montavam o resto à mão, em mais de um lugar, cada um
 * com os campos que lembrava. Os padrões aqui são os que a resposta real traz
 * para um corte zerado: metadado ausente é `null`, marca de publicação é `""`.
 */
export function statusExportPendente(
  campos: Pick<StatusExportCorte, 'corte_id' | 'numero' | 'titulo'> & Partial<StatusExportCorte>,
): StatusExportCorte {
  return {
    raw_pronto: false,
    grade_pronta: false,
    overlays_prontos: false,
    video_pronto: false,
    thumbnail_pronta: false,
    metadados_completos: false,
    pronto_publicar: false,
    titulo_youtube: null,
    descricao_youtube: null,
    thumbnail_path: null,
    youtube_video_id: '',
    youtube_url_publicado: '',
    youtube_scheduled_at: '',
    cenas_geradas: false,
    cenas_validadas: false,
    tiktok_publicado_em: '',
    ...campos,
  };
}
