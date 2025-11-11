import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface ChatSummaryItem {
  id: string;
  label: string;
  kind: 'feature' | 'rule' | 'dataset' | 'analysis' | 'workflow' | 'other';
  anchorId: string;
  createdEntityId?: string;
  isSaved?: boolean;
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
  updatedAt: Date;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-chat-workbench',
  template: `
  <div class="app-shell">
    <aside class="left-rail">
      <div class="left-rail-header">
        <button class="btn btn-primary" (click)="newChat()">+ New Chat</button>
        <div class="search-wrap"><input [(ngModel)]="historySearch" (input)="filterHistory()" placeholder="Search chats" /></div>
      </div>
      <div class="history-list">
        <div *ngFor="let c of filteredHistory" class="history-item" [class.active]="c.id===activeChatId" (click)="selectChat(c.id)">
          <div class="title">{{ c.title }}</div>
          <div class="meta">{{ c.updatedAt | date:'yyyy-MM-dd HH:mm' }}</div>
        </div>
      </div>
    </aside>

    <main class="main-pane">
      <header class="main-header">
        <div class="chat-title">{{ activeChat?.title }}</div>
        <div class="header-actions"><button class="btn" (click)="showSummary = !showSummary">{{ showSummary ? 'Hide' : 'Show' }} Summary</button></div>
      </header>

      <section class="summary" *ngIf="showSummary">
        <div class="summary-header">Activity Summary</div>
        <div class="summary-items">
          <div *ngFor="let s of summary" class="summary-item">
            <a href="#" (click)="scrollToAnchor(s.anchorId); $event.preventDefault();">{{ s.label }}</a>
            <span class="tag" [class.unsaved]="s.createdEntityId && !s.isSaved" *ngIf="s.createdEntityId">{{ s.isSaved ? 'Saved' : 'Unsaved' }}</span>
            <button class="btn btn-link danger" *ngIf="s.createdEntityId && !s.isSaved" (click)="revertActivity(s)">Revert</button>
          </div>
        </div>
      </section>

      <section class="composer">
        <textarea [(ngModel)]="prompt" rows="3" placeholder="Ask the AI to create a feature, draft a rule, generate a dataset, investigate alerts, create dashboards, ..."></textarea>
        <div class="composer-actions">
          <button class="btn btn-primary" (click)="sendPrompt()">Send</button>
          <button class="btn" (click)="copyPrompt()" title="Copy prompt" [class.floating-copy]="true">Copy</button>
        </div>
      </section>

      <section class="orchestration" *ngFor="let run of runs">
        <div class="agent-header" [id]="run.anchorId">
          <div class="agent-title"><span class="dot" [class.running]="run.status==='Running'" [class.completed]="run.status==='Completed'" [class.stopped]="run.status==='Stopped'"></span>{{ run.name }}</div>
          <div class="agent-actions"><span class="status">{{ run.status }}</span><button class="btn danger" *ngIf="run.status==='Running'" (click)="stopRun(run)">Stop</button></div>
        </div>

        <div class="approval-bar" *ngIf="run.approvalPending">
          <div>Approval required</div>
          <div class="approval-actions">
            <button class="btn btn-primary" (click)="approve(run)">Approve</button>
            <button class="btn" (click)="reject(run)">Reject</button>
          </div>
        </div>

        <div class="subagents">
          <div class="subagent" *ngFor="let sa of run.subAgents">
            <div class="subagent-header">
              <button class="expander" (click)="sa.expanded = !sa.expanded">{{ sa.expanded ? '▾' : '▸' }}</button>
              <div class="subagent-title">{{ sa.name }}</div>
              <div class="spacer"></div>
              <div class="subagent-status" [class.running]="sa.status==='Running'" [class.completed]="sa.status==='Completed'" [class.stopped]="sa.status==='Stopped'">{{ sa.status }}</div>
              <button class="btn danger" *ngIf="sa.status==='Running'" (click)="stopSubAgent(sa)">Stop</button>
            </div>

            <div class="approval-row" *ngIf="sa.needsApproval">
              <span>Approval required</span>
              <div class="approval-actions"><button class="btn btn-primary" (click)="approveSubAgent(sa)">Approve</button><button class="btn" (click)="rejectSubAgent(sa)">Reject</button></div>
            </div>

            <div class="subagent-body" *ngIf="sa.expanded">
              <div class="thinking">{{ sa.response || 'Thinking…' }}</div>
              <div class="agent-input"><input [(ngModel)]="sa.additionalInput" placeholder="Add extra guidance for this sub-agent (optional)" /><button class="btn" (click)="sendAdditionalInput(sa)">Send</button></div>
              <div class="entities" *ngIf="sa.generatedEntities?.length">
                <div class="entity-card" *ngFor="let e of sa.generatedEntities">
                  <div class="entity-head"><span class="pill">{{ e.type | titlecase }}</span><span class="entity-name">{{ e.name }}</span><span class="spacer"></span><button class="btn small" (click)="openPreview(e)">Preview</button></div>
                  <div class="entity-sub">{{ e.description }}</div>
                  <div class="entity-actions">
                    <button class="btn btn-primary small" (click)="saveEntity(e)">Save</button>
                    <button class="btn small" (click)="deleteEntity(e)">Delete</button>
                    <a class="btn-link small" *ngIf="e.saved && e.editUrl" [href]="e.editUrl" target="_blank">Open in Editor ↗</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="stopped-notice" *ngIf="run.status==='Stopped'">
          This agent was stopped. It will not continue remaining tasks from the prompt, but you can continue to enter new prompts above.
        </div>
      </section>

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
                <button class="btn small" (click)="openPreview(e)">Preview</button>
                <button class="btn small" *ngIf="!e.saved" (click)="saveEntity(e)">Save</button>
                <button class="btn small" *ngIf="!e.saved" (click)="removeEntityEverywhere(e)">Remove</button>
                <a class="btn-link small" *ngIf="e.saved && e.editUrl" [href]="e.editUrl" target="_blank">Open in Editor ↗</a>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>

    <section class="preview-pane" *ngIf="previewOpen">
      <div class="preview-head"><div class="title">Preview: {{ previewEntity?.type | titlecase }} — {{ previewEntity?.name }}</div><div class="actions"><button class="btn" (click)="previewOpen=false">Close</button></div></div>
      <div class="preview-body" *ngIf="previewEntity as p">
        <ng-container [ngSwitch]="p.type">
          <div *ngSwitchCase="'rule'" class="dv-card">
            <div class="dv-card-title">Rule Definition</div>
            <div class="dv-grid"><div><label>Name</label><div>{{ p.name }}</div></div><div><label>Condition</label><div>{{ p.preview?.condition || 'amount > 1000 AND velocity_24h > 3' }}</div></div><div><label>Actions</label><div>{{ p.preview?.actions || 'Decline, Add to Watchlist' }}</div></div></div>
          </div>
          <div *ngSwitchCase="'feature'" class="dv-card">
            <div class="dv-card-title">Feature Definition</div>
            <div class="dv-grid"><div><label>Name</label><div>{{ p.name }}</div></div><div><label>Type</label><div>{{ p.preview?.type || 'Aggregation (sum, 24h window)' }}</div></div><div><label>Expression</label><div class="code">{{ p.preview?.expression || 'sum(amount) OVER user_id LAST 24h' }}</div></div></div>
          </div>
          <div *ngSwitchCase="'dataset'" class="dv-card">
            <div class="dv-card-title">Dataset Sample</div>
            <div class="table-like">
              <div class="row header"><div>event_id</div><div>user_id</div><div>amount</div><div>timestamp</div></div>
              <div class="row" *ngFor="let r of (p.preview?.rows || sampleRows)"><div>{{ r.event_id }}</div><div>{{ r.user_id }}</div><div>{{ r.amount }}</div><div>{{ r.ts }}</div></div>
            </div>
          </div>
        </ng-container>
        <div class="preview-actions"><button class="btn btn-primary" (click)="saveEntity(p)">Save</button><button class="btn" (click)="deleteEntity(p)">Delete</button><a class="btn-link" *ngIf="p.saved && p.editUrl" [href]="p.editUrl" target="_blank">Open in Editor ↗</a></div>
      </div>
    </section>
  </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; }
    .app-shell { display: grid; grid-template-columns: 280px 1fr 520px; height: 100%; }
    .left-rail { border-right: 1px solid #e5e7eb; padding: 12px; overflow: hidden; display:flex; flex-direction:column; }
    .left-rail-header { display:flex; gap: 8px; align-items: center; }
    .search-wrap { flex: 1; }
    .search-wrap input { width: 100%; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .history-list { margin-top: 12px; overflow: auto; }
    .history-item { padding: 10px; border-radius: 8px; cursor: pointer; }
    .history-item:hover { background:#f8fafc; }
    .history-item.active { background:#eef2ff; }
    .history-item .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .history-item .meta { font-size: 12px; color:#64748b; }

    .main-pane { position: relative; overflow: auto; padding: 16px 20px 140px; }
    .main-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 10px; }
    .chat-title { font-size: 18px; font-weight: 700; }

    .summary { background:#f8fafc; border:1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
    .summary-header { font-weight: 700; margin-bottom: 8px; }
    .summary-items { display: grid; gap: 6px; }
    .summary-item { display:flex; gap: 10px; align-items:center; }
    .summary-item .tag { font-size:11px; background:#e2e8f0; padding:2px 6px; border-radius:99px; }
    .summary-item .tag.unsaved { background:#fee2e2; color:#991b1b; }

    .composer { position: sticky; top: 0; background: white; border-bottom: 1px solid #e5e7eb; padding: 12px 0; z-index: 2; }
    .composer textarea { width: 100%; resize: vertical; padding: 10px; border:1px solid #e5e7eb; border-radius: 8px; }
    .composer-actions { display:flex; gap: 8px; margin-top: 8px; position: relative; }
    .floating-copy { position:absolute; right:0; top:0; }

    .orchestration { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin-top: 14px; }
    .agent-header { display:flex; align-items:center; justify-content:space-between; padding: 6px 0 10px; }
    .agent-title { font-weight: 700; display:flex; gap:8px; align-items:center; }
    .agent-actions { display:flex; align-items:center; gap:10px; }
    .status { font-size:12px; color:#475569; }
    .dot { width:10px; height:10px; border-radius:50%; background:#cbd5e1; display:inline-block; }
    .dot.running { background:#fde68a; }
    .dot.completed { background:#86efac; }
    .dot.stopped { background:#fecaca; }

    .approval-bar { background:#fffbeb; border:1px dashed #f59e0b; padding: 8px 10px; border-radius:8px; display:flex; align-items:center; justify-content:space-between; margin-bottom: 10px; }
    .approval-actions { display:flex; gap: 8px; }

    .subagents { display:grid; gap:8px; }
    .subagent { border:1px solid #e5e7eb; border-radius: 8px; }
    .subagent-header { display:flex; align-items:center; gap:10px; padding:8px 10px; }
    .subagent-title { font-weight:600; }
    .subagent-status { font-size:12px; padding: 2px 8px; border-radius: 99px; background:#e2e8f0; }
    .subagent-status.running { background:#fde68a; }
    .subagent-status.completed { background:#bbf7d0; }
    .subagent-status.stopped { background:#fecaca; }
    .expander { border:none; background:transparent; font-size:16px; cursor:pointer; }
    .approval-row { display:flex; justify-content:space-between; align-items:center; padding:0 12px 8px; }
    .subagent-body { border-top:1px dashed #e5e7eb; padding: 10px 12px; display:grid; gap:10px; }
    .thinking { white-space: pre-wrap; color:#0f172a; }
    .agent-input { display:flex; gap:8px; }
    .agent-input input { flex:1; padding: 8px; border:1px solid #e5e7eb; border-radius: 8px; }

    .entities { display:grid; gap: 10px; }
    .entity-card { border:1px solid #e5e7eb; border-radius:8px; padding:10px; }
    .entity-head { display:flex; align-items:center; gap: 10px; }
    .pill { background:#e2e8f0; font-size: 11px; padding:2px 6px; border-radius:99px; }
    .entity-name { font-weight:700; }
    .entity-sub { font-size:13px; color:#475569; margin-top:4px; }
    .entity-actions { display:flex; gap:10px; margin-top:8px; align-items:center; }

    .stopped-notice { margin-top: 8px; background:#f1f5f9; padding:8px 10px; border-radius:8px; color:#0f172a; }

    .entity-summary { margin-top: 16px; border:1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
    .entity-summary table { width:100%; border-collapse: collapse; }
    .entity-summary th, .entity-summary td { text-align:left; padding:8px; border-bottom:1px solid #e5e7eb; }
    .tag { font-size:12px; background:#e2e8f0; padding:2px 8px; border-radius:99px; }
    .tag.unsaved { background:#fee2e2; color:#991b1b; }

    .preview-pane { border-left: 1px solid #e5e7eb; background:#fafafa; padding: 12px; overflow:auto; }
    .preview-head { display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px; }
    .preview-head .title { font-weight: 700; }
    .dv-card { background:white; border:1px solid #e5e7eb; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
    .dv-card-title { font-weight:700; margin-bottom: 8px; }
    .dv-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
    .dv-grid label { font-size: 12px; color:#64748b; }
    .code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background:#f8fafc; padding: 6px; border-radius: 6px; border: 1px solid #e5e7eb; }
    .table-like { border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; background:white; }
    .table-like .row { display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; }
    .table-like .row > div { padding:8px; border-bottom:1px solid #e5e7eb; }
    .table-like .row.header { background:#f8fafc; font-weight:600; }

    .preview-actions { display:flex; gap:10px; }

    .btn { border:1px solid #e5e7eb; background:white; border-radius: 8px; padding: 6px 10px; cursor:pointer; }
    .btn:hover { background:#f8fafc; }
    .btn.small { padding: 4px 8px; font-size: 12px; }
    .btn.btn-primary { background:#4f46e5; color:white; border-color:#4f46e5; }
    .btn.btn-primary:hover { filter: brightness(0.95); }
    .btn.btn-link { border:none; background:transparent; color:#4f46e5; cursor:pointer; }
    .btn.btn-link.danger { color:#b91c1c; }
    .btn.danger { background:#fee2e2; border-color:#fecaca; color:#991b1b; }
    .spacer { flex:1; }
  `]
})
export class ChatWorkbenchComponent {
  historySearch = '';
  history: ChatItem[] = [
    { id: 'c1', title: 'create a feature calculating total amount per user (24h)', updatedAt: new Date() },
    { id: 'c2', title: 'update a rule for high-velocity ACH', updatedAt: new Date(Date.now() - 86400000) },
    { id: 'c3', title: 'transformer for profile', updatedAt: new Date(Date.now() - 3*86400000) },
  ];
  filteredHistory: ChatItem[] = [...this.history];
  activeChatId = 'c1';
  get activeChat(): ChatItem | undefined { return this.history.find(h => h.id === this.activeChatId); }

  prompt = '';

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

  showSummary = true;
  summary: ChatSummaryItem[] = [{ id: 's1', label: 'Started: Fraud Pattern Analysis', kind: 'analysis', anchorId: 'anchor-r1' }];

  previewOpen = false;
  previewEntity?: Entity;

  sampleRows = [
    { event_id: 'e01', user_id: 'u01', amount: 124.55, ts: '2025-11-08T11:24:00Z' },
    { event_id: 'e02', user_id: 'u01', amount: 88.10, ts: '2025-11-08T12:10:00Z' },
    { event_id: 'e03', user_id: 'u02', amount: 921.00, ts: '2025-11-08T12:22:30Z' },
  ];

  filterHistory() { const q = this.historySearch.toLowerCase(); this.filteredHistory = this.history.filter(h => h.title.toLowerCase().includes(q)); }
  selectChat(id: string) { this.activeChatId = id; }
  newChat() {
    const id = 'c' + (this.history.length + 1);
    const item: ChatItem = { id, title: 'New Chat', updatedAt: new Date() };
    this.history.unshift(item); this.filteredHistory = [...this.history]; this.activeChatId = id;
  }

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
    this.summary.unshift({ id: 's-' + runId, label: 'Started: ' + newRun.name, kind: 'analysis', anchorId });
    this.prompt = '';
  }

  copyPrompt() { const text = this.prompt || ''; navigator.clipboard?.writeText(text).catch(() => {}); }

  stopRun(run: AgentRun) { run.status = 'Stopped'; run.stopped = true; run.approvalPending = false; run.subAgents.forEach(sa => sa.status = sa.status === 'Completed' ? 'Completed' : 'Stopped'); }
  approve(run: AgentRun) {
    run.approvalPending = false;
    run.subAgents.forEach((sa, idx) => {
      sa.status = 'Running';
      if (idx === 0) setTimeout(() => {
        sa.response = 'Generated feature based on user behavior (sum(amount) over 24h).';
        sa.generatedEntities = [{
          id: 'feat-' + Date.now(), type: 'feature', name: 'total_amount_24h_by_user',
          description: 'Aggregation over 24h by user_id', saved: false,
          preview: { type: 'Aggregation', expression: 'sum(amount) OVER user_id LAST 24h' },
          editUrl: '/features/total_amount_24h_by_user/edit'
        }];
        sa.status = 'Completed';
        this.summary.unshift({
          id: 'sum-' + sa.id, label: 'Feature generated: total_amount_24h_by_user', kind: 'feature',
          anchorId: run.anchorId, createdEntityId: sa.generatedEntities[0].id, isSaved: false
        });
        this.maybeCompleteRun(run);
      }, 400);
      if (idx === 1) setTimeout(() => {
        sa.response = 'Drafted a rule using velocity and amount thresholds.';
        sa.generatedEntities = [{
          id: 'rule-' + Date.now(), type: 'rule', name: 'HighVelocityLargeAmount',
          description: 'Decline if amount>1000 and velocity_24h>3', saved: false,
          preview: { condition: 'amount > 1000 AND velocity_24h > 3', actions: 'Decline' },
          editUrl: '/rules/HighVelocityLargeAmount/edit'
        }];
        sa.status = 'Completed';
        this.summary.unshift({
          id: 'sum-' + sa.id, label: 'Rule drafted: HighVelocityLargeAmount', kind: 'rule',
          anchorId: run.anchorId, createdEntityId: sa.generatedEntities[0].id, isSaved: false
        });
        this.maybeCompleteRun(run);
      }, 600);
      if (idx === 2) setTimeout(() => {
        sa.response = 'Built a dataset of declined transactions (sample of 1000 rows).';
        sa.generatedEntities = [{
          id: 'ds-' + Date.now(), type: 'dataset', name: 'declined_txn_sample',
          description: 'Sample of declined transactions in last 7d', saved: false,
          preview: { rows: this.sampleRows }, editUrl: '/datasets/declined_txn_sample/edit'
        }];
        sa.status = 'Completed';
        this.summary.unshift({
          id: 'sum-' + sa.id, label: 'Dataset built: declined_txn_sample', kind: 'dataset',
          anchorId: run.anchorId, createdEntityId: sa.generatedEntities[0].id, isSaved: false
        });
        this.maybeCompleteRun(run);
      }, 800);
    });
  }
  reject(run: AgentRun) { run.approvalPending = false; run.status = 'Completed'; }
  maybeCompleteRun(run: AgentRun) { const allDone = run.subAgents.every(sa => sa.status === 'Completed' || sa.status === 'Stopped'); if (allDone && run.status !== 'Stopped') run.status = 'Completed'; }
  stopSubAgent(sa: SubAgent) { sa.status = 'Stopped'; }
  approveSubAgent(sa: SubAgent) { sa.needsApproval = false; sa.status = 'Running'; }
  rejectSubAgent(sa: SubAgent) { sa.needsApproval = false; sa.status = 'Completed'; }
  sendAdditionalInput(sa: SubAgent) { if (!sa.additionalInput) return; sa.response = (sa.response || '') + '\\n\\n[User additional input]: ' + sa.additionalInput; sa.additionalInput = ''; }

  openPreview(e: Entity) { this.previewEntity = e; this.previewOpen = true; }
  saveEntity(e: Entity) { e.saved = true; const sum = this.summary.find(s => s.createdEntityId === e.id); if (sum) sum.isSaved = true; }
  deleteEntity(e: Entity) {
    this.runs.forEach(run => run.subAgents.forEach(sa => { sa.generatedEntities = (sa.generatedEntities || []).filter(x => x.id !== e.id); }));
    if (this.previewEntity?.id === e.id) { this.previewOpen = false; this.previewEntity = undefined; }
    this.summary = this.summary.filter(s => s.createdEntityId !== e.id);
  }
  removeEntityEverywhere(e: Entity) { this.deleteEntity(e); }
  scrollToAnchor(anchorId: string) { const el = document.getElementById(anchorId); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  revertActivity(s: ChatSummaryItem) { if (!s.createdEntityId) return; const entity = this.allEntities().find(e => e.id === s.createdEntityId); if (entity && !entity.saved) { this.deleteEntity(entity); } }
  allEntities(): Entity[] { const list: Entity[] = []; this.runs.forEach(r => r.subAgents.forEach(sa => (sa.generatedEntities || []).forEach(e => list.push(e)))); return list; }
}
