import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Projeto } from '../../models/models';

@Component({
  selector: 'app-projeto-detalhe',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="animate-in">
      @if (carregando()) {
        <div class="empty-state"><div class="spinner" style="width:32px;height:32px;border-width:3px;"></div></div>
      } @else if (projeto()) {
        <!-- Header -->
        <div class="page-header">
          <div>
            <a routerLink="/projetos" class="text-sm text-muted">← Todos os Projetos</a>
            <h1 class="page-title" style="margin-top: 8px;">{{ projeto()!.titulo_live || 'Projeto sem título' }}</h1>
            <p class="page-subtitle">{{ projeto()!.canal_origem }} · {{ projeto()!.youtube_url }}</p>
          </div>
        </div>

        <!-- Status e Progresso -->
        <div class="card" style="margin-bottom: 24px;">
          <div class="flex items-center gap-4 flex-wrap">
            <span [class]="getBadge(projeto()!.status)">{{ getLabelStatus(projeto()!.status) }}</span>
            <span class="text-sm text-muted">
              ⏱ {{ formatarDuracao(projeto()!.duracao_segundos) }}
            </span>
            @if (projeto()!.status === 'baixando' || projeto()!.status === 'transcrevendo') {
              <div style="flex: 1; min-width: 200px;">
                <div class="progress-track">
                  <div class="progress-fill" [style.width.%]="projeto()!.progresso_download"></div>
                </div>
                <p class="text-xs text-muted" style="margin-top: 4px;">{{ projeto()!.progresso_download.toFixed(0) }}%</p>
              </div>
            }
          </div>
          @if (wsMsg()) {
            <div class="alert alert-info mt-4">{{ wsMsg() }}</div>
          }
        </div>

        <!-- Pipeline de fases -->
        <div class="grid-2" style="gap: 16px;">

          <!-- Fase 1: Ingestão -->
          <div class="card pipeline-card"
            [class.pipeline-done]="['pronto','analisando','analisado'].includes(projeto()!.status)"
          >
            <div class="flex items-center gap-2 mb-3">
              <span style="font-size: 20px;">1️⃣</span>
              <span style="font-weight: 600;">Ingestão</span>
              @if (['pronto','analisando','analisado'].includes(projeto()!.status)) {
                <span class="badge badge-aprovado" style="margin-left: auto;">✅ Concluído</span>
              }
            </div>
            <p class="text-sm text-muted">Download do vídeo + extração de legendas</p>
            @if (projeto()!.arquivo_video_path) {
              <p class="text-xs font-mono text-accent mt-4" style="word-break: break-all;">
                📁 {{ projeto()!.arquivo_video_path }}
              </p>
            }
          </div>

          <!-- Fase 2: Análise IA -->
          <div class="card pipeline-card"
            [class.pipeline-done]="projeto()!.status === 'analisado'"
            [class.pipeline-active]="projeto()!.status === 'analisando'"
          >
            <div class="flex items-center gap-2 mb-3">
              <span style="font-size: 20px;">2️⃣</span>
              <span style="font-weight: 600;">Análise IA</span>
              @if (projeto()!.status === 'analisado') {
                <span class="badge badge-aprovado" style="margin-left: auto;">✅ Concluído</span>
              } @else if (projeto()!.status === 'analisando') {
                <span class="badge badge-baixando" style="margin-left: auto;">🤖 Processando...</span>
              }
            </div>
            <p class="text-sm text-muted">n8n analisa a transcrição e propõe cortes</p>
            @if (projeto()!.status === 'pronto') {
              <button class="btn btn-primary btn-sm mt-4" [disabled]="analisando()" (click)="analisar()">
                @if (analisando()) { <span class="spinner"></span> Enviando... }
                @else { 🤖 Iniciar Análise IA }
              </button>
            }
          </div>

          <!-- Fase 3: Editor de Cortes -->
          <a class="card pipeline-card pipeline-link"
            [routerLink]="projeto()!.status === 'analisado' ? ['/projetos', projeto()!.id, 'cortes'] : null"
            [class.pipeline-done]="projeto()!.status === 'analisado'"
            [class.pipeline-disabled]="projeto()!.status !== 'analisado'"
            style="display: block; text-decoration: none;"
          >
            <div class="flex items-center gap-2 mb-3">
              <span style="font-size: 20px;">3️⃣</span>
              <span style="font-weight: 600;">Editor de Cortes</span>
              @if (projeto()!.status === 'analisado') {
                <span style="margin-left: auto; font-size: 14px;">→</span>
              }
            </div>
            <p class="text-sm text-muted">Revise e aprove os cortes propostos pela IA</p>
            @if (projeto()!.status !== 'analisado') {
              <p class="text-xs text-muted mt-4">🔒 Disponível após a Análise IA</p>
            }
          </a>

          <!-- Fase 4: Metadados -->
          <a class="card pipeline-card pipeline-link"
            [routerLink]="projeto()!.status === 'analisado' ? ['/projetos', projeto()!.id, 'metadados'] : null"
            [class.pipeline-done]="projeto()!.status === 'analisado'"
            [class.pipeline-disabled]="projeto()!.status !== 'analisado'"
            style="display: block; text-decoration: none;"
          >
            <div class="flex items-center gap-2 mb-3">
              <span style="font-size: 20px;">4️⃣</span>
              <span style="font-weight: 600;">Metadados + Thumbnails</span>
              @if (projeto()!.status === 'analisado') {
                <span style="margin-left: auto; font-size: 14px;">→</span>
              }
            </div>
            <p class="text-sm text-muted">Gere títulos, descrições e capas via IA</p>
            @if (projeto()!.status !== 'analisado') {
              <p class="text-xs text-muted mt-4">🔒 Disponível após a Análise IA</p>
            }
          </a>

          <!-- Fase 5: Export Final -->
          <a class="card pipeline-card pipeline-link"
            [routerLink]="projeto()!.status === 'analisado' ? ['/projetos', projeto()!.id, 'export'] : null"
            [class.pipeline-done]="projeto()!.status === 'analisado'"
            [class.pipeline-disabled]="projeto()!.status !== 'analisado'"
            style="display: block; text-decoration: none; grid-column: 1 / -1;"
          >
            <div class="flex items-center gap-2 mb-3">
              <span style="font-size: 20px;">5️⃣</span>
              <span style="font-weight: 600;">Export Final</span>
              @if (projeto()!.status === 'analisado') {
                <span style="margin-left: auto; font-size: 14px;">→</span>
              }
            </div>
            <p class="text-sm text-muted">Pós-produção, introdução/outro com ffmpeg e checklist de publicação</p>
            @if (projeto()!.status !== 'analisado') {
              <p class="text-xs text-muted mt-4">🔒 Disponível após a Análise IA</p>
            }
          </a>

        </div>
      }
    </div>
  `,
})
export class ProjetoDetalheComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  projeto = signal<Projeto | null>(null);
  carregando = signal(true);
  analisando = signal(false);
  wsMsg = signal('');
  private ws?: WebSocket;
  private polling?: any;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.carregarProjeto(id);
  }

  carregarProjeto(id: string) {
    this.api.obterProjeto(id).subscribe({
      next: (p) => {
        this.projeto.set(p);
        this.carregando.set(false);
        if (['baixando', 'transcrevendo', 'analisando'].includes(p.status)) {
          this.iniciarPolling(id);
        }
      },
      error: () => this.carregando.set(false),
    });
  }

  analisar() {
    if (!this.projeto()) return;
    this.analisando.set(true);
    this.api.analisarProjeto(this.projeto()!.id).subscribe({
      next: () => {
        this.analisando.set(false);
        this.wsMsg.set('🤖 Análise iniciada! Aguarde alguns minutos...');
        this.iniciarPolling(this.projeto()!.id);
      },
      error: () => this.analisando.set(false),
    });
  }

  iniciarPolling(id: string) {
    this.polling = setInterval(() => {
      this.api.obterProjeto(id).subscribe(p => {
        this.projeto.set(p);
        if (!['baixando', 'transcrevendo', 'analisando'].includes(p.status)) {
          clearInterval(this.polling);
        }
      });
    }, 3000);
  }

  getBadge(status: string) {
    const map: Record<string, string> = {
      pendente: 'badge badge-proposto', baixando: 'badge badge-baixando',
      transcrevendo: 'badge badge-baixando', pronto: 'badge badge-aprovado',
      analisando: 'badge badge-baixando', analisado: 'badge badge-pronto',
      erro: 'badge badge-rejeitado',
    };
    return map[status] ?? 'badge';
  }

  getLabelStatus(status: string): string {
    const l: Record<string, string> = {
      pendente: '⏳ Pendente', baixando: '⬇️ Baixando vídeo',
      transcrevendo: '📝 Transcrevendo', pronto: '✅ Pronto para análise',
      analisando: '🤖 Analisando com IA', analisado: '✂️ Cortes prontos',
      erro: '❌ Erro',
    };
    return l[status] ?? status;
  }

  formatarDuracao(seg: number): string {
    if (!seg) return '--';
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  ngOnDestroy() {
    this.ws?.close();
    if (this.polling) clearInterval(this.polling);
  }
}
