import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type Kind = 'feature' | 'rule' | 'dataset' | 'analysis' | 'workflow' | 'other';
type AgentStatus = 'Running' | 'Completed' | 'Stopped' | 'Idle';

interface ChatSummaryItem {
  id: string;
  label: string;
  kind: Kind;
  anchorId: string;
  createdEntityId?: string;
  isSaved?: boolean;   // true = Accepted
  time?: Date;
}
interface Entity {
  id: string;
  type: 'feature' | 'rule';
  name: string;
  description?: string;
  saved: boolean;      // true = Accepted
  preview?: any;
  editUrl?: string;
  platformUrl?: string;
}
interface SubAgent {
  id: string;
  name: string;
  status: AgentStatus;
  expanded?: boolean;
  needsApproval?: boolean;
  approvalAsked?: boolean;
  response?: string;
  generatedEntities?: Entity[];
}
interface AgentRun {
  id: string;
  name: string;
  startedAt: Date;
  status: AgentStatus;
  anchorId: string;
  subAgents: SubAgent[];
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

    <!-- MIDDLE: Preview -->
    <section class="preview-pane" *ngIf="previewOpen">
      <div class="preview-head">
        <div class="title">Preview: {{ previewEntity?.type | titlecase }} — {{ previewEntity?.name }}</div>
        <div class="actions"><button class="btn btn-ghost" (click)="closePreview()">✕</button></div>
      </div>

      <div class="preview-body" *ngIf="previewEntity as p">
        <!-- Feature (DV-like) -->
        <div *ngIf="p.type==='feature'" class="dv-feature">
          <div class="dv-feature__header">
            <h3 class="dv-title">{{ p.name }}</h3>
            <div class="dv-subtle">Version 0</div>
          </div>
          <div class="dv-grid">
            <div><label>Operator Name</label><div>average</div></div>
            <div><label>Version</label><div>0</div></div>
            <div><label>Aggregated By</label><div><a>customer_id</a></div></div>
            <div><label>Target</label><div><a>Amount</a></div></div>
            <div><label>Default Value</label><div>0</div></div>
            <div><label>Hotspot</label><div>Off</div></div>
          </div>
          <div class="dv-section">
            <label>Select Event Type(s)</label>
            <div class="dv-badges">check_clearing, check_deposit</div>
          </div>
          <div class="dv-section">
            <label>Time Window</label>
            <div>Time window length: 365 Days | Offset length: Now (Exclusive)</div>
          </div>
          <div class="dv-section">
            <label>Feature Code</label>
            <pre class="dv-code">return $velocity(111, customer_id, 31536000000, 1, time, "Amount","average[0]", 0);</pre>
          </div>
        </div>

        <!-- Rule (DV-like) -->
        <div *ngIf="p.type==='rule'" class="dv-rule">
          <div class="dv-rule__title">{{ p.name }}</div>
          <div class="dv-rule__block">
            <div class="chip-cond">
              <a>sum_outgoing_rtp_amount_per_customer_10d</a>
              <span class="op">&nbsp;&gt;=&nbsp;</span><span class="val">5000</span>
            </div>
            <div class="joiner">AND</div>
            <div class="chip-cond">
              <a>freq_outgoing_rtp_amount_per_customer_10d</a>
              <span class="op">&nbsp;&gt;=&nbsp;</span><span class="val">5</span>
            </div>
          </div>
        </div>

        <div class="preview-actions">
          <button class="chip chip-primary" *ngIf="!p.saved" (click)="acceptEntity(p)">✔ Accept</button>
          <button class="chip chip-danger" *ngIf="!p.saved" (click)="revertEntity(p)">↶ Revert</button>
          <a class="btn-link" *ngIf="p.saved && p.platformUrl" [href]="p.platformUrl" target="_blank">View in Platform ↗</a>
          <a class="btn-link" *ngIf="p.saved && p.editUrl" [href]="p.editUrl" target="_blank">Open in Editor ↗</a>
        </div>
      </div>
    </section>

    <!-- RIGHT: Chat -->
    <main class="chat-pane">
      <header class="main-header">
        <div class="chat-title">{{ activeChat?.title }}</div>
        <button class="chip chip-danger" *ngIf="anyRunRunning()" title="Stop all" (click)="stopMain()">■</button>
      </header>

      <!-- Agent Runs -->
      <section class="orchestration" *ngFor="let run of runs">
        <div class="agent-header" [id]="run.anchorId">
          <div class="agent-title">
            <span class="dot" [class.running]="run.status==='Running'" [class.completed]="run.status==='Completed'" [class.stopped]="run.status==='Stopped'"></span>
            {{ run.name }}
            <span class="status micro">{{ run.status }}</span>
          </div>
          <div class="agent-actions">
            <button class="icon-btn danger" *ngIf="run.status==='Running'" (click)="stopRun(run)" title="Stop">■</button>
          </div>
        </div>

        <!-- Subagents -->
        <div class="subagents">
          <div class="subagent" *ngFor="let sa of run.subAgents">
            <div class="subagent-header">
              <button class="expander" (click)="sa.expanded = !sa.expanded">{{ sa.expanded ? '▾' : '▸' }}</button>
              <div class="subagent-title">
                {{ sa.name }}
                <span class="status micro">{{ sa.status }}</span>
                <!-- If something was generated, surface Preview chip near title -->
                <button class="chip micro" *ngIf="sa.generatedEntities?.length" (click)="openPreview(sa.generatedEntities![0])" title="Preview first result">👁 Preview</button>
              </div>
              <div class="spacer"></div>
              <button class="icon-btn danger" *ngIf="sa.status==='Running'" (click)="stopSubAgent(sa)" title="Stop this sub-agent">■</button>
            </div>

            <!-- Approval first -->
            <div class="approval-row" *ngIf="sa.needsApproval">
              <span>Approval required to generate {{ sa.name.toLowerCase().includes('rule') ? 'Rule' : 'Feature' }}</span>
              <div class="approval-actions">
                <button class="chip chip-primary" (click)="approveSubAgentToGenerate(sa)">✔ Approve</button>
                <button class="chip" (click)="rejectSubAgent(sa)">✖ Reject</button>
              </div>
            </div>

            <!-- Body -->
            <div class="subagent-body" *ngIf="sa.expanded">
              <div class="thinking" *ngIf="sa.response">{{ sa.response }}</div>

              <div class="entities" *ngIf="sa.generatedEntities?.length">
                <div class="entity-card" *ngFor="let e of sa.generatedEntities">
                  <div class="entity-head">
                    <span class="pill">{{ e.type | titlecase }}</span>
                    <span class="entity-name">{{ e.name }}</span>
                    <span class="spacer"></span>
                    <button class="chip micro" (click)="openPreview(e)">👁 Preview</button>
                  </div>
                  <div class="entity-actions">
                    <button class="chip chip-primary micro" *ngIf="!e.saved" (click)="acceptEntity(e)">✔ Accept</button>
                    <button class="chip chip-danger micro" *ngIf="!e.saved" (click)="revertEntity(e)">↶ Revert</button>
                    <a class="btn-link small" *ngIf="e.saved && e.platformUrl" [href]="e.platformUrl" target="_blank">View in Platform ↗</a>
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

      <!-- Floating Summary -->
      <button class="floating-summary-btn" (click)="toggleSummary()">ⓘ Summary</button>

      <!-- Summary Drawer -->
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
              <a href="#" class="tl-label" (click)="scrollToAnchor(s.anchorId); $event.preventDefault(); toggleSummary(false)">{{ s.label }}</a>
              <div class="tl-actions" *ngIf="s.createdEntityId">
                <span class="tag" [class.unaccepted]="!s.isSaved">{{ s.isSaved ? 'Accepted' : 'Unaccepted' }}</span>
                <button class="chip chip-danger micro" *ngIf="!s.isSaved" (click)="revertActivity(s)">↶ Revert</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- End-of-convo entity list -->
      <section class="entity-summary" *ngIf="allEntities().length">
        <div class="summary-header">Entities created in this conversation</div>
        <table>
          <thead><tr><th>Type</th><th>Name</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr *ngFor="let e of allEntities()">
              <td>{{ e.type | titlecase }}</td>
              <td>{{ e.name }}</td>
              <td><span class="tag" [class.unaccepted]="!e.saved">{{ e.saved ? 'Accepted' : 'Unaccepted' }}</span></td>
              <td>
                <button class="chip micro" (click)="openPreview(e)">👁 Preview</button>
                <button class="chip chip-primary micro" *ngIf="!e.saved" (click)="acceptEntity(e)">✔ Accept</button>
                <button class="chip chip-danger micro" *ngIf="!e.saved" (click)="removeEntityEverywhere(e)">↶ Revert</button>
                <a class="btn-link small" *ngIf="e.saved && e.platformUrl" [href]="e.platformUrl" target="_blank">View in Platform ↗</a>
                <a class="btn-link small" *ngIf="e.saved && e.editUrl" [href]="e.editUrl" target="_blank">Open in Editor ↗</a>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Global Prompt Composer (icon-only actions) -->
      <section class="composer-bottom">
        <textarea [(ngModel)]="prompt" rows="3" placeholder="Ask the AI to create features, draft rules, build datasets, investigate alerts, create dashboards…"></textarea>
        <div class="composer-actions">
          <button class="icon-btn" title="Send" (click)="sendPrompt()">➤</button>
          <button class="icon-btn danger" title="Stop all" (click)="stopMain()">■</button>
          <button class="icon-btn" title="Copy prompt" (click)="copyPrompt()">⧉</button>
        </div>
      </section>
    </main>
  </div>
  `,
  styles: [`
    :host { display:block; height:100vh; color:#0f172a; font-size:13px; }
    .app-shell { display:grid; grid-template-columns:260px 1fr; height:100%; transition:grid-template-columns .25s ease; }
    .app-shell.preview-open { grid-template-columns:260px 520px 1fr; }

    /* Left rail */
    .left-rail { border-right:1px solid #e5e7eb; padding:10px; overflow:hidden; display:flex; flex-direction:column; background:#fff; }
    .left-rail-header { display:flex; gap:8px; align-items:center; }
    .search-wrap { flex:1; }
    .search-wrap input { width:100%; padding:6px 8px; border:1px solid #e5e7eb; border-radius:8px; font-size:12px; }
    .history-list { margin-top:10px; overflow:auto; }
    .history-item { padding:8px; border-radius:8px; cursor:pointer; border:1px solid transparent; }
    .history-item:hover { background:#f8fafc; }
    .history-item.active { background:#eef2ff; border-color:#c7d2fe; }
    .title-row { display:flex; align-items:center; gap:8px; }
    .title { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .timestamp { font-size:11px; color:#64748b; margin-left:auto; }
    .summary-line { font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

    /* Preview DV-like */
    .preview-pane { border-right:1px solid #e5e7eb; background:#fafafa; padding:12px; overflow:auto; }
    .preview-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .preview-head .title { font-weight:700; font-size:14px; }
    .preview-actions { display:flex; gap:8px; margin-top:10px; align-items:center; }
    .dv-feature__header { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
    .dv-title { font-size:16px; font-weight:700; color:#e78c00; }
    .dv-subtle { color:#64748b; font-size:12px; }
    .dv-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:10px; }
    .dv-grid label { font-size:11px; color:#64748b; display:block; }
    .dv-section { margin-top:10px; background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:10px; }
    .dv-badges { background:#f1f5f9; border-radius:6px; padding:4px 8px; display:inline-block; font-size:12px; }
    .dv-code { margin:6px 0 0; background:#1e293b; color:#e2e8f0; padding:10px; border-radius:8px; font-size:12px; overflow:auto; }
    .dv-rule__title { font-weight:700; margin-bottom:6px; }
    .dv-rule__block { background:#e5e7eb; border-radius:8px; padding:8px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .chip-cond { background:#fff; border-radius:6px; padding:6px 8px; border:1px solid #d1d5db; font-size:12px; }
    .joiner { background:#475569; color:white; border-radius:6px; padding:4px 8px; font-size:12px; }
    .op { color:#16a34a; }
    .val { color:#16a34a; font-weight:600; }

    /* Chat area */
    .chat-pane { position:relative; overflow-y:auto; padding:12px 18px 160px; background:#fff; }
    .main-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .chat-title { font-size:16px; font-weight:700; }

    .orchestration { border:1px solid #e5e7eb; border-radius:12px; padding:10px; margin-top:12px; }
    .agent-header { display:flex; align-items:center; justify-content:space-between; padding:4px 0 8px; }
    .agent-title { font-weight:700; display:flex; gap:8px; align-items:center; font-size:13px; }
    .agent-actions { display:flex; align-items:center; gap:8px; }
    .status.micro { font-size:11px; color:#475569; margin-left:6px; }
    .dot { width:8px; height:8px; border-radius:50%; background:#cbd5e1; display:inline-block; }
    .dot.running { background:#fde68a; }
    .dot.completed { background:#86efac; }
    .dot.stopped { background:#fecaca; }

    .subagents { display:grid; gap:6px; }
    .subagent { border:1px solid #e5e7eb; border-radius:8px; }
    .subagent-header { display:flex; align-items:center; gap:8px; padding:6px 8px; }
    .subagent-title { font-weight:600; font-size:13px; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
    .expander { border:none; background:transparent; font-size:16px; cursor:pointer; }
    .approval-row { display:flex; justify-content:space-between; align-items:center; padding:8px 10px; font-size:12px; background:#fffbeb; border-top:1px dashed #f59e0b; border-bottom:1px dashed #f59e0b; }
    .approval-actions { display:flex; gap:6px; }
    .subagent-body { border-top:1px dashed #e5e7eb; padding:8px 10px; display:grid; gap:8px; }
    .thinking { white-space:pre-wrap; color:#0f172a; font-size:12px; }

    .entities { display:grid; gap:8px; }
    .entity-card { border:1px solid #e5e7eb; border-radius:8px; padding:8px; }
    .entity-head { display:flex; align-items:center; gap:8px; }
    .pill { background:#e2e8f0; font-size:10px; padding:2px 6px; border-radius:99px; }
    .entity-name { font-weight:700; font-size:13px; }
    .entity-actions { display:flex; gap:8px; margin-top:6px; align-items:center; }

    .stopped-notice { margin-top:8px; background:#f1f5f9; padding:6px 8px; border-radius:8px; color:#0f172a; font-size:12px; }

    /* Summary */
    .floating-summary-btn { position:fixed; right:24px; bottom:92px; border-radius:999px; background:#4f46e5; color:#fff; padding:8px 14px; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,0.15); z-index:5; font-size:12px;}
    .summary-drawer { position:fixed; right:0; top:0; width:340px; height:100%; background:#f9fafb; border-left:1px solid #e5e7eb; box-shadow:-4px 0 12px rgba(0,0,0,0.08); animation:slideIn .25s ease; z-index:6; display:flex; flex-direction:column; }
    .drawer-head { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #e5e7eb; }
    .timeline { padding:10px 12px; overflow:auto; }
    .tl-row { position:relative; display:flex; gap:10px; margin-bottom:12px; }
    .tl-row::before { content:''; position:absolute; left:6px; top:14px; bottom:-6px; width:2px; background:#e2e8f0; }
    .tl-dot { width:12px; height:12px; border-radius:50%; margin-top:4px; background:#cbd5e1; flex:0 0 auto; }
    .tl-dot.feature { background:#0ea5e9; }
    .tl-dot.rule { background:#f59e0b; }
    .tl-dot.analysis, .tl-dot.workflow, .tl-dot.other { background:#a78bfa; }
    .tl-card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:8px 10px; flex:1; }
    .tl-top { display:flex; align-items:center; gap:8px; font-size:11px; color:#64748b; }
    .tl-kind { font-weight:600; }
    .tl-time { margin-left:auto; }
    .tl-label { display:block; margin-top:4px; font-weight:600; text-decoration:none; color:#111827; }
    .tl-actions { display:flex; gap:8px; margin-top:6px; align-items:center; }
    .tag { font-size:11px; background:#e2e8f0; padding:2px 8px; border-radius:99px; }
    .tag.unaccepted { background:#fee2e2; color:#991b1b; }

    /* Composer with icon buttons */
    .composer-bottom { position:fixed; left:260px; right:0; bottom:0; background:#fff; border-top:1px solid #e5e7eb; padding:10px 16px; display:flex; gap:10px; align-items:flex-end; z-index:4; }
    .composer-bottom textarea { flex:1; resize:vertical; min-height:56px; padding:8px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; }
    .composer-actions { display:flex; gap:6px; }
    .icon-btn { width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #e5e7eb; background:#f8fafc; border-radius:8px; font-size:14px; cursor:pointer; }
    .icon-btn:hover { filter:brightness(0.98); }
    .icon-btn.danger { background:#fee2e2; border-color:#fecaca; color:#991b1b; }

    /* Buttons */
    .btn { border:1px solid #e5e7eb; background:#fff; border-radius:8px; padding:6px 10px; cursor:pointer; font-size:12px; }
    .btn:hover { background:#f8fafc; }
    .btn.btn-primary { background:#4f46e5; color:#fff; border-color:#4f46e5; }
    .btn.btn-ghost { background:transparent; border-color:transparent; color:#0f172a; }
    .btn-link { border:none; background:transparent; color:#4f46e5; cursor:pointer; text-decoration:none; font-size:12px; }
    .chip { border:1px solid #e5e7eb; background:#f8fafc; border-radius:999px; padding:4px 10px; font-size:12px; cursor:pointer; }
    .chip.micro { padding:2px 8px; font-size:11px; }
    .chip:hover { filter:brightness(0.98); }
    .chip-primary { background:#eef2ff; border-color:#c7d2fe; color:#3730a3; }
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
    subAgents: [
      { id: 'sa1', name: 'Feature Generator', status: 'Idle', expanded: false, needsApproval: true, approvalAsked: true, response: '' },
      { id: 'sa2', name: 'Rule Drafting',   status: 'Idle', expanded: false, needsApproval: true, approvalAsked: true, response: '' }
    ]
  }];

  summary: ChatSummaryItem[] = [
    { id: 's1', label: 'Started: Fraud Pattern Analysis', kind: 'analysis', anchorId: 'anchor-r1', time: new Date() }
  ];

  /* history */
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

  /* prompt */
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
      subAgents: [
        { id: runId + '-a', name: 'Feature Generator', status: 'Idle', expanded: false, needsApproval: true, approvalAsked: true, response: '' },
        { id: runId + '-b', name: 'Rule Drafting',   status: 'Idle', expanded: false, needsApproval: true, approvalAsked: true, response: '' }
      ]
    };
    this.runs.unshift(newRun);
    this.summary.unshift({ id: 's-' + runId, label: 'Started: ' + newRun.name, kind: 'analysis', anchorId, time: new Date() });
    this.prompt = '';
  }
  copyPrompt() { const text = this.prompt || ''; navigator.clipboard?.writeText(text).catch(() => {}); }

  /* preview */
  openPreview(e: Entity) { this.previewEntity = e; this.previewOpen = true; }
  closePreview() { this.previewOpen = false; this.previewEntity = undefined; }

  /* summary */
  toggleSummary(next?: boolean) { this.showSummary = typeof next === 'boolean' ? next : !this.showSummary; }
  scrollToAnchor(anchorId: string) { const el = document.getElementById(anchorId); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  revertActivity(s: ChatSummaryItem) { if (!s.createdEntityId) return; const e = this.findEntityById(s.createdEntityId); if (e && !e.saved) this.revertEntity(e); }

  /* stop controls */
  anyRunRunning(): boolean { return this.runs.some(r => r.status === 'Running'); }
  stopMain() { this.runs.forEach(r => this.stopRun(r)); }
  stopRun(run: AgentRun) {
    run.status = 'Stopped';
    run.subAgents.forEach(sa => { if (sa.status === 'Running' || sa.status === 'Idle') sa.status = 'Stopped'; });
  }
  stopSubAgent(sa: SubAgent) { if (sa.status === 'Running') sa.status = 'Stopped'; }

  /* approval → generate */
  approveSubAgentToGenerate(sa: SubAgent) {
    sa.needsApproval = false;
    sa.status = 'Running';
    setTimeout(() => {
      if (sa.name.toLowerCase().includes('feature')) {
        sa.response = 'Created feature: AverageCheckAmount365';
        sa.generatedEntities = [{
          id: 'feat-' + Date.now(),
          type: 'feature',
          name: 'AverageCheckAmount365',
          description: 'Average check amount per customer in last 365 days',
          saved: false,
          preview: {},
          editUrl: '/features/AverageCheckAmount365/edit'
        }];
        this.summary.unshift({
          id: 'sum-' + sa.id, label: 'Feature generated: AverageCheckAmount365', kind: 'feature',
          anchorId: this.runs[0].anchorId, createdEntityId: sa.generatedEntities[0].id, isSaved: false, time: new Date()
        });
      } else {
        sa.response = 'Drafted rule: RTP Outgoing Amount & Frequency (10d)';
        sa.generatedEntities = [{
          id: 'rule-' + Date.now(),
          type: 'rule',
          name: 'RTP Outgoing: High Amount & Frequency (10d)',
          description: 'Trigger when 10d sum >= 5000 AND frequency >= 5',
          saved: false,
          preview: {},
          editUrl: '/rules/rtp_outgoing_amount_freq_10d/edit'
        }];
        this.summary.unshift({
          id: 'sum-' + sa.id, label: 'Rule drafted: RTP Outgoing Amount & Frequency (10d)', kind: 'rule',
          anchorId: this.runs[0].anchorId, createdEntityId: sa.generatedEntities[0].id, isSaved: false, time: new Date()
        });
      }
      sa.status = 'Completed';
    }, 500);
  }
  rejectSubAgent(sa: SubAgent) { sa.needsApproval = false; sa.response = 'User rejected this step.'; sa.status = 'Completed'; }

  /* accept / revert */
  acceptEntity(e: Entity) {
    e.saved = true;
    e.platformUrl = e.type === 'feature'
      ? 'https://app.datavisor.com/features/' + encodeURIComponent(e.name)
      : 'https://app.datavisor.com/rules/' + encodeURIComponent(e.name);
    const s = this.summary.find(x => x.createdEntityId === e.id);
    if (s) s.isSaved = true;
  }
  revertEntity(e: Entity) {
    this.runs.forEach(r => r.subAgents.forEach(sa => {
      sa.generatedEntities = (sa.generatedEntities || []).filter(x => x.id !== e.id);
    }));
    if (this.previewEntity?.id === e.id) this.closePreview();
    this.summary = this.summary.filter(s => s.createdEntityId !== e.id);
  }
  removeEntityEverywhere(e: Entity) { this.revertEntity(e); }

  /* helpers */
  private findEntityById(id: string): Entity | undefined {
    for (const r of this.runs) for (const sa of r.subAgents) {
      const found = (sa.generatedEntities || []).find(e => e.id === id);
      if (found) return found;
    }
    return undefined;
  }
}
