import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Corte, MetadadoCorte } from '../../models/models';

@Component({
  selector: 'app-metadados',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="animate-in">
      <div class="page-header">
        <div>
          <a [routerLink]="['/projetos', projetoId()]" class="text-sm text-muted">← Projeto</a>
          <h1 class="page-title" style="margin-top: 8px;">📝 Metadados & Thumbnails</h1>
          <p class="page-subtitle">Metadados prontos para publicação no YouTube</p>
        </div>
      </div>

      @if (carregando()) {
        <div class="empty-state"><div class="spinner" style="width:32px;height:32px;border-width:3px;"></div></div>
      } @else {
        <!-- Lista de cortes aprovados -->
        <div style="display: flex; flex-direction: column; gap: 20px;">
          @for (corte of cortesAprovados(); track corte.id) {
            <div class="card">
              <div class="flex justify-between items-center mb-4">
                <div class="flex items-center gap-3">
                  <span class="text-sm font-mono text-muted">#{{ corte.numero }}</span>
                  <h3 style="font-size: 15px; font-weight: 600;">{{ corte.titulo_proposto }}</h3>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    class="btn btn-primary btn-sm"
                    [disabled]="gerando()[corte.id]"
                    (click)="gerarMetadados(corte.id); $event.stopPropagation()"
                  >
                    @if (gerando()[corte.id]) { <span class="spinner"></span> Gerando... }
                    @else { 🤖 Gerar com IA }
                  </button>
                  <button class="btn btn-ghost btn-sm" (click)="toggleItem(corte.id)">
                    {{ itemAberto()[corte.id] ? '🔼' : '🔽' }}
                  </button>
                </div>
              </div>

              @if (itemAberto()[corte.id]) {
                @if (metadados()[corte.id]; as meta) {
                <!-- Título -->
                <div class="form-group mb-4">
                  <label class="form-label">🎬 Título YouTube</label>
                  @if (meta.opcoes_titulo && meta.opcoes_titulo.length > 0) {
                    <div class="flex flex-wrap gap-2" style="margin-bottom: 8px;">
                      @for (opcao of meta.opcoes_titulo; track opcao) {
                        <button class="btn btn-sm"
                                style="white-space: normal; text-align: left; height: auto; min-height: 32px; word-break: break-word;"
                                [class.btn-primary]="meta.titulo_youtube === opcao" 
                                [class.btn-secondary]="meta.titulo_youtube !== opcao" 
                                (click)="meta.titulo_youtube = opcao; salvarMeta(corte.id, meta)">{{ opcao }}</button>
                      }
                    </div>
                  }
                  <input
                    class="form-input"
                    [(ngModel)]="meta.titulo_youtube"
                    (blur)="salvarMeta(corte.id, meta)"
                  />
                  <span class="text-xs text-muted" [style.color]="meta.titulo_youtube.length > 100 ? 'var(--error)' : ''">
                    {{ meta.titulo_youtube.length }}/100
                  </span>
                </div>

                <!-- Texto da Capa -->
                <div class="form-group mb-4">
                  <label class="form-label">📝 Texto da Capa (Thumbnail)</label>
                  @if (meta.opcoes_texto_capa && meta.opcoes_texto_capa.length > 0) {
                    <div class="flex flex-wrap gap-2" style="margin-bottom: 8px;">
                      @for (opcao of meta.opcoes_texto_capa; track opcao) {
                        <button class="btn btn-sm"
                                style="white-space: normal; text-align: left; height: auto; min-height: 32px; word-break: break-word;"
                                [class.btn-primary]="meta.texto_capa === opcao" 
                                [class.btn-secondary]="meta.texto_capa !== opcao" 
                                (click)="meta.texto_capa = opcao; salvarMeta(corte.id, meta)">{{ opcao }}</button>
                      }
                    </div>
                  }
                  <input class="form-input" [(ngModel)]="meta.texto_capa" (blur)="salvarMeta(corte.id, meta)" placeholder="Ex: CHOQUE DE REALIDADE" />
                  <span class="text-xs text-muted">Apenas 1 a 3 palavras. Escolha acima ou digite.</span>
                </div>

                <!-- Descrição -->
                <div class="form-group">
                  <label class="form-label">📋 Descrição</label>
                  <textarea
                    class="form-textarea"
                    rows="8"
                    [(ngModel)]="meta.descricao_youtube"
                    (blur)="salvarMeta(corte.id, meta)"
                  ></textarea>
                </div>

                <!-- Tags -->
                <div class="form-group">
                  <label class="form-label">🏷️ Tags</label>
                  <p class="text-sm font-mono" style="background: var(--bg-700); padding: 10px; border-radius: 6px;">
                    {{ meta.tags_youtube.join(', ') }}
                  </p>
                </div>

                <!-- Prompt -->
                <div class="divider"></div>
                <div class="form-group mt-4 mb-4">
                  <div class="flex justify-between items-center mb-2">
                    <label class="form-label mb-0">🤖 Prompt Visual em Inglês</label>
                    <button class="btn btn-secondary btn-sm" (click)="gerarPrompt(corte.id)" [disabled]="gerandoPrompt()[corte.id] || !meta.texto_capa">
                      @if(gerandoPrompt()[corte.id]) { <span class="spinner"></span> Criando... } @else { ✨ Gerar Prompt com IA }
                    </button>
                  </div>
                  @if (meta.prompt_thumbnail) {
                    <textarea class="form-textarea" rows="8" [(ngModel)]="meta.prompt_thumbnail" (blur)="salvarMeta(corte.id, meta)"></textarea>
                  } @else {
                    <p class="text-sm text-muted">Selecione um Texto da Capa acima e clique em "Gerar Prompt com IA" para formatar as regras visuais da imagem.</p>
                  }
                </div>

                <!-- Thumbnail -->
                <div class="divider"></div>
                <div class="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p class="form-label" style="margin-bottom: 4px;">🖼️ Thumbnail</p>
                    @if (meta.thumbnail_path) {
                      <p class="text-xs text-success">✅ Gerada: {{ meta.thumbnail_path }}</p>
                    } @else {
                      <p class="text-xs text-muted">Ainda não gerada</p>
                    }
                  </div>
                  <div class="flex gap-2">
                    @if (meta.thumbnail_path) {
                      <img
                        [src]="thumbUrl(meta)"
                        style="height: 60px; border-radius: 4px; border: 1px solid var(--border);"
                        alt="thumbnail"
                      />
                    }
                    <button class="btn btn-secondary btn-sm" (click)="gerarThumb(corte.id)">
                      🎨 Gerar Thumbnail (IA)
                    </button>
                    <span class="text-sm text-muted ml-2">ou</span>
                    <label class="btn btn-secondary btn-sm" style="cursor: pointer;">
                      📤 Enviar
                      <input type="file" style="display: none;" accept="image/*" (change)="uploadThumbManual(corte.id, $event)">
                    </label>
                  </div>
                </div>

                } @else {
                  <div class="alert alert-info">
                    Clique em "Gerar com IA" para criar título, descrição, tags e prompt da thumbnail automaticamente.
                  </div>
                }
              }
            </div>
          }

          @if (cortesAprovados().length === 0) {
            <div class="empty-state card">
              <div class="empty-icon">✅</div>
              <p class="empty-title">Nenhum corte aprovado</p>
              <p class="empty-desc">Aprove cortes no editor antes de gerar metadados</p>
              <a class="btn btn-primary mt-4" [routerLink]="['/projetos', projetoId(), 'cortes']">✂️ Ir para Editor</a>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class MetadadosComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  projetoId = signal('');
  cortesAprovados = signal<Corte[]>([]);
  metadados = signal<Record<string, MetadadoCorte>>({});
  carregando = signal(true);
  gerando = signal<Record<string, boolean>>({});
  gerandoPrompt = signal<Record<string, boolean>>({});
  itemAberto = signal<Record<string, boolean>>({});

  thumbUrl(meta: MetadadoCorte): string {
    if (!meta.thumbnail_path) return '';
    // Converte de "\app\projetos\ID\thumbnails\thumb.jpg" para URL do fastapi servida em /videos/...
    const path = meta.thumbnail_path.replace(/\\/g, '/');
    const parts = path.split('/projetos/');
    if (parts.length > 1) {
      return `http://localhost:8000/videos/${parts[1]}`;
    }
    return '';
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.projetoId.set(id);
    this.api.listarCortes(id).subscribe({
      next: (c) => {
        this.cortesAprovados.set(c.filter(x => x.status === 'aprovado'));
        this.carregando.set(false);
        // Tenta carregar metadados existentes e abre por padrão
        const abertos: Record<string, boolean> = {};
        this.cortesAprovados().forEach(corte => {
          this.carregarMeta(corte.id)
          abertos[corte.id] = true;
        });
        this.itemAberto.set(abertos);
      },
      error: () => this.carregando.set(false),
    });
  }

  carregarMeta(corteId: string) {
    this.api.obterMetadado(corteId).subscribe({
      next: (meta) => this.metadados.update(m => ({ ...m, [corteId]: meta })),
      error: () => { },
    });
  }

  gerarMetadados(corteId: string) {
    this.gerando.update(g => ({ ...g, [corteId]: true }));
    this.api.gerarMetadados(corteId).subscribe({
      next: () => {
        setTimeout(() => {
          this.carregarMeta(corteId);
          this.gerando.update(g => ({ ...g, [corteId]: false }));
        }, 8000);
      },
      error: () => this.gerando.update(g => ({ ...g, [corteId]: false })),
    });
  }

  salvarMeta(corteId: string, meta: MetadadoCorte) {
    this.api.atualizarMetadado(corteId, {
      titulo_youtube: meta.titulo_youtube,
      descricao_youtube: meta.descricao_youtube,
      prompt_thumbnail: meta.prompt_thumbnail,
      texto_capa: meta.texto_capa,
    }).subscribe();
  }

  gerarPrompt(corteId: string) {
    const meta = this.metadados()[corteId];
    if (meta && meta.prompt_thumbnail) {
      if (!confirm('Este corte já possui um prompt. Deseja gerar um novo com a IA e substituir o atual?')) {
        return;
      }
    }

    this.gerandoPrompt.update(g => ({ ...g, [corteId]: true }));
    this.api.gerarPrompt(corteId).subscribe({
      next: () => {
        setTimeout(() => {
          this.carregarMeta(corteId);
          this.gerandoPrompt.update(g => ({ ...g, [corteId]: false }));
        }, 8000);
      },
      error: () => this.gerandoPrompt.update(g => ({ ...g, [corteId]: false })),
    });
  }

  gerarThumb(corteId: string) {
    this.api.gerarThumbnail(corteId).subscribe(() => {
      setTimeout(() => this.carregarMeta(corteId), 15000);
    });
  }

  toggleItem(corteId: string) {
    this.itemAberto.update(m => ({ ...m, [corteId]: !m[corteId] }));
  }

  uploadThumbManual(corteId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.api.uploadThumbnail(corteId, file).subscribe({
        next: () => {
          this.carregarMeta(corteId);
          input.value = ''; // reseta opcionalmente
        },
        error: () => alert('Erro ao enviar thumbnail')
      });
    }
  }
}
