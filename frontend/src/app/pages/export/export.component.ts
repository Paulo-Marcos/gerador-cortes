import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { StatusExportCorte } from '../../models/models';

const API_BASE = 'http://localhost:8000';

@Component({
  selector: 'app-export',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="animate-in">
      <div class="page-header">
        <div>
          <a [routerLink]="['/projetos', projetoId()]" class="text-sm text-muted">← Projeto</a>
          <h1 class="page-title" style="margin-top: 8px;">🚀 Export Final</h1>
          <p class="page-subtitle">Checklist e publicação de cortes no YouTube</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" (click)="carregarStatus()">🔄 Atualizar</button>
        </div>
      </div>

      <!-- Resumo ---->
      @if (cortes().length > 0) {
        <div class="grid-3" style="margin-bottom: 20px; gap: 12px;">
          <div class="card" style="text-align: center; padding: 16px;">
            <div style="font-size: 2rem; font-weight: 700; color: var(--success);">{{ totalProntos() }}</div>
            <div class="text-sm text-muted">Prontos para publicar</div>
          </div>
          <div class="card" style="text-align: center; padding: 16px;">
            <div style="font-size: 2rem; font-weight: 700; color: var(--accent-400);">{{ cortes().length }}</div>
            <div class="text-sm text-muted">Cortes aprovados</div>
          </div>
          <div class="card" style="text-align: center; padding: 16px;">
            <div style="font-size: 2rem; font-weight: 700; color: var(--warning);">{{ cortes().length - totalProntos() }}</div>
            <div class="text-sm text-muted">Pendentes</div>
          </div>
        </div>

        <div class="alert alert-info" style="margin-bottom: 20px;">
          💡 <strong>Pós-Produção Automática:</strong> O botão <em>"Pós-Produção"</em> executa o ffmpeg para normalizar o áudio
          para <strong>-14 LUFS</strong> e concatena automaticamente os arquivos
          <code>intro.mp4</code> / <code>outro.mp4</code> da pasta <code>assets/intro/</code>, se existirem.
        </div>
      }

      <!-- Lista ---->
      @if (carregando()) {
        <div class="empty-state"><div class="spinner" style="width:32px;height:32px;border-width:3px;"></div></div>
      } @else if (cortes().length === 0) {
        <div class="empty-state card">
          <div class="empty-icon">📦</div>
          <p class="empty-title">Nenhum corte aprovado ainda</p>
          <a class="btn btn-primary mt-4" [routerLink]="['/projetos', projetoId(), 'cortes']">✂️ Ir para Editor</a>
        </div>
      } @else {
        <div style="display: flex; flex-direction: column; gap: 12px;">
          @for (corte of cortes(); track corte.corte_id) {
            <div class="card" [style.border-color]="corte.pronto_publicar ? 'var(--success)' : ''">

              <!-- Cabeçalho (sempre visível) ---->
              <div class="flex items-start justify-between gap-3" style="flex-wrap: wrap;">
                <div style="flex: 1 1 auto; min-width: 0;">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-mono text-muted">#{{ corte.numero }}</span>
                    @if (corte.pronto_publicar) {
                      <span class="badge badge-aprovado">🚀 Pronto!</span>
                    } @else {
                      <span class="badge badge-baixando">⏳ Pendente</span>
                    }
                  </div>
                  <p style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">{{ corte.titulo }}</p>

                  <!-- Checklist compacto ---->
                  <div class="flex gap-3 flex-wrap" style="font-size: 12px;">
                    <span [style.color]="corte.raw_pronto ? 'var(--success)' : 'var(--text-400)'">
                      {{ corte.raw_pronto ? '✅' : '⬜' }} Recorte Bruto
                    </span>
                    <span [style.color]="corte.video_pronto ? 'var(--success)' : 'var(--text-400)'">
                      {{ corte.video_pronto ? '✅' : '⬜' }} Pós-Produção
                    </span>
                    <span [style.color]="corte.thumbnail_pronta ? 'var(--success)' : 'var(--text-400)'">
                      {{ corte.thumbnail_pronta ? '✅' : '⬜' }} Thumbnail
                    </span>
                    <span [style.color]="corte.metadados_completos ? 'var(--success)' : 'var(--text-400)'">
                      {{ corte.metadados_completos ? '✅' : '⬜' }} Metadados
                    </span>
                  </div>
                </div>

                <!-- Botões de ação + toggle ---->
                <div class="flex gap-2 items-start flex-wrap">
                  @if (!corte.raw_pronto) {
                    <button class="btn btn-secondary btn-sm" disabled
                      title="Gere o recorte bruto no Editor de Cortes primeiro">
                      ⚠️ Falta recorte
                    </button>
                  } @else if (!corte.video_pronto) {
                    <button class="btn btn-primary btn-sm" (click)="processarClip(corte.corte_id)"
                      title="Normaliza áudio (LUFS) e une com Intro/Outro">
                      ⚙️ Pós-Produção
                    </button>
                  } @else {
                    <a [href]="videoUrl(corte.corte_id)" target="_blank" class="btn btn-success btn-sm" download>
                      ⬇️ Baixar MP4
                    </a>
                  }
                  @if (!corte.metadados_completos) {
                    <a class="btn btn-ghost btn-sm" [routerLink]="['/projetos', projetoId(), 'metadados']">
                      📝 Metadados
                    </a>
                  }
                  <!-- Toggle accordion e Delete ---->
                  <button class="btn btn-ghost btn-sm" (click)="toggleAberto(corte.corte_id)"
                    style="min-width: 32px; font-size: 14px;"
                    [title]="aberto()[corte.corte_id] ? 'Recolher' : 'Expandir detalhes'">
                    {{ aberto()[corte.corte_id] ? '🔽' : '▶️' }}
                  </button>
                  <button class="btn btn-ghost btn-sm" (click)="deletarCorte(corte.corte_id, corte.titulo)"
                    style="min-width: 32px; color: var(--danger);"
                    title="Excluir este corte permanentemente">
                    🗑️
                  </button>
                </div>
              </div>

              <!-- Detalhes expansíveis ---->
              @if (aberto()[corte.corte_id]) {
                <div class="divider" style="margin: 16px 0;"></div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start;">

                  <!-- Coluna Esquerda: Textos ---->
                  <div>
                    @if (corte.metadados_completos) {
                      <div style="margin-bottom: 12px;">
                        <div class="flex justify-between items-center" style="margin-bottom: 4px;">
                          <label class="form-label mb-0" style="font-size: 12px;">🎬 Título YouTube</label>
                          <button class="btn btn-ghost" style="padding: 2px 8px; font-size: 11px;"
                            (click)="copiarTexto(corte.titulo_youtube || '')">📋 Copiar</button>
                        </div>
                        <div style="background: var(--bg-700); border-radius: 6px; padding: 8px 12px; font-size: 13px; border: 1px solid var(--border);">
                          {{ corte.titulo_youtube }}
                        </div>
                      </div>
                      <div>
                        <div class="flex justify-between items-center" style="margin-bottom: 4px;">
                          <label class="form-label mb-0" style="font-size: 12px;">📋 Descrição</label>
                          <button class="btn btn-ghost" style="padding: 2px 8px; font-size: 11px;"
                            (click)="copiarTexto(corte.descricao_youtube || '')">📋 Copiar</button>
                        </div>
                        <textarea readonly rows="7"
                          style="width: 100%; background: var(--bg-700); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; font-size: 12px; resize: vertical; color: var(--text-100); font-family: inherit; box-sizing: border-box;"
                          >{{ corte.descricao_youtube }}</textarea>
                      </div>
                    } @else {
                      <div class="alert alert-info">
                        ⚠️ Metadados ainda não gerados.
                        <a [routerLink]="['/projetos', projetoId(), 'metadados']" style="font-weight: 600;">Gerar agora →</a>
                      </div>
                    }
                  </div>

                  <!-- Coluna Direita: Thumbnail + Download + FILTROS -->
                  <div>
                    <label class="form-label" style="font-size: 12px;">🖼️ Thumbnail</label>
                    @if (corte.thumbnail_pronta && corte.thumbnail_path) {
                      <img
                        [src]="thumbUrl(corte)"
                        style="width: 100%; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 12px;"
                        alt="thumbnail"
                        (error)="onImgError($event)"
                      />
                    } @else {
                      <div style="border: 2px dashed var(--border); border-radius: 8px; padding: 32px; text-align: center; margin-bottom: 12px;">
                        <div style="font-size: 32px; margin-bottom: 8px;">🖼️</div>
                        <div class="text-sm text-muted">Thumbnail não enviada</div>
                        <a [routerLink]="['/projetos', projetoId(), 'metadados']" class="btn btn-secondary btn-sm mt-4">
                          Ir para Metadados
                        </a>
                      </div>
                    }

                    @if (!corte.video_pronto && corte.raw_pronto) {
                      <!-- Seletor de Filtros de Vídeo com Ações Diretas -->
                      <div style="margin-bottom: 14px;">
                        <label class="form-label" style="font-size: 12px;">🎨 Filtros de Cor (Pós-produção)</label>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                          @for (f of filtros; track f.id) {
                            <div style="background: var(--bg-700); border: 1px solid var(--border); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                              <div style="display: flex; align-items: center; justify-content: space-between;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                  <span style="font-size: 16px;">{{ f.emoji }}</span>
                                  <div>
                                    <div style="font-size: 13px; font-weight: 600;">{{ f.nome }}</div>
                                    <div style="font-size: 11px; color: var(--text-400);">{{ f.desc }}</div>
                                  </div>
                                </div>
                              </div>
                              <div style="display: flex; gap: 6px;">
                                <button class="btn btn-secondary btn-sm" style="flex: 1; font-size: 11px; padding: 4px;"
                                  (click)="gerarPreviewFiltroUnico(corte.corte_id, f.id)"
                                  [disabled]="gerandoMulti()[corte.corte_id]">
                                  ⚡ Prévia 10s
                                </button>
                                <button class="btn btn-primary btn-sm" style="flex: 1; font-size: 11px; padding: 4px;"
                                  (click)="aplicarFiltroCompleto(corte.corte_id, f.id)"
                                  [disabled]="gerandoMulti()[corte.corte_id]">
                                  ⚙️ Pós-produção Final
                                </button>
                              </div>
                            </div>
                          }
                        </div>
                      </div>
                    }

                    @if (corte.video_pronto) {
                      <div style="background: var(--bg-700); border-radius: 8px; padding: 12px; border: 1px solid var(--success);">
                        <div style="font-size: 12px; font-weight: 600; color: var(--success); margin-bottom: 8px;">🎉 Vídeo Pós-Produzido!</div>
                        <a [href]="videoUrl(corte.corte_id)" target="_blank" class="btn btn-primary btn-sm" download style="width: 100%; text-align: center;">⬇️ Baixar MP4 Final</a>
                      </div>
                    } @else if (corte.raw_pronto) {
                      <div class="alert alert-info" style="font-size: 12px;">
                        Selecione um filtro acima e clique <strong>"⚙️ Pós-Produção"</strong> no cabeçalho.
                      </div>
                    } @else {
                      <div class="alert" style="background: var(--bg-700); font-size: 12px;">
                        Gere o recorte bruto no <a [routerLink]="['/projetos', projetoId(), 'cortes']" style="font-weight: 600;">Editor de Cortes</a> primeiro.
                      </div>
                    }
                  </div>
                </div>

                <!-- Seção de Multi-Versões -->
                @if (corte.raw_pronto) {
                  <div class="divider" style="margin: 16px 0;"></div>
                  <div>
                    <div class="flex justify-between items-center" style="margin-bottom: 12px;">
                      <label class="form-label mb-0" style="font-size: 13px;">🎥 Comparação de Versões com Filtros</label>
                      <div class="flex gap-2">
                        <button class="btn btn-secondary btn-sm" (click)="carregarVersoes(corte.corte_id)">
                          🔄 Atualizar lista
                        </button>
                        @if (!gerandoMulti()[corte.corte_id]) {
                          <button class="btn btn-primary btn-sm" (click)="gerarPreviewTodasVersoes(corte.corte_id)"
                            title="Gera previews de 10s de TODOS os filtros em paralelo (rápido)">
                            ⚡ Gerar Todas as Previews
                          </button>
                        } @else {
                          <button class="btn btn-secondary btn-sm" disabled>
                            <span class="spinner"></span>
                            Gerando previews...
                          </button>
                        }
                      </div>
                    </div>

                    @if (versoes()[corte.corte_id] && versoes()[corte.corte_id].length > 0) {
                      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px;">
                        @for (v of versoes()[corte.corte_id]; track v.filtro) {
                          <div style="background: var(--bg-700); border: 1px solid var(--border); border-radius: 10px; padding: 12px;">
                            <div class="flex justify-between items-center" style="margin-bottom: 6px;">
                              <div style="font-size: 12px; font-weight: 700;">{{ v.nome }}</div>
                              @if (v.e_preview) {
                                <span style="font-size: 10px; background: rgba(255,180,0,0.2); color: #ffb400; padding: 2px 6px; border-radius: 4px; font-weight: 600;">PREVIEW 10s</span>
                              } @else {
                                <span style="font-size: 10px; background: rgba(0,200,80,0.2); color: #00c850; padding: 2px 6px; border-radius: 4px; font-weight: 600;">✅ COMPLETO</span>
                              }
                            </div>
                            <div style="font-size: 10px; color: var(--text-400); margin-bottom: 8px;">{{ v.descricao }}</div>
                            <video controls style="width: 100%; height: 100px; border-radius: 6px; object-fit: cover; margin-bottom: 8px; background: #000;">
                              <source [src]="versaoPreviewUrl(corte.corte_id, v.filtro, v.e_preview)" type="video/mp4">
                            </video>
                            <div class="flex gap-2">
                              <a [href]="versaoPreviewUrl(corte.corte_id, v.filtro, v.e_preview)" target="_blank" class="btn btn-ghost btn-sm" download
                                 style="flex: 1; text-align: center; font-size: 10px;">⬇️ Baixar</a>
                              @if (v.e_preview && !v.completo_disponivel) {
                                <button class="btn btn-primary btn-sm"
                                  style="flex: 1; font-size: 10px; white-space: nowrap;"
                                  (click)="aplicarFiltroCompleto(corte.corte_id, v.filtro)">
                                  ⚙️ Usar completo
                                </button>
                              }
                            </div>
                          </div>
                        }
                      </div>
                    } @else {
                      <div class="alert alert-info" style="font-size: 12px; margin-bottom: 0;">
                        Nenhuma versão/prévia gerada ainda. Utilize os botões nos cards de filtros ou "Gerar Todas as Previews".
                      </div>
                    }
                  </div>
                }
              }
            </div>
          }
        </div>
      }
    </div>
  `
})
export class ExportComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  projetoId = signal('');
  cortes = signal<StatusExportCorte[]>([]);
  carregando = signal(true);
  aberto = signal<Record<string, boolean>>({});

  totalProntos = () => this.cortes().filter(c => c.pronto_publicar).length;

  filtros = [
    { id: 'nenhum',       emoji: '✨', nome: 'Original',          desc: 'Sem filtro' },
    { id: 'cinematic',   emoji: '🎥', nome: 'Cinemático I',       desc: 'Teal/Orange atual' },
    { id: 'cinematic_ii', emoji: '🎬', nome: 'Cinemático II',      desc: 'Menos laranja' },
    { id: 'cinematic_iii', emoji: '🔷', nome: 'Cinemático III',     desc: 'Realces neutros, só teal' },
    { id: 'cine_frio',   emoji: '🔵', nome: 'Cine + Frio',        desc: 'Blue Hour' },
    { id: 'cine_vintage', emoji: '📷', nome: 'Cine + Vintage',     desc: 'Kodak grain' },
  ];

  versoes = signal<Record<string, any[]>>({});
  gerandoMulti = signal<Record<string, boolean>>({});

  filtroSelecionado = signal<Record<string, string>>({});

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.projetoId.set(id);
    this.carregarStatus();
  }

  carregarStatus() {
    this.carregando.set(true);
    this.api.statusExport(this.projetoId()).subscribe({
      next: (r) => {
        this.cortes.set(r.cortes);
        this.carregando.set(false);
        // Expande apenas o primeiro corte (ou nenhum), o padrão é fechado (false)
        const estado: Record<string, boolean> = {};
        const filtros: Record<string, string> = {};
        r.cortes.forEach((c) => {
          estado[c.corte_id] = false; // ABAS COMEÇAM FECHADAS
          filtros[c.corte_id] = 'nenhum';
        });
        this.aberto.set(estado);
        this.filtroSelecionado.set(filtros);
      },
      error: () => this.carregando.set(false),
    });
  }

  processarClip(corteId: string) {
    const filtro = this.filtroSelecionado()[corteId] || 'nenhum';
    this.api.processarClip(corteId, filtro).subscribe(() => {
      setTimeout(() => this.carregarStatus(), 12000);
    });
  }

  selecionarFiltro(corteId: string, filtroId: string) {
    this.filtroSelecionado.update(m => ({ ...m, [corteId]: filtroId }));
  }

  gerarPreviewTodasVersoes(corteId: string) {
    this.gerandoMulti.update(m => ({ ...m, [corteId]: true }));
    // Passando null para o 4º parâmetro gera TODOS os filtros (backend lê nulos e injeta chaves completas)
    this.api.processarMultiversion(corteId, true, 10, null).subscribe({
      next: () => {
        const poll = setInterval(() => {
          this.carregarVersoes(corteId).then((count) => {
            if (count > 0) {
              this.gerandoMulti.update(m => ({ ...m, [corteId]: false }));
              clearInterval(poll);
            }
          });
        }, 8000);

        setTimeout(() => {
          clearInterval(poll);
          this.gerandoMulti.update(m => ({ ...m, [corteId]: false }));
        }, 120000);
      },
      error: () => this.gerandoMulti.update(m => ({ ...m, [corteId]: false })),
    });
  }

  gerarPreviewFiltroUnico(corteId: string, filtroId: string) {
    this.gerandoMulti.update(m => ({ ...m, [corteId]: true }));
    // Manda apenas O array contendo só 1 filtro. Backend Pydantic lidará sem invocar o resto
    this.api.processarMultiversion(corteId, true, 10, [filtroId]).subscribe({
      next: () => {
        // Remove o alert() bloqueante. Aguarda 8 segundos antes do refresh visual.
        setTimeout(() => {
          this.carregarVersoes(corteId);
          this.gerandoMulti.update(m => ({ ...m, [corteId]: false }));
        }, 8000);
      },
      error: () => this.gerandoMulti.update(m => ({ ...m, [corteId]: false }))
    });
  }

  deletarCorte(corteId: string, titulo: string) {
    if (confirm(`Tem certeza que deseja DELETAR permanentemente o corte "${titulo}"?\n(O arquivo raw e metadados serão removidos do disco)`)) {
      this.carregando.set(true);
      this.api.deletarCorte(corteId).subscribe({
        next: () => this.carregarStatus(),
        error: () => { alert('Erro ao deletar o corte. Tente novamente.'); this.carregarStatus(); }
      });
    }
  }

  aplicarFiltroCompleto(corteId: string, filtro: string) {
    const nome = this.filtros.find(f => f.id === filtro)?.nome || filtro;
    if (!confirm(`Gerar vídeo COMPLETO com o filtro "${nome}"?\nIsso pode demorar vários minutos.`)) return;
    this.selecionarFiltro(corteId, filtro);
    this.api.processarClip(corteId, filtro).subscribe({
      next: () => alert('Pós-produção iniciada! Aguarde e atualize a página.'),
      error: () => alert('Erro ao iniciar a pós-produção.'),
    });
  }

  versaoPreviewUrl(corteId: string, filtro: string, ePreview: boolean): string {
    const arquivo = ePreview ? 'preview.mp4' : 'video.mp4';
    return `http://localhost:8000/videos/${this.projetoId()}/cortes/${corteId}/versoes/${filtro}/${arquivo}`;
  }

  carregarVersoes(corteId: string): Promise<number> {
    return new Promise((resolve) => {
      this.api.listarVersoes(corteId).subscribe({
        next: (r) => {
          this.versoes.update(v => ({ ...v, [corteId]: r.versoes }));
          resolve(r.versoes.length);
        },
        error: () => resolve(0),
      });
    });
  }

  versaoUrl(corteId: string, filtro: string): string {
    return `http://localhost:8000/videos/${this.projetoId()}/cortes/${corteId}/versoes/${filtro}/video.mp4`;
  }

  toggleAberto(corteId: string) {
    this.aberto.update(m => ({ ...m, [corteId]: !m[corteId] }));
  }

  /** Gera a URL da thumbnail a partir do thumbnail_path salvo no backend */
  thumbUrl(corte: StatusExportCorte): string {
    if (!corte.thumbnail_path) return '';
    // O path está no formato: ./projetos/{projeto_id}/thumbnails/thumb_XXXXXXXX.ext
    // O servidor serve via /videos/{projeto_id}/{path}
    const raw = corte.thumbnail_path.replace(/\\/g, '/');
    // Extrai a parte relativa a partir do projeto_id
    const match = raw.match(/projetos\/[^/]+\/(.+)/);
    if (match) {
      return `${API_BASE}/videos/${this.projetoId()}/${match[1]}`;
    }
    // Fallback: extrai apenas o filename
    const filename = raw.split('/').pop() || '';
    return `${API_BASE}/videos/${this.projetoId()}/thumbnails/${filename}`;
  }

  videoUrl(corteId: string): string {
    return `${API_BASE}/videos/${this.projetoId()}/cortes/${corteId}/upload_ready/video.mp4`;
  }

  onImgError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent) {
      const fallback = document.createElement('div');
      fallback.style.cssText = 'border: 2px dashed var(--border); border-radius: 8px; padding: 20px; text-align: center; font-size: 12px; color: var(--text-400);';
      fallback.textContent = '⚠️ Thumbnail não pôde ser carregada';
      parent.appendChild(fallback);
    }
  }

  copiarTexto(texto: string) {
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
      alert('Copiado para a área de transferência!');
    });
  }
}
