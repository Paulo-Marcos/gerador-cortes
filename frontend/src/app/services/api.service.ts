/**
 * ApiService — cliente HTTP central para o backend FastAPI
 * Todos os endpoints da API passam por aqui.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
    Projeto, Corte, MetadadoCorte, StatusExportCorte, CriarProjetoRequest
} from '../models/models';

const API = 'http://localhost:8000/api';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private http = inject(HttpClient);

    // ─── Projetos ───────────────────────────────────────────

    criarProjeto(body: CriarProjetoRequest): Observable<Projeto> {
        return this.http.post<Projeto>(`${API}/projetos`, body);
    }

    listarProjetos(): Observable<Projeto[]> {
        return this.http.get<Projeto[]>(`${API}/projetos`);
    }

    obterProjeto(id: string): Observable<Projeto> {
        return this.http.get<Projeto>(`${API}/projetos/${id}`);
    }

    removerProjeto(id: string): Observable<{ message: string }> {
        return this.http.delete<{ message: string }>(`${API}/projetos/${id}`);
    }

    analisarProjeto(id: string): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${API}/projetos/${id}/analisar`, {});
    }

    exportarLosslessCut(id: string): void {
        window.open(`${API}/projetos/${id}/losslesscut.csv`, '_blank');
    }

    // ─── Cortes ─────────────────────────────────────────────

    listarCortes(projetoId: string): Observable<Corte[]> {
        return this.http.get<Corte[]>(`${API}/cortes/projeto/${projetoId}`);
    }

    obterCorte(id: string): Observable<Corte> {
        return this.http.get<Corte>(`${API}/cortes/${id}`);
    }

    atualizarCorte(id: string, dados: Partial<Corte>): Observable<Corte> {
        return this.http.patch<Corte>(`${API}/cortes/${id}`, dados);
    }

    aprovarCorte(id: string): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${API}/cortes/${id}/aprovar`, {});
    }

    rejeitarCorte(id: string): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${API}/cortes/${id}/rejeitar`, {});
    }

    removerDesvio(corteId: string, desvioIndex: number): Observable<Corte> {
        return this.http.post<Corte>(`${API}/cortes/${corteId}/remover-desvio`, {
            desvio_index: desvioIndex,
        });
    }

    adicionarDesvio(corteId: string, dados: { inicio_hms: string; fim_hms: string; motivo: string }): Observable<Corte> {
        return this.http.post<Corte>(`${API}/cortes/${corteId}/adicionar-desvio`, dados);
    }

    criarCorteDoDesvio(corteId: string, desvioIndex: number, titulo: string): Observable<Corte> {
        return this.http.post<Corte>(`${API}/cortes/${corteId}/corte-do-desvio`, {
            desvio_index: desvioIndex,
            titulo: titulo,
        });
    }

    deletarCorte(id: string): Observable<{ message: string }> {
        return this.http.delete<{ message: string }>(`${API}/cortes/${id}`);
    }

    // ─── Corte (ffmpeg) ─────────────────────────────────────

    cortarClip(corteId: string): Observable<{ message: string; corte_id: string }> {
        return this.http.post<{ message: string; corte_id: string }>(
            `${API}/export/corte/${corteId}/cortar`, {}
        );
    }

    statusCorteClip(corteId: string): Observable<{ status: string; clip_gerado: boolean; clip_path: string }> {
        return this.http.get<{ status: string; clip_gerado: boolean; clip_path: string }>(
            `${API}/export/corte/${corteId}/cortar/status`
        );
    }

    cortarTodos(projetoId: string): Observable<{ message: string; cortes: string[] }> {
        return this.http.post<{ message: string; cortes: string[] }>(
            `${API}/export/projeto/${projetoId}/cortar-todos`, {}
        );
    }

    // ─── Metadados ──────────────────────────────────────────

    obterMetadado(corteId: string): Observable<MetadadoCorte> {
        return this.http.get<MetadadoCorte>(`${API}/metadados/corte/${corteId}`);
    }

    gerarMetadados(corteId: string): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${API}/metadados/corte/${corteId}/gerar`, {});
    }

    gerarPrompt(corteId: string): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${API}/metadados/corte/${corteId}/gerar-prompt`, {});
    }

    atualizarMetadado(corteId: string, dados: Partial<MetadadoCorte>): Observable<{ message: string }> {
        return this.http.patch<{ message: string }>(`${API}/metadados/corte/${corteId}`, dados);
    }

    gerarThumbnail(corteId: string): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${API}/metadados/corte/${corteId}/gerar-thumbnail`, {});
    }

    uploadThumbnail(corteId: string, file: File): Observable<{ message: string; thumbnail_path: string }> {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post<{ message: string; thumbnail_path: string }>(`${API}/metadados/corte/${corteId}/thumbnail-manual`, formData);
    }

    // ─── Export ─────────────────────────────────────────────

    statusExport(projetoId: string): Observable<{ projeto_id: string; cortes: StatusExportCorte[] }> {
        return this.http.get<any>(`${API}/export/projeto/${projetoId}/status`);
    }

    processarClip(corteId: string, filtro: string = 'nenhum'): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${API}/export/corte/${corteId}/processar?filtro=${encodeURIComponent(filtro)}`, {});
    }

    listarFiltros(): Observable<{ filtros: { id: string; nome: string; descricao: string; tem_filtro_visual: boolean }[] }> {
        return this.http.get<any>(`${API}/export/filtros`);
    }

    listarVersoes(corteId: string): Observable<{ corte_id: string; versoes: any[] }> {
        return this.http.get<any>(`${API}/export/corte/${corteId}/versoes`);
    }

    processarMultiversion(corteId: string, preview: boolean = true, previewSegundos: number = 10, filtros: string[] | null = null): Observable<{ message: string; filtros: string[] }> {
        const payload = filtros ? { filtros } : {};
        return this.http.post<any>(`${API}/export/corte/${corteId}/processar-multiversion?preview=${preview}&preview_segundos=${previewSegundos}`, payload);
    }

    // ─── WebSocket de progresso ─────────────────────────────

    conectarProgressoWS(projetoId: string): WebSocket {
        return new WebSocket(`ws://localhost:8000/api/projetos/${projetoId}/ws`);
    }
}
