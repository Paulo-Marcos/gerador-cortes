import { Component, signal, inject, OnInit, ViewChild, ElementRef, AfterViewInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { interval, Subscription } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { Corte, StatusCorte } from '../../models/models';

/** Estado do modal de aprovação */
type ModoAprovacao = 'none' | 'confirmando' | 'cortando' | 'concluido' | 'erro';

/** Estado da criação de desvio manual */
interface DesvioEmCriacao {
  inicio_hms: string;
  inicio_seg: number;
}

@Component({
  selector: 'app-cortes-editor',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="animate-in">
      <div class="page-header">
        <div>
          <a [routerLink]="['/projetos', projetoId()]" class="text-sm text-muted">← Projeto</a>
          <h1 class="page-title" style="margin-top: 8px;">✂️ Editor de Cortes</h1>
          <p class="page-subtitle">{{ cortes().length }} corte(s) · {{ aprovados() }} aprovados · {{ processados() }} gerados</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" (click)="cortarTodos()" [disabled]="cortandoTodos()">
            @if (cortandoTodos()) { <span class="spinner"></span> Gerando... }
            @else { ⚡ Gerar Todos Aprovados }
          </button>
          <button class="btn btn-secondary" (click)="exportarCSV()">📋 CSV LosslessCut</button>
        </div>
      </div>

      <!-- Legenda -->
      <div class="alert alert-info" style="margin-bottom: 24px;">
        <strong>💡 Fluxo:</strong> Revise o corte → adicione/remova desvios → clique
        <strong>Aprovar</strong> → escolha gerar o clip agora ou depois
      </div>

      @if (carregando()) {
        <div class="empty-state"><div class="spinner" style="width:32px;height:32px;border-width:3px;"></div></div>
      } @else if (cortes().length === 0) {
        <div class="empty-state card">
          <div class="empty-icon">✂️</div>
          <p class="empty-title">Nenhum corte proposto ainda</p>
          <a class="btn btn-primary mt-4" [routerLink]="['/projetos', projetoId()]">← Voltar ao Projeto</a>
        </div>
      } @else {
        <div style="display: grid; grid-template-columns: 360px 1fr; gap: 24px; align-items: start;">

          <!-- ── Lista de cortes ── -->
          <div style="display: flex; flex-direction: column; gap: 10px; max-height: 85vh; overflow-y: auto; padding-right: 4px;">
            @for (corte of cortes(); track corte.id) {
              <div
                class="card card-sm"
                style="cursor: pointer; transition: border-color 0.15s;"
                [style.border-color]="corteAtivo()?.id === corte.id ? 'var(--accent-600)' : ''"
                (click)="selecionarCorte(corte)"
              >
                <div class="flex justify-between items-center mb-2">
                  <span class="text-xs font-mono text-muted">#{{ corte.numero }}</span>
                  <span [class]="getBadgeCorte(corte.status)">{{ getLabelStatus(corte.status) }}</span>
                </div>
                <p style="font-size: 13px; font-weight: 600; line-height: 1.3; margin-bottom: 6px;">
                  {{ corte.titulo_proposto }}
                </p>
                <div class="flex gap-2 text-xs text-muted font-mono">
                  <span>{{ corte.inicio_hms }}</span>
                  <span>→</span>
                  <span>{{ corte.fim_hms }}</span>
                  <span style="margin-left: auto;">{{ duracaoCorte(corte) }}</span>
                </div>
                @if (corte.desvios.length > 0) {
                  <div class="text-xs" style="color: var(--warning); margin-top: 6px;">
                    ⚠️ {{ corte.desvios.length }} desvio(s)
                  </div>
                }
                @if (corte.arquivo_clip_path) {
                  <div class="text-xs" style="color: var(--success); margin-top: 4px;">✅ Clip gerado</div>
                }
              </div>
            }
          </div>

          <!-- ── Painel do corte selecionado ── -->
          @if (corteAtivo()) {
            <div style="position: sticky; top: 24px; display: flex; flex-direction: column; gap: 16px;">

              <!-- Player -->
              <div class="card">
                <video
                  #videoPlayer
                  [src]="videoUrl()"
                  controls
                  style="width: 100%; border-radius: 6px; background: #000; max-height: 360px;"
                  (canplay)="onCanPlay()"
                  (timeupdate)="onTimeUpdate()"
                ></video>

                <!-- Progresso relativo ao corte -->
                <div style="margin-top: 10px;">
                  <div
                    class="progress-track"
                    style="cursor: pointer; height: 8px;"
                    (click)="seekDentroDoCorte($event)"
                  >
                    <div class="progress-fill" [style.width.%]="progressoCorte()"></div>
                  </div>
                  <div class="flex justify-between text-xs text-muted font-mono" style="margin-top: 4px;">
                    <span>{{ tempoAtualFormatado() }}</span>
                    <span>{{ corteAtivo()!.fim_hms }}</span>
                  </div>
                </div>

                <!-- Navegação + desvio manual -->
                <div class="flex gap-2 mt-3 flex-wrap">
                  <button class="btn btn-secondary btn-sm" (click)="pularParaInicio()">
                    ⏮ Início ({{ corteAtivo()!.inicio_hms }})
                  </button>
                  <button class="btn btn-secondary btn-sm" (click)="pularParaFim()">
                    Fim ({{ corteAtivo()!.fim_hms }}) ⏭
                  </button>
                  <button class="btn btn-ghost btn-sm" (click)="recuar()">← {{ stepBack }}s</button>
                  <button class="btn btn-ghost btn-sm" (click)="avancar()">{{ stepForward }}s →</button>
                </div>

                <!-- Marcar desvio manual -->
                <div style="margin-top: 10px; padding: 10px; background: var(--bg-700); border-radius: 6px;">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span style="font-size: 12px; font-weight: 600; color: var(--text-muted);">✂️ Marcar desvio:</span>
                    @if (!desvioEmCriacao()) {
                      <button class="btn btn-ghost btn-sm" style="font-size: 11px; color: var(--warning);" (click)="marcarInicioDesvio()">
                        ⏺ Marcar início aqui ({{ tempoAtualFormatado() }})
                      </button>
                    } @else {
                      <span class="text-xs font-mono" style="color: var(--warning);">
                        Início: {{ desvioEmCriacao()!.inicio_hms }}
                      </span>
                      <button class="btn btn-ghost btn-sm" style="font-size: 11px; color: var(--error);" (click)="marcarFimDesvio()">
                        ⏹ Marcar fim aqui ({{ tempoAtualFormatado() }})
                      </button>
                      <button class="btn btn-ghost btn-sm" style="font-size: 11px;" (click)="desvioEmCriacao.set(null)">
                        ✕ Cancelar
                      </button>
                    }
                  </div>

                  <!-- Modal de confirmação do desvio -->
                  @if (modalDesvio()) {
                    <div style="margin-top: 10px; padding: 10px; background: var(--bg-600); border-radius: 6px; border: 1px solid rgba(245,158,11,0.3);">
                      <p class="text-xs text-muted" style="margin-bottom: 8px;">
                        Desvio de <strong>{{ modalDesvio()!.inicio_hms }}</strong> → <strong>{{ modalDesvio()!.fim_hms }}</strong>
                      </p>
                      <input
                        class="form-input"
                        placeholder="Motivo (opcional)"
                        [(ngModel)]="motivoDesvio"
                        style="margin-bottom: 8px; font-size: 12px;"
                        (keyup.enter)="confirmarDesvio()"
                      />
                      <div class="flex gap-2">
                        <button class="btn btn-primary btn-sm" [disabled]="operandoDesvio()" (click)="confirmarDesvio()">
                          ✅ Adicionar desvio
                        </button>
                        <button class="btn btn-ghost btn-sm" (click)="modalDesvio.set(null)">Cancelar</button>
                      </div>
                    </div>
                  }

                  <!-- Atalhos de teclado -->
                  <div class="flex items-center gap-3 flex-wrap" style="margin-top: 8px; font-size: 11px; color: var(--text-muted);">
                    <span style="font-weight: 600;">⌨️</span>
                    <label class="flex items-center gap-1">
                      ← <input type="number" min="1" max="60" [(ngModel)]="stepBack"
                        style="width: 38px; background: var(--bg-600); border: 1px solid var(--border); border-radius: 4px; padding: 1px 4px; color: var(--text-primary); font-size: 11px; text-align: center;" />s
                    </label>
                    <label class="flex items-center gap-1">
                      → <input type="number" min="1" max="60" [(ngModel)]="stepForward"
                        style="width: 38px; background: var(--bg-600); border: 1px solid var(--border); border-radius: 4px; padding: 1px 4px; color: var(--text-primary); font-size: 11px; text-align: center;" />s
                    </label>
                  </div>
                </div>
              </div>

              <!-- Detalhes editáveis -->
              <div class="card">
                <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 16px;">
                  Corte #{{ corteAtivo()!.numero }} — Edição
                </h3>

                <div class="form-group">
                  <label class="form-label">Título</label>
                  <input class="form-input" [(ngModel)]="tituloEditado" />
                </div>

                <div class="grid-2" style="gap: 12px;">
                  <div class="form-group">
                    <label class="form-label">Início (HH:MM:SS)</label>
                    <input class="form-input font-mono" [(ngModel)]="inicioEditado" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Fim (HH:MM:SS)</label>
                    <input class="form-input font-mono" [(ngModel)]="fimEditado" />
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Resumo da IA</label>
                  <p class="text-sm text-muted" style="background: var(--bg-700); padding: 12px; border-radius: 6px; line-height: 1.6;">
                    {{ corteAtivo()!.resumo }}
                  </p>
                </div>

                <!-- Ações principais -->
                <div class="flex gap-2 flex-wrap">
                  <button class="btn btn-success btn-sm" (click)="iniciarAprovacao()"
                    [disabled]="modoAprovacao() !== 'none'">
                    ✅ Aprovar
                  </button>
                  <button class="btn btn-danger btn-sm" (click)="rejeitar()">❌ Rejeitar</button>
                  <button class="btn btn-secondary btn-sm" (click)="salvarEdicao()">💾 Salvar</button>
                  @if (corteAtivo()!.status === 'aprovado' || corteAtivo()!.status === 'processado') {
                    <button class="btn btn-primary btn-sm" (click)="irParaMetadados()">
                      🎬 Metadados →
                    </button>
                  }
                </div>

                <!-- Modal de aprovação -->
                @if (modoAprovacao() === 'confirmando') {
                  <div style="margin-top: 16px; padding: 16px; background: var(--bg-700); border-radius: 8px; border: 1px solid var(--accent-600);">
                    <p style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">✅ Aprovar este corte</p>
                    <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px;">
                      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
                        <input type="radio" name="modoGerar" value="depois" [(ngModel)]="opcaoGerar" />
                        Só aprovar (gerar clip depois)
                      </label>
                      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
                        <input type="radio" name="modoGerar" value="agora" [(ngModel)]="opcaoGerar" />
                        <strong>Aprovar e GERAR CLIP AGORA</strong>
                      </label>
                    </div>
                    <div class="flex gap-2">
                      <button class="btn btn-success btn-sm" (click)="confirmarAprovacao()">Confirmar</button>
                      <button class="btn btn-ghost btn-sm" (click)="modoAprovacao.set('none')">Cancelar</button>
                    </div>
                  </div>
                }

                <!-- Status de corte em andamento -->
                @if (modoAprovacao() === 'cortando') {
                  <div style="margin-top: 16px; padding: 14px; background: var(--bg-700); border-radius: 8px; text-align: center;">
                    <div class="spinner" style="width: 24px; height: 24px; margin: 0 auto 8px;"></div>
                    <p class="text-sm text-muted">Gerando clip com ffmpeg… pode levar alguns segundos</p>
                  </div>
                }

                <!-- Clip gerado com sucesso -->
                @if (modoAprovacao() === 'concluido' && corteAtivo()!.arquivo_clip_path) {
                  <div style="margin-top: 16px; padding: 14px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 8px;">
                    <p style="color: var(--success); font-weight: 600; margin-bottom: 8px;">✅ Clip gerado com sucesso!</p>
                    <button class="btn btn-primary btn-sm" (click)="irParaMetadados()">
                      🎬 Ir para Metadados & Thumbnail →
                    </button>
                  </div>
                }

                <!-- Aprovado sem gerar clip agpra -->
                @if (corteAtivo()!.status === 'aprovado' && modoAprovacao() === 'none') {
                  <div style="margin-top: 16px; padding: 14px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 8px;">
                    <p style="color: var(--success); font-weight: 600; margin-bottom: 8px;">✅ Corte Aprovado!</p>
                    <p class="text-sm text-muted mb-3">Você já pode gerar os metadados ou exportar o CSV depois.</p>
                  </div>
                }

                <!-- Erro ao gerar -->
                @if (modoAprovacao() === 'erro') {
                  <div style="margin-top: 16px; padding: 14px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px;">
                    <p style="color: var(--error); font-size: 13px;">❌ Erro ao gerar clip. Verifique se o ffmpeg está instalado no container.</p>
                    <button class="btn btn-ghost btn-sm" style="margin-top: 8px;" (click)="modoAprovacao.set('none')">Fechar</button>
                  </div>
                }
              </div>

              <!-- Desvios -->
              @if (corteAtivo()!.desvios.length > 0) {
                <div class="card" style="border-color: rgba(245,158,11,0.3);">
                  <h3 style="font-size: 14px; font-weight: 600; color: var(--warning); margin-bottom: 12px;">
                    ⚠️ Desvios ({{ corteAtivo()!.desvios.length }})
                  </h3>
                  @for (d of corteAtivo()!.desvios; track $index) {
                    <div style="background: rgba(245,158,11,0.07); border: 1px solid rgba(245,158,11,0.2); border-radius: 8px; padding: 10px; margin-bottom: 8px;">
                      <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="text-xs font-mono text-muted">{{ d.inicio_hms }}</span>
                        <span class="text-xs text-muted">→</span>
                        <span class="text-xs font-mono text-muted">{{ d.fim_hms }}</span>
                        <button class="btn btn-ghost btn-sm" style="padding: 2px 6px; font-size: 10px; margin-left: auto;"
                          (click)="pularParaDesvio(d.inicio_hms)">▶ Ver</button>
                      </div>
                      <p class="text-xs text-muted" style="font-style: italic; margin-bottom: 8px;">"{{ d.motivo }}"</p>
                      <div class="flex gap-2">
                        <button class="btn btn-ghost btn-sm" style="font-size: 10px; color: var(--error);"
                          [disabled]="operandoDesvio()" (click)="removerDesvio($index)">🗑 Remover</button>
                        <button class="btn btn-ghost btn-sm" style="font-size: 10px; color: var(--accent-400);"
                          [disabled]="operandoDesvio()" (click)="iniciarCriarCorteDesvio($index)">✂️ Novo corte</button>
                      </div>
                    </div>
                  }
                </div>
              }

              <!-- Modal criar corte do desvio -->
              @if (desvioParaCriar() !== null) {
                <div class="card" style="border-color: var(--accent-600);">
                  <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">✂️ Criar corte a partir do desvio</h3>
                  <div class="form-group">
                    <label class="form-label">Título do novo corte</label>
                    <input class="form-input" [(ngModel)]="tituloNovoCorte" placeholder="Deixe vazio para usar o motivo" />
                  </div>
                  <div class="flex gap-2">
                    <button class="btn btn-primary btn-sm" [disabled]="operandoDesvio()" (click)="confirmarCriarCorteDesvio()">
                      @if (operandoDesvio()) { <span class="spinner"></span> } @else { ✅ Criar }
                    </button>
                    <button class="btn btn-ghost btn-sm" (click)="desvioParaCriar.set(null)">Cancelar</button>
                  </div>
                </div>
              }

            </div>
          } @else {
            <div class="empty-state card">
              <div class="empty-icon">👈</div>
              <p class="empty-title">Selecione um corte</p>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class CortesEditorComponent implements OnInit, AfterViewInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;

  projetoId = signal('');
  cortes = signal<Corte[]>([]);
  corteAtivo = signal<Corte | null>(null);
  carregando = signal(true);
  videoUrl = signal('');
  operandoDesvio = signal(false);
  desvioParaCriar = signal<number | null>(null);
  tituloNovoCorte = '';
  cortandoTodos = signal(false);

  // Progresso do player
  progressoCorte = signal(0);
  tempoAtualFormatado = signal('00:00:00');
  private _pendingJumpSeg: number | null = null;

  // Atalhos teclado
  stepBack = 5;
  stepForward = 10;

  // Campos editáveis
  tituloEditado = '';
  inicioEditado = '';
  fimEditado = '';

  // Modal de aprovação
  modoAprovacao = signal<ModoAprovacao>('none');
  opcaoGerar = 'depois';
  private _pollingSubscription?: Subscription;

  // Desvio manual
  desvioEmCriacao = signal<DesvioEmCriacao | null>(null);
  modalDesvio = signal<{ inicio_hms: string; fim_hms: string; inicio_seg: number; fim_seg: number } | null>(null);
  motivoDesvio = '';

  aprovados = () => this.cortes().filter(c => c.status === 'aprovado').length;
  processados = () => this.cortes().filter(c => !!c.arquivo_clip_path).length;

  // ── Atalho de teclado ──────────────────────────────────────────────────────
  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); this.recuar(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); this.avancar(); }
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.projetoId.set(id);
    this.videoUrl.set(`http://localhost:8000/videos/${id}/video.mp4`);
    this.carregarCortes(id);
  }

  ngAfterViewInit() { }

  get video(): HTMLVideoElement | null {
    return this.videoPlayerRef?.nativeElement ?? null;
  }

  carregarCortes(id: string) {
    this.api.listarCortes(id).subscribe({
      next: (c) => { this.cortes.set(c); this.carregando.set(false); },
      error: () => this.carregando.set(false),
    });
  }

  selecionarCorte(corte: Corte) {
    this.corteAtivo.set(corte);
    this.tituloEditado = corte.titulo_proposto;
    this.inicioEditado = corte.inicio_hms;
    this.fimEditado = corte.fim_hms;
    this.desvioParaCriar.set(null);
    this.modoAprovacao.set('none');
    this.progressoCorte.set(0);
    this.desvioEmCriacao.set(null);
    this.modalDesvio.set(null);

    const seg = corte.inicio_seg ?? 0;
    const v = this.video;
    if (v && v.readyState >= 1) {
      v.currentTime = seg;
    } else {
      this._pendingJumpSeg = seg;
    }
  }

  onCanPlay() {
    if (this._pendingJumpSeg !== null) {
      const v = this.video;
      if (v) { v.currentTime = this._pendingJumpSeg; }
      this._pendingJumpSeg = null;
    }
  }

  onTimeUpdate() {
    const v = this.video;
    const c = this.corteAtivo();
    if (!v || !c) return;
    const atual = v.currentTime;
    const duracao = c.fim_seg - c.inicio_seg;
    const relativo = Math.max(0, atual - c.inicio_seg);
    const pct = duracao > 0 ? Math.min(100, (relativo / duracao) * 100) : 0;
    this.progressoCorte.set(pct);
    this.tempoAtualFormatado.set(this._segToHms(atual));
  }

  pularParaInicio() {
    const v = this.video; const c = this.corteAtivo();
    if (v && c) v.currentTime = c.inicio_seg;
  }

  pularParaFim() {
    const v = this.video; const c = this.corteAtivo();
    if (v && c) v.currentTime = Math.max(c.inicio_seg, c.fim_seg - 5);
  }

  recuar() {
    const v = this.video; const c = this.corteAtivo();
    if (!v) return;
    v.currentTime = Math.max(c ? c.inicio_seg : 0, v.currentTime - this.stepBack);
  }

  avancar() {
    const v = this.video; const c = this.corteAtivo();
    if (!v) return;
    v.currentTime = Math.min(c ? c.fim_seg : v.duration, v.currentTime + this.stepForward);
  }

  pularParaDesvio(inicioHms: string) {
    const v = this.video;
    if (v) v.currentTime = this._hmsToSeg(inicioHms);
  }

  seekDentroDoCorte(event: MouseEvent) {
    const v = this.video; const c = this.corteAtivo();
    if (!v || !c) return;
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const pct = (event.clientX - rect.left) / rect.width;
    v.currentTime = c.inicio_seg + pct * (c.fim_seg - c.inicio_seg);
  }

  // ── Desvios manuais ────────────────────────────────────────────────────────

  marcarInicioDesvio() {
    const v = this.video;
    if (!v) return;
    this.desvioEmCriacao.set({
      inicio_hms: this._segToHms(v.currentTime),
      inicio_seg: v.currentTime,
    });
  }

  marcarFimDesvio() {
    const v = this.video;
    const inicio = this.desvioEmCriacao();
    if (!v || !inicio) return;

    const fim_seg = v.currentTime;
    if (fim_seg <= inicio.inicio_seg) {
      alert('O fim deve ser posterior ao início do desvio');
      return;
    }

    this.modalDesvio.set({
      inicio_hms: inicio.inicio_hms,
      fim_hms: this._segToHms(fim_seg),
      inicio_seg: inicio.inicio_seg,
      fim_seg,
    });
    this.desvioEmCriacao.set(null);
    this.motivoDesvio = '';
  }

  confirmarDesvio() {
    const modal = this.modalDesvio();
    const corte = this.corteAtivo();
    if (!modal || !corte) return;
    this.operandoDesvio.set(true);

    this.api.adicionarDesvio(corte.id, {
      inicio_hms: modal.inicio_hms,
      fim_hms: modal.fim_hms,
      motivo: this.motivoDesvio || 'Desvio manual',
    }).subscribe({
      next: (updated) => {
        this.cortes.update(list => list.map(c => c.id === updated.id ? updated : c));
        this.corteAtivo.set(updated);
        this.modalDesvio.set(null);
        this.operandoDesvio.set(false);
      },
      error: () => this.operandoDesvio.set(false),
    });
  }

  removerDesvio(index: number) {
    if (!this.corteAtivo()) return;
    this.operandoDesvio.set(true);
    this.api.removerDesvio(this.corteAtivo()!.id, index).subscribe({
      next: (updated) => {
        this.cortes.update(list => list.map(c => c.id === updated.id ? updated : c));
        this.corteAtivo.set(updated);
        this.operandoDesvio.set(false);
      },
      error: () => this.operandoDesvio.set(false),
    });
  }

  iniciarCriarCorteDesvio(index: number) {
    this.desvioParaCriar.set(index);
    this.tituloNovoCorte = '';
  }

  confirmarCriarCorteDesvio() {
    const index = this.desvioParaCriar();
    if (index === null || !this.corteAtivo()) return;
    this.operandoDesvio.set(true);
    this.api.criarCorteDoDesvio(this.corteAtivo()!.id, index, this.tituloNovoCorte).subscribe({
      next: () => {
        this.carregarCortes(this.projetoId());
        this.desvioParaCriar.set(null);
        this.operandoDesvio.set(false);
      },
      error: () => this.operandoDesvio.set(false),
    });
  }

  // ── Aprovação + geração ────────────────────────────────────────────────────

  iniciarAprovacao() {
    this.opcaoGerar = 'depois';
    this.modoAprovacao.set('confirmando');
  }

  confirmarAprovacao() {
    if (!this.corteAtivo()) return;
    const corteId = this.corteAtivo()!.id;

    this.api.aprovarCorte(corteId).subscribe(() => {
      this._atualizarStatusLocal(corteId, 'aprovado');

      if (this.opcaoGerar === 'agora') {
        this.modoAprovacao.set('cortando');
        this.api.cortarClip(corteId).subscribe({
          next: () => this._iniciarPolling(corteId),
          error: () => this.modoAprovacao.set('erro'),
        });
      } else {
        this.modoAprovacao.set('none');
      }
    });
  }

  private _iniciarPolling(corteId: string) {
    this._pollingSubscription?.unsubscribe();
    this._pollingSubscription = interval(2000).pipe(
      switchMap(() => this.api.statusCorteClip(corteId)),
      takeWhile(r => r.status === 'cortando', true),
    ).subscribe({
      next: (r) => {
        if (r.status === 'pronto' || r.clip_gerado) {
          this.modoAprovacao.set('concluido');
          // Atualiza o corte na lista para mostrar clip gerado
          this.cortes.update(list => list.map(c =>
            c.id === corteId ? { ...c, arquivo_clip_path: r.clip_path, status: 'processado' as StatusCorte } : c
          ));
          this.corteAtivo.update(c => c ? { ...c, arquivo_clip_path: r.clip_path, status: 'processado' as StatusCorte } : c);
        } else if (r.status.startsWith('erro')) {
          this.modoAprovacao.set('erro');
        }
      },
      error: () => this.modoAprovacao.set('erro'),
    });
  }

  rejeitar() {
    if (!this.corteAtivo()) return;
    this.api.rejeitarCorte(this.corteAtivo()!.id).subscribe(() =>
      this._atualizarStatusLocal(this.corteAtivo()!.id, 'rejeitado')
    );
  }

  salvarEdicao() {
    if (!this.corteAtivo()) return;
    this.api.atualizarCorte(this.corteAtivo()!.id, {
      titulo_proposto: this.tituloEditado,
      inicio_hms: this.inicioEditado,
      fim_hms: this.fimEditado,
      inicio_seg: this._hmsToSeg(this.inicioEditado),
      fim_seg: this._hmsToSeg(this.fimEditado),
    }).subscribe(updated => {
      this.cortes.update(list => list.map(c => c.id === updated.id ? updated : c));
      this.corteAtivo.set(updated);
    });
  }

  cortarTodos() {
    this.cortandoTodos.set(true);
    this.api.cortarTodos(this.projetoId()).subscribe({
      next: () => setTimeout(() => this.cortandoTodos.set(false), 2000),
      error: () => this.cortandoTodos.set(false),
    });
  }

  irParaMetadados() {
    this.router.navigate(['/projetos', this.projetoId(), 'metadados']);
  }

  exportarCSV() {
    this.api.exportarLosslessCut(this.projetoId());
  }

  // ── Helpers de UI ──────────────────────────────────────────────────────────

  getBadgeCorte(status: StatusCorte): string {
    const map: Record<StatusCorte, string> = {
      proposto: 'badge badge-proposto', aprovado: 'badge badge-aprovado',
      rejeitado: 'badge badge-rejeitado', editado: 'badge badge-baixando',
      processado: 'badge badge-pronto',
    };
    return map[status] ?? 'badge';
  }

  getLabelStatus(status: StatusCorte): string {
    const l: Record<StatusCorte, string> = {
      proposto: 'Proposto', aprovado: '✅ Aprovado',
      rejeitado: '❌ Rejeitado', editado: 'Editado', processado: '🎬 Gerado',
    };
    return l[status] ?? status;
  }

  duracaoCorte(c: Corte): string {
    const seg = c.fim_seg - c.inicio_seg;
    if (seg <= 0) return '';
    const m = Math.floor(seg / 60);
    const s = Math.floor(seg % 60);
    return `${m}m${s.toString().padStart(2, '0')}s`;
  }

  private _atualizarStatusLocal(id: string, status: StatusCorte) {
    this.cortes.update(list => list.map(c => c.id === id ? { ...c, status } : c));
    this.corteAtivo.update(c => c ? { ...c, status } : c);
  }

  private _hmsToSeg(hms: string): number {
    const partes = hms.split(':').map(Number);
    if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2];
    if (partes.length === 2) return partes[0] * 60 + partes[1];
    return 0;
  }

  private _segToHms(seg: number): string {
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = Math.floor(seg % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
