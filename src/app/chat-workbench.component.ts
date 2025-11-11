import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type Kind = 'feature' | 'rule' | 'dataset' | 'analysis' | 'workflow' | 'other';

interface ChatSummaryItem {
  id: string;
  label: string;
  kind: Kind;
  anchorId: string;
  createdEntityId?: string;
  isSaved?: boolean;
  time?: Date;
}
interface Entity {
  id: string;
  type: 'feature' | 'rule' | 'dataset';
  name: string;
  description?: string;
  saved: boolean;
  preview?: any;
  editUrl?: string;
}
interface SubAgent {
  id: string;
  name: string;
  status: 'Running' | 'Completed' | 'Stopped' | 'Idle';
  needsApproval?: boolean;
  expanded?: boolean;
  additionalInput?: string;
  response?: string;
  generatedEntities?: Entity[];
}
interface AgentRun {
  id: string;
  name: string;
  startedAt: Date;
  stopped?: boolean;
  status: 'Running' | 'Completed' | 'Stopped' | 'Idle';
  subAgents: SubAgent[];
  approvalRequired?: boolean;
  approvalPending?: boolean;
  thinking?: string;
  anchorId: string;
}
interface ChatItem {
  id: string;
  title: string;
  summary: string;
  updatedAt: Date;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-chat-workbench',
  template: `
  <div class="app-shell" [class.preview-open]="previewOpen">
    <!-- LEFT: History -->
    <aside class="left-rail">
      <div class="left-rail-header">
        <button class="btn btn-primary" (click)="newChat()">+ New Chat</button>
        <div class="search-wrap">
          <input [(ngModel)]="historySearch" (input)="filterHistory()" placeholder="Search chats" />
        </div>
      </div>
      <div class="history-list">
        <div *ngFor="let c of filteredHistory" class="history-item" [class.active]="c.id===activeChatId" (click)="selectChat(c.id)">
          <div class="title-row">
            <div class="title" title="{{ c.title }}">{{ c.title }}</div>
            <div class="timestamp">{{ c.updatedAt | date:'MM/dd HH:mm' }}</div>
          </div>
          <div class="summary-line" title="{{ c.summary }}">{{ c.summary }}</div>
        </div>
      </div>
    </aside>

    <!-- MIDDLE: Preview (only when open) -->
    <section class="preview-pane" *ngIf="previewOpen">
      <div class="preview-head">
        <div class="title">Preview: {{ previewEntity?.type | titlecase }} — {{ previewEntity?.name }}</div>
        <div class="actions"><button class="btn btn-ghost" (click)="closePreview()">✕</button></div>
      </div>
      <div class="preview-body" *ngIf="previewEntity as p">
        <ng-container [ngSwitch]="p.type">
          <div *ngSwitchCase="'rule'" class="dv-card">
            <div class="dv-card-title">Rule Definition</div>
            <div class="dv-grid">
              <div><label>Name</label><div>{{ p.name }}</div></div>
              <div><label>Condition</label><div>{{ p.preview?.condition || 'amount > 1000 AND velocity_24h > 3' }}</div></div>
              <div><label>Actions</label><div>{{ p.preview?.actions || 'Decline, Add to Watchlist' }}</div></div>
            </div>
          </div>
          <div *ngSwitchCase="'feature'" class="dv-card">
            <div class="dv-card-title">Feature Definition</div>
            <div class="dv-grid">
              <div><label>Name</label><div>{{ p.name }}</div></div>
              <div><label>Type</label><div>{{ p.preview?.type || 'Aggregation (sum, 24h window)' }}</div></div>
              <div><label>Expression</label><div class="code">{{ p.preview?.expression || 'sum(amount) OVER user_id LAST 24h' }}</div></div>
            </div>
          </div>
          <div *ngSwitchCase="'dataset'" class="dv-card">
            <div class="dv-card-title">Dataset Sample</div>
            <div class="table-like">
              <div class="row header"><div>event_id</div><div>user_id</div><div>amount</div><div>timestamp</div></div>
              <div class="row" *ngFor="let r of (p.preview?.rows || sampleRows)">
                <div>{{ r.event_id }}</div><div>{{ r.user_id }}</div><div>{{ r.amount }}</div><div>{{ r.ts }}</div>
              </div>
            </div>
          </div>
        </ng-container>
        <div class="preview-actions">
          <button class="chip chip-primary" (click)="saveEntity(p)">💾 Save</button>
          <button class="chip" (click)="deleteEntity(p)">🗑 Delete</button>
          <a class="btn-link" *ngIf="p.saved && p.editUrl" [href]="p.editUrl" target="_blank">Open in Editor ↗</a>
        </div>
      </div>
    </section>

    <!-- RIGHT: Chat -->
    <main class="chat-pane">
      <header class="main-header">
        <div class="chat-title">{{ activeChat?.title }}</div>
      </header>

      <!-- Orchestration list -->
      <section class="orchestration" *ngFor="let run of runs">
        <div class="agent-header" [id]="run.anchorId">
          <div class="agent-title">
            <span class="dot" [class.running]="run.status==='Running'" [class.completed]="run.status==='Completed'" [class.stopped]="run.status==='Stopped'"></span>
            {{ run.name }}
          </div>
          <div class="agent-actions">
            <span class="status">{{ run.status }}</span>
            <button class="chip chip-danger" *ngIf="run.status==='Running'" (click)="stopRun(run)">■ Stop</button>
          </div>
        </div>

        <div class="approval-bar" *ngIf="run.approvalPending">
          <div>Approval required</div>
          <div class="approval-actions">
            <button class="chip chip-primary" (click)="approve(run)">✔ Approve</button>
            <button class="chip" (click)="reject(run)">✖ Reject</button>
          </div>
        </div>

        <div class="subagents">
          <div class="subagent" *ngFor="let sa of run.subAgents">
            <div class="subagent-header">
              <button class="expander" (click)="sa.expanded = !sa.expanded">{{ sa.expanded ? '▾' : '▸' }}</button>
              <div class="subagent-title">{{ sa.name }}</div>
              <div class="spacer"></div>
              <div class="subagent-status" [class.running]="sa.status==='Running'" [class.completed]="sa.status==='Completed'" [class.stopped]="sa.status==='Stopped'">{{ sa.status }}</div>
              <button class="chip chip-danger" *ngIf="sa.status==='Running'" (click)="stopSubAgent(sa)">■ Stop</button>
            </div>

            <div class="approval-row" *ngIf="sa.needsApproval">
              <span>Approval required</span>
              <div class="approval-actions">
                <button class="chip chip-primary" (click)="approveSubAgent(sa)">✔ Approve</button>
                <button class="chip" (click)="rejectSubAgent(sa)">✖ Reject</button>
              </div>
            </div>

            <div class="subagent-body" *ngIf="sa.expanded">
              <div class="thinking">{{ sa.response || 'Thinking…' }}</div>

              <div class="agent-input">
                <input [(ngModel)]="sa.additionalInput" placeholder="Add guidance for this sub-agent (optional)" />
                <button class="btn btn-ghost" (click)="sendAdditionalInput(sa)">Send</button>
              </div>

              <div class="entities" *ngIf="sa.generatedEntities?.length">
                <div class="entity-card" *ngFor="let e of sa.generatedEntities">
                  <div class="entity-head">
                    <span class="pill">{{ e.type | titlecase }}</span>
                    <span class="entity-name">{{ e.name }}</span>
                    <span class="spacer"></span>
                    <button class="chip" (click)="openPreview(e)">👁 Preview</button>
                  </div>
                  <div class="entity-sub">{{ e.description }}</div>
                  <div class="entity-actions">
                    <button class="chip chip-primary" (click)="saveEntity(e)">💾 Save</button>
                    <button class="chip" (click)="deleteEntity(e)">🗑 Delete</button>
                    <a class="btn-link small" *ngIf="e.saved && e.editUrl" [href]="e.editUrl" target="_blank">Open in Editor ↗</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="stopped-notice" *ngIf="run.status==='Stopped'">
          This agent was stopped. It will not continue remaining tasks from the prompt, but you can continue to enter new prompts below.
        </div>
      </section>

      <!-- End-of-convo entity list -->
      <section class="entity-summary" *ngIf="allEntities().length">
        <div class="summary-header">Entities created in this conversation</div>
        <table>
          <thead><tr><th>Type</th><th>Name</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr *ngFor="let e of allEntities()">
              <td>{{ e.type | titlecase }}</td>
              <td>{{ e.name }}</td>
              <td><span class="tag" [class.unsaved]="!e.saved">{{ e.saved ? 'Saved' : 'Unsaved' }}</span></td>
              <td>
                <button class="chip" (click)="openPreview(e)">👁 Preview</button>
                <button class="chip chip-primary" *ngIf="!e.saved" (click)="saveEntity(e)">💾 Save</button>
                <button class="chip" *ngIf="!e.saved" (click)="removeEntityEverywhere(e)">🗑 Remove</button>
                <a class="btn-link small" *ngIf="e.saved && e.editUrl" [href]="e.editUrl" target="_blank">Open in Editor ↗</a>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- FLOATING SUMMARY BUTTON -->
      <button class="floating-summary-btn" (click)="toggleSummary()">
        ⓘ Summary
      </button>

      <!-- SLIDE-OVER SUMMARY as a timeline -->
      <div class="summary-drawer" *ngIf="showSummary">
        <div class="summary-header drawer-head">
          <h3>Action History</h3>
          <button class="btn btn-ghost" (click)="toggleSummary()">✕</button>
        </div>
        <div class="timeline">
          <div *ngFor="let s of summary" class="tl-row">
            <div class="tl-dot" [ngClass]="s.kind"></div>
            <div class="tl-card">
              <div class="tl-top">
                <span class="tl-kind">{{ s.kind | titlecase }}</span>
                <span class="tl-time">{{ (s.time || now) | date:'MM/dd HH:mm' }}</span>
              </div>
              <a href="#" class="tl-label" (click)="scrollToAnchor(s.anchorId); $event.preventDefault(); toggleSummary(false)">
                {{ s.label }}
              </a>
              <div class="tl-actions" *ngIf="s.createdEntityId">
                <span class="tag" [class.unsaved]="!s.isSaved">{{ s.isSaved ? 'Saved' : 'Unsaved' }}</span>
                <button class="chip chip-danger" *ngIf="!s.isSaved" (click)="revertActivity(s)">↶ Revert</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- GLOBAL PROMPT COMPOSER AT BOTTOM -->
      <section class="composer-bottom">
        <textarea [(ngModel)]="prompt" rows="3" placeholder="Ask the AI to create features, draft rules, build datasets, investigate alerts, create dashboards…"></textarea>
        <div class="composer-actions">
          <button class="btn btn-primary" (click)="sendPrompt()">Send</button>
          <button class="btn btn-ghost" (click)="copyPrompt()" title="Copy prompt">Copy</button>
        </div>
      </section>
    </main>
  </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; color: #0f172a; font-size: 13px; }
    .app-shell { display: grid; grid-template-columns: 260px 1fr; height: 100%; transition: grid-template-columns .25s ease; }
    .app-shell.preview-open { grid-template-columns: 260px 520px 1fr; }

    .left-rail { border-right: 1px solid #e5e7eb; padding: 10px; overflow: hidden; display:flex; flex-direction:column; background:#fff; }
    .left-rail-header { display:flex; gap: 8px; align-items: center; }
    .search-wrap { flex: 1; }
    .search-wrap input { width: 100%; padding: 6px 8px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12px; }
    .history-list { margin-top: 10px; overflow: auto; }
    .history-item { padding: 8px; border-radius: 8px; cursor: pointer; border:1px solid transparent; }
    .history-item:hover { background:#f8fafc; }
    .history-item.active { background:#eef2ff; border-color:#c7d2fe; }
    .title-row { display:flex; align-items:center; gap:8px; }
    .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .timestamp { font-size: 11px; color: #64748b; margin-left:auto; }
    .summary-line { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .preview-pane { border-right: 1px solid #e5e7eb; background:#fafafa; padding: 12px; overflow:auto; }
    .preview-head { display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px; }
    .preview-head .title { font-weight: 700; font-size: 14px; }
    .dv-card { background:#fff; border:1px solid #e5e7eb; border-radius: 10px; padding: 10px; margin-bottom: 10px; }
    .dv-card-title { font-weight:700; margin-bottom: 6px; }
    .dv-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; font-size: 12px; }
    .dv-grid label { font-size: 11px; color:#64748b; }
    .code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background:#f8fafc; padding: 6px; border-radius: 6px; border: 1px solid #e5e7eb; }

    .chat-pane { position: relative; overflow-y: auto; padding: 12px 18px 160px; background:#fff; }
    .main-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px; }
    .chat-title { font-size: 16px; font-weight: 700; }

    .orchestration { border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px; margin-top: 12px; }
    .agent-header { display:flex; align-items:center; justify-content:space-between; padding: 4px 0 8px; }
    .agent-title { font-weight: 700; display:flex; gap:8px; align-items:center; font-size: 13px; }
    .agent-actions { display:flex; align-items:center; gap:8px; }
    .status { font-size:12px; color:#475569; }
    .dot { width:8px; height:8px; border-radius:50%; background:#cbd5e1; display:inline-block; }
    .dot.running { background:#fde68a; }
    .dot.completed { background:#86efac; }
    .dot.stopped { background:#fecaca; }

    .approval-bar { background:#fffbeb; border:1px dashed #f59e0b; padding: 6px 8px; border-radius:8px; display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px; font-size: 12px; }
    .approval-actions { display:flex; gap: 6px; }

    .subagents { display:grid; gap:6px; }
    .subagent { border:1px solid #e5e7eb; border-radius: 8px; }
    .subagent-header { display:flex; align-items:center; gap:8px; padding:6px 8px; }
    .subagent-title { font-weight:600; font-size: 13px; }
    .subagent-status { font-size:11px; padding: 2px 8px; border-radius: 99px; background:#e2e8f0; }
    .subagent-status.running { background:#fde68a; }
    .subagent-status.completed { background:#bbf7d0; }
    .subagent-status.stopped { background:#fecaca; }
    .expander { border:none; background:transparent; font-size:16px; cursor:pointer; }
    .approval-row { display:flex; justify-content:space-between; align-items:center; padding:0 10px 6px; font-size: 12px; }
    .subagent-body { border-top:1px dashed #e5e7eb; padding: 8px 10px; display:grid; gap:8px; }
    .thinking { white-space: pre-wrap; color:#0f172a; font-size: 12px; }
    .agent-input { display:flex; gap:6px; }
    .agent-input input { flex:1; padding: 6px 8px; border:1px solid #e5e7eb; border-radius: 8px; font-size: 12px; }

    .entities { display:grid; gap: 8px; }
    .entity-card { border:1px solid #e5e7eb; border-radius:8px; padding:8px; }
    .entity-head { display:flex; align-items:center; gap: 8px; }
    .pill { background:#e2e8f0; font-size: 10px; padding:2px 6px; border-radius:99px; }
    .entity-name { font-weight:700; font-size: 13px; }
    .entity-sub { font-size:12px; color:#475569; margin-top:2px; }
    .entity-actions { display:flex; gap:8px; margin-top:6px; align-items:center; }

    .stopped-notice { margin-top: 8px; background:#f1f5f9; padding:6px 8px; border-radius:8px; color:#0f172a; font-size: 12px; }

    .entity-summary { margin-top: 12px; border:1px solid #e5e7eb; border-radius: 12px; padding: 10px; }
    .entity-summary table { width:100%; border-collapse: collapse; font-size: 12px; }
    .entity-summary th, .entity-summary td { text-align:left; padding:6px; border-bottom:1px solid #e5e7eb; }
    .tag { font-size:11px; background:#e2e8f0; padding:2px 8px; border-radius:99px; }
    .tag.unsaved { background:#fee2e2; color:#991b1b; }

    .floating-summary-btn { position: fixed; right: 24px; bottom: 92px; border-radius: 999px; background:#4f46e5; color:#fff; padding: 8px 14px; font-weight:600; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 5; font-size: 12px;}
    .summary-drawer { position: fixed; right: 0; top: 0; width: 340px; height: 100%; background:#f9fafb; border-left: 1px solid #e5e7eb; box-shadow: -4px 0 12px rgba(0,0,0,0.08); animation: slideIn .25s ease; z-index: 6; display:flex; flex-direction:column; }
    .drawer-head { display:flex; align-items:center; justify-content:space-between; padding: 10px 12px; border-bottom:1px solid #e5e7eb; }
    .timeline { padding: 10px 12px; overflow:auto; }
    .tl-row { position: relative; display:flex; gap:10px; margin-bottom: 12px; }
    .tl-row::before { content: ''; position:absolute; left:6px; top:14px; bottom:-6px; width:2px; background:#e2e8f0; }
    .tl-dot { width:12px; height:12px; border-radius:50%; margin-top: 4px; background:#cbd5e1; flex: 0 0 auto; }
    .tl-dot.feature { background:#0ea5e9; }
    .tl-dot.rule { background:#f59e0b; }
    .tl-dot.dataset { background:#10b981; }
    .tl-dot.analysis, .tl-dot.workflow, .tl-dot.other { background:#a78bfa; }
    .tl-card { background: #fff; border:1px solid #e5e7eb; border-radius: 10px; padding: 8px 10px; flex:1; }
    .tl-top { display:flex; align-items:center; gap:8px; font-size: 11px; color: #64748b; }
    .tl-kind { font-weight:600; }
    .tl-time { margin-left:auto; }
    .tl-label { display:block; margin-top: 4px; font-weight:600; text-decoration:none; color: #111827; }
    .tl-actions { display:flex; gap:8px; margin-top: 6px; align-items:center; }

    .composer-bottom { position: fixed; left: 260px; right: 0; bottom: 0; background: #fff; border-top: 1px solid #e5e7eb; padding: 10px 16px; display:flex; gap: 10px; align-items:flex-end; z-index: 4; }
    .composer-bottom textarea { flex:1; resize: vertical; min-height: 56px; padding: 8px; border:1px solid #e5e7eb; border-radius: 8px; font-size: 13px; }
    .composer-actions { display:flex; gap:6px; }

    .btn { border:1px solid #e5e7eb; background:#fff; border-radius: 8px; padding: 6px 10px; cursor:pointer; font-size: 12px; }
    .btn:hover { background:#f8fafc; }
    .btn.btn-primary { background:#4f46e5; color:#fff; border-color:#4f46e5; }
    .btn.btn-ghost { background:transparent; border-color:transparent; color:#0f172a; }
    .btn.btn-outline { background:transparent; border-color:#e5e7eb; }
    .btn-link { border:none; background:transparent; color:#4f46e5; cursor:pointer; text-decoration: none; font-size: 12px; }
    .chip { border:1px solid #e5e7eb; background:#f8fafc; border-radius: 999px; padding: 4px 10px; font-size: 12px; cursor:pointer; }
    .chip:hover { filter: brightness(0.98); }
    .chip-primary { background: #eef2ff; border-color:#c7d2fe; color:#3730a3; }
    .chip-danger { background:#fee2e2; border-color:#fecaca; color:#991b1b; }
    .spacer { flex:1; }

    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  `]
})
export class ChatWorkbenchComponent {
  historySearch = '';
  history: ChatItem[] = [
    { id: 'c1', title: '24h total amount feature', summary: 'Created agg feature & drafted velocity rule', updatedAt: new Date() },
    { id: 'c2', title: 'High-velocity ACH rule tuning', summary: 'Adjusted thresholds, added watchlist action', updatedAt: new Date(Date.now() - 86400000) },
    { id: 'c3', title: 'Profile transformer ideas', summary: 'Outlined embeddings and clustering approach', updatedAt: new Date(Date.now() - 3*86400000) },
  ];
  filteredHistory: ChatItem[] = [...this.history];
  activeChatId = 'c1';
  get activeChat(): ChatItem | undefined { return this.history.find(h => h.id === this.activeChatId); }

  prompt = '';
  previewOpen = false;
  previewEntity?: Entity;
  showSummary = false;
  now = new Date();

  runs: AgentRun[] = [{
    id: 'r1',
    name: 'Fraud Pattern Analysis',
    startedAt: new Date(),
    status: 'Running',
    anchorId: 'anchor-r1',
    approvalRequired: true,
    approvalPending: true,
    subAgents: [
      { id: 'sa1', name: 'Fetch FN Events (last 14d)', status: 'Running', expanded: false, needsApproval: false, response: '', generatedEntities: [] },
      { id: 'sa2', name: 'Derive Fraud Pattern (embedding + clustering)', status: 'Idle', expanded: false, needsApproval: false, response: '', generatedEntities: [] },
    ]
  }];

  summary: ChatSummaryItem[] = [
    { id: 's1', label: 'Started: Fraud Pattern Analysis', kind: 'analysis', anchorId: 'anchor-r1', time: new Date() }
  ];

  sampleRows = [
    { event_id: 'e01', user_id: 'u01', amount: 124.55, ts: '2025-11-08T11:24:00Z' },
    { event_id: 'e02', user_id: 'u01', amount: 88.10, ts: '2025-11-08T12:10:00Z' },
    { event_id: 'e03', user_id: 'u02', amount: 921.00, ts: '2025-11-08T12:22:30Z' },
  ];

  // History
  filterHistory() {
    const q = this.historySearch.toLowerCase();
    this.filteredHistory = this.history.filter(h => (h.title + ' ' + h.summary).toLowerCase().includes(q));
  }
  selectChat(id: string) { this.activeChatId = id; }
  newChat() {
    const id = 'c' + (this.history.length + 1);
    const item: ChatItem = { id, title: 'New Chat', summary: 'Empty', updatedAt: new Date() };
    this.history.unshift(item); this.filteredHistory = [...this.history]; this.activeChatId = id;
  }

  // Prompt
  sendPrompt() {
    if (!this.prompt.trim()) return;
    const runId = 'r' + (this.runs.length + 1);
    const anchorId = 'anchor-' + runId;
    const newRun: AgentRun = {
      id: runId,
      name: 'Agent Orchestration for: ' + (this.prompt.length > 60 ? this.prompt.slice(0,60) + '…' : this.prompt),
      startedAt: new Date(),
      status: 'Running',
      anchorId,
      approvalRequired: true,
      approvalPending: true,
      subAgents: [
        { id: runId + '-a', name: 'Feature Generator', status: 'Idle', expanded: false, response: '', generatedEntities: [] },
        { id: runId + '-b', name: 'Rule Drafting', status: 'Idle', expanded: false, response: '', generatedEntities: [] },
        { id: runId + '-c', name: 'Dataset Builder', status: 'Idle', expanded: false, response: '', generatedEntities: [] },
      ]
    };
    this.runs.unshift(newRun);
    this.summary.unshift({ id: 's-' + runId, label: 'Started: ' + newRun.name, kind: 'analysis', anchorId, time: new Date() });
    this.prompt = '';
  }
  copyPrompt() { const text = this.prompt || ''; navigator.clipboard?.writeText(text).catch(() => {}); }

  // Preview
  openPreview(e: Entity) { this.previewEntity = e; this.previewOpen = true; }
  closePreview() { this.previewOpen = false; this.previewEntity = undefined; }

  // Summary drawer
  toggleSummary(next?: boolean) { this.showSummary = typeof next === 'boolean' ? next : !this.showSummary; }

  // Run control
  stopRun(run: AgentRun) {
    run.status = 'Stopped';
    run.stopped = true;
    run.approvalPending = false;
    run.subAgents.forEach(sa => sa.status = sa.status === 'Completed' ? 'Completed' : 'Stopped');
  }
  approve(run: AgentRun) {
    run.approvalPending = false;
    run.subAgents.forEach((sa, idx) => {
      sa.status = 'Running';
      if (idx === 0) setTimeout(() => {
        sa.response = 'Generated feature based on user behavior (sum(amount) over 24h).';
        sa.generatedEntities = [{
          id: 'feat-' + Date.now(),
          type: 'feature',
          name: 'total_amount_24h_by_user',
          description: 'Aggregation over 24h by user_id',
          saved: false,
          preview: { type: 'Aggregation', expression: 'sum(amount) OVER user_id LAST 24h' },
          editUrl: '/features/total_amount_24h_by_user/edit'
        }];
        sa.status = 'Completed';
        this.summary.unshift({
          id: 'sum-' + sa.id, label: 'Feature generated: total_amount_24h_by_user', kind: 'feature',
          anchorId: run.anchorId, createdEntityId: sa.generatedEntities[0].id, isSaved: false, time: new Date()
        });
        this.maybeCompleteRun(run);
      }, 400);
      if (idx === 1) setTimeout(() => {
        sa.response = 'Drafted a rule using velocity and amount thresholds.';
        sa.generatedEntities = [{
          id: 'rule-' + Date.now(),
          type: 'rule',
          name: 'HighVelocityLargeAmount',
          description: 'Decline if amount>1000 and velocity_24h>3',
          saved: false,
          preview: { condition: 'amount > 1000 AND velocity_24h > 3', actions: 'Decline' },
          editUrl: '/rules/HighVelocityLargeAmount/edit'
        }];
        sa.status = 'Completed';
        this.summary.unshift({
          id: 'sum-' + sa.id, label: 'Rule drafted: HighVelocityLargeAmount', kind: 'rule',
          anchorId: run.anchorId, createdEntityId: sa.generatedEntities[0].id, isSaved: false, time: new Date()
        });
        this.maybeCompleteRun(run);
      }, 600);
      if (idx === 2) setTimeout(() => {
        sa.response = 'Built a dataset of declined transactions (sample of 1000 rows).';
        sa.generatedEntities = [{
          id: 'ds-' + Date.now(),
          type: 'dataset',
          name: 'declined_txn_sample',
          description: 'Sample of declined transactions in last 7d',
          saved: false,
          preview: { rows: this.sampleRows },
          editUrl: '/datasets/declined_txn_sample/edit'
        }];
        sa.status = 'Completed';
        this.summary.unshift({
          id: 'sum-' + sa.id, label: 'Dataset built: declined_txn_sample', kind: 'dataset',
          anchorId: run.anchorId, createdEntityId: sa.generatedEntities[0].id, isSaved: false, time: new Date()
        });
        this.maybeCompleteRun(run);
      }, 800);
    });
  }
  reject(run: AgentRun) { run.approvalPending = false; run.status = 'Completed'; }
  maybeCompleteRun(run: AgentRun) {
    const allDone = run.subAgents.every(sa => sa.status === 'Completed' || sa.status === 'Stopped');
    if (allDone && run.status !== 'Stopped') run.status = 'Completed';
  }
  stopSubAgent(sa: SubAgent) { sa.status = 'Stopped'; }
  approveSubAgent(sa: SubAgent) { sa.needsApproval = false; sa.status = 'Running'; }
  rejectSubAgent(sa: SubAgent) { sa.needsApproval = false; sa.status = 'Completed'; }
  sendAdditionalInput(sa: SubAgent) {
    if (!sa.additionalInput) return;
    sa.response = (sa.response || '') + '\n\n[User additional input]: ' + sa.additionalInput;
    sa.additionalInput = '';
  }

  // Entities
  saveEntity(e: Entity) {
    e.saved = true;
    const sum = this.summary.find(s => s.createdEntityId === e.id);
    if (sum) sum.isSaved = true;
  }
  deleteEntity(e: Entity) {
    this.runs.forEach(run =>
      run.subAgents.forEach(sa => {
        sa.generatedEntities = (sa.generatedEntities || []).filter(x => x.id !== e.id);
      })
    );
    if (this.previewEntity?.id === e.id) this.closePreview();
    this.summary = this.summary.filter(s => s.createdEntityId !== e.id);
  }
  removeEntityEverywhere(e: Entity) { this.deleteEntity(e); }

  // Nav
  scrollToAnchor(anchorId: string) {
    const el = document.getElementById(anchorId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Revert
  revertActivity(s: ChatSummaryItem) {
    if (!s.createdEntityId) return;
    const entity = this.allEntities().find(e => e.id === s.createdEntityId);
    if (entity && !entity.saved) this.deleteEntity(entity);
  }

  allEntities(): Entity[] {
    const list: Entity[] = [];
    this.runs.forEach(r => r.subAgents.forEach(sa => (sa.generatedEntities || []).forEach(e => list.push(e))));
    return list;
  }
}
