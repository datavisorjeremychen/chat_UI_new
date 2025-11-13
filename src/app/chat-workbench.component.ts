import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type Kind = 'feature' | 'rule' | 'dataset' | 'analysis' | 'workflow' | 'other';
type AgentStatus = 'Running' | 'Completed' | 'Stopped' | 'Idle';
type EntityStatus = 'Accepted' | 'Pending' | 'Expired';
type ViewMode = 'user' | 'admin';
type SummaryLevel = 'run' | 'sub';

interface ChatSummaryItem {
  id: string;
  anchorId: string;
  time?: Date;
  agentName: string;   // "Fraud Pattern Analysis" or "Rule Creator"
  level: SummaryLevel; // 'run' (main agent) or 'sub' (sub-agent)
  agentId: string;     // run.id or subAgent.id
}

interface Entity {
  id: string;
  type: 'feature' | 'rule';
  name: string;
  description?: string;
  saved: boolean;       // true => Accepted
  expired?: boolean;    // true => Expired
  preview?: any;
  platformUrl?: string; // “View in Platform”
}

interface SubAgent {
  id: string;
  name: string;
  status: AgentStatus;
  expanded?: boolean;
  needsApproval?: boolean;
  approvalAsked?: boolean;
  thinking?: string;
  response?: string;
  generatedEntities?: Entity[];
  revealed?: boolean;         // render in UI?
  concurrencyGroup?: string;  // same key => concurrent
  denied?: boolean;           // last request was denied
  userPrompt?: string;        // local input buffer for follow-up
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
  pendingCount?: number;
  ownerId: string;
  ownerName: string;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-chat-workbench',
  template: `
  <div class="app-shell" [class.preview-open]="previewOpen">
    <!-- LEFT: History -->
    <aside class="left-rail">
      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" [class.active]="viewMode==='user'" (click)="setViewMode('user')">User</button>
        <button class="tab" [class.active]="viewMode==='admin'" [disabled]="!isAdmin" (click)="setViewMode('admin')">
          Admin <span *ngIf="!isAdmin" class="tab-lock" title="You are not authorized">🔒</span>
        </button>
      </div>

      <div class="left-rail-header">
        <button class="btn btn-primary" *ngIf="viewMode==='user'" (click)="newChat()">+ New Chat</button>
        <div class="search-wrap">
          <input [(ngModel)]="historySearch" (input)="filterHistory()" placeholder="Search chats" />
        </div>
      </div>

      <div class="history-list">
        <div *ngFor="let c of filteredHistory"
             class="history-item"
             [class.active]="c.id===activeChatId"
             (click)="selectChat(c.id)">
          <div class="title-row">
            <div class="title" [title]="c.title">
              {{ c.title }}
              <span *ngIf="getPendingCountForChat(c) > 0"
                    class="pending-badge"
                    [title]="getPendingCountForChat(c) + ' pending'">
                {{ getPendingCountForChat(c) > 99 ? '99+' : getPendingCountForChat(c) }}
              </span>
            </div>
            <div class="timestamp">{{ c.updatedAt | date:'MM/dd HH:mm' }}</div>
          </div>
          <div class="summary-line" [title]="c.summary">{{ c.summary }}</div>
          <div class="owner-line" *ngIf="viewMode==='admin'">
            <span class="owner-chip">👤 {{ c.ownerName }}</span>
          </div>
        </div>

        <div *ngIf="!filteredHistory.length" class="empty-hint">
          <div *ngIf="viewMode==='user'">No chats yet. Click <b>+ New Chat</b> to start.</div>
          <div *ngIf="viewMode==='admin'">No team chats found.</div>
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
          <button class="chip chip-accept" *ngIf="!p.saved && !p.expired" (click)="acceptEntity(p)">✔ Accept</button>
          <button class="chip chip-danger" *ngIf="!p.saved && !p.expired" (click)="rejectEntity(p)">✖ Reject</button>
          <a class="btn-link" *ngIf="p.saved && p.platformUrl" [href]="p.platformUrl" target="_blank">View in Platform ↗</a>
        </div>
      </div>
    </section>

    <!-- RIGHT: Chat -->
    <main class="chat-pane">
      <header class="main-header">
        <div class="chat-title">{{ activeChat?.title }}</div>
        <button class="icon-btn danger" *ngIf="anyRunRunning()" title="Stop all" (click)="stopMain()">■</button>
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

        <!-- Subagents (render only when revealed) -->
        <div class="subagents">
          <div class="subagent" *ngFor="let sa of run.subAgents" [class.hidden]="!sa.revealed">
            <div class="subagent-header">
              <button class="expander" (click)="sa.expanded = !sa.expanded">{{ sa.expanded ? '▾' : '▸' }}</button>
              <div class="subagent-title">
                {{ sa.name }}
                <span class="status micro">{{ sa.status }}</span>
                <button class="icon-btn danger xs" *ngIf="sa.status==='Running'" (click)="stopSubAgent(sa)" title="Stop this sub-agent">■</button>
              </div>
              <div class="spacer"></div>
            </div>

            <!-- Approval first (Approve/Deny) -->
            <div class="approval-row" *ngIf="sa.needsApproval">
              <span>Approval required to generate {{ sa.name.toLowerCase().includes('rule') ? 'Rule' : 'Feature' }}</span>
              <div class="approval-actions">
                <button class="chip chip-accept" (click)="approveSubAgentToGenerate(run, sa)">✔ Approve</button>
                <button class="chip" (click)="denySubAgent(sa)">✖ Deny</button>
              </div>
            </div>

            <!-- Body -->
            <div class="subagent-body" *ngIf="sa.expanded">
              <div class="thinking-line" *ngIf="sa.thinking">
                <span class="bulb">💡</span>
                <span>{{ sa.thinking }}</span>
              </div>

              <div class="thinking" *ngIf="sa.response">{{ sa.response }}</div>

              <div class="entities" *ngIf="sa.generatedEntities?.length">
                <div class="entity-card" *ngFor="let e of sa.generatedEntities">
                  <div class="entity-head">
                    <span class="pill">{{ e.type | titlecase }}</span>
                    <span class="entity-name">{{ e.name }}</span>
                    <!-- Status next to name -->
                    <span class="status-chip"
                          [class.pending]="!e.saved && !e.expired"
                          [class.expired]="e.expired"
                          [class.accepted]="e.saved">
                      <span class="ico">{{ e.expired ? '⌛' : (e.saved ? '✅' : '⏳') }}</span>
                      {{ e.expired ? 'Expired' : (e.saved ? 'Accepted' : 'Pending') }}
                    </span>
                    <span class="spacer"></span>
                    <button class="chip micro" (click)="openPreview(e)">👁 Preview</button>
                  </div>
                  <div class="entity-actions">
                    <button class="chip chip-accept micro" *ngIf="!e.saved && !e.expired" (click)="acceptEntity(e)">✔ Accept</button>
                    <button class="chip chip-danger micro" *ngIf="!e.saved && !e.expired" (click)="rejectEntity(e)">✖ Reject</button>
                    <a class="btn-link small" *ngIf="e.saved && e.platformUrl" [href]="e.platformUrl" target="_blank">View in Platform ↗</a>
                  </div>
                </div>
              </div>

              <!-- FOLLOW-UP COMPOSER -->
              <div class="followup-wrap" *ngIf="canFollowUp(sa)">
                <textarea [(ngModel)]="sa.userPrompt"
                          rows="2"
                          placeholder="Add more instructions for {{sa.name}} (e.g., tighten thresholds, change window, different entity keys)…"></textarea>
                <div class="followup-actions">
                  <button class="chip chip-accept" (click)="sendSubAgentPrompt(run, sa)">➤ Send to {{sa.name}}</button>
                  <button class="chip" (click)="sa.userPrompt = ''">⟲ Clear</button>
                </div>
                <div class="followup-note">Your follow-up re-queues this step and may require approval again.</div>
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

      <!-- Summary Drawer (agent-centric) -->
      <div class="summary-drawer" *ngIf="showSummary">
        <div class="summary-header drawer-head">
          <h3>Summary</h3>
          <button class="btn btn-ghost" (click)="toggleSummary()">✕</button>
        </div>
        <div class="timeline" style="overflow:auto;">
          <div *ngFor="let s of summary" class="tl-row">
            <div class="tl-dot" [ngClass]="s.level === 'run' ? 'analysis' : 'other'"></div>
            <div class="tl-card">
              <div class="tl-top">
                <span class="tl-kind">{{ s.level === 'run' ? 'Main Agent' : 'Sub-Agent' }}</span>
                <span class="tl-time">{{ (s.time || now) | date:'MM/dd HH:mm' }}</span>
              </div>
              <a href="#" class="tl-label" (click)="scrollToAnchor(s.anchorId); $event.preventDefault(); toggleSummary(false)">
                {{ s.agentName }}
              </a>
              <div class="tl-actions">
                <span class="status-chip"
                      [class.pending]="getSummaryAgentStatus(s)==='Idle' || getSummaryAgentStatus(s)==='Running'"
                      [class.accepted]="getSummaryAgentStatus(s)==='Completed'"
                      [class.expired]="getSummaryAgentStatus(s)==='Stopped'">
                  <span class="ico">
                    {{
                      getSummaryAgentStatus(s)==='Running' ? '⏳' :
                      getSummaryAgentStatus(s)==='Stopped' ? '■' :
                      getSummaryAgentStatus(s)==='Idle' ? '…' : '✅'
                    }}
                  </span>
                  {{ getSummaryAgentStatus(s) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- End-of-convo Accepted list (ONLY after all complete) -->
      <section class="entity-summary" *ngIf="allComplete() && acceptedEntities().length">
        <div class="summary-header">Accepted items in this conversation</div>
        <div class="entity-grid">
          <div class="entity-row" *ngFor="let e of acceptedEntities()">
            <div class="col type">
              <span class="pill">{{ e.type | titlecase }}</span>
            </div>
            <div class="col name">
              <span class="entity-name">{{ e.name }}</span>
            </div>
            <div class="col status">
              <span class="status-chip accepted">
                <span class="ico">✅</span> Accepted
              </span>
            </div>
            <div class="col actions">
              <button class="chip micro" (click)="openPreview(e)">👁 Preview</button>
              <a class="btn-link small" *ngIf="e.platformUrl" [href]="e.platformUrl" target="_blank">View in Platform ↗</a>
            </div>
          </div>
        </div>
      </section>

      <!-- Global Prompt Composer -->
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
    .tabs { display:flex; gap:8px; margin-bottom:8px; }
    .tab { flex:0 0 auto; border:1px solid #e5e7eb; background:#f8fafc; border-radius:999px; padding:6px 10px; font-size:12px; cursor:pointer; }
    .tab.active { background:#eef2ff; border-color:#c7d2fe; color:#1f2a7a; font-weight:600; }
    .tab[disabled] { opacity:.5; cursor:not-allowed; }
    .tab-lock { margin-left:6px; }

    .left-rail-header { display:flex; gap:8px; align-items:center; }
    .search-wrap { flex:1; }
    .search-wrap input { width:100%; padding:6px 8px; border:1px solid #e5e7eb; border-radius:8px; font-size:12px; }
    .history-list { margin-top:10px; overflow:auto; }
    .history-item { padding:10px; border-radius:8px; cursor:pointer; border:1px solid transparent; }
    .history-item:hover { background:#f8fafc; }
    .history-item.active { background:#eef2ff; border-color:#c7d2fe; }
    .title-row { display:flex; align-items:center; gap:8px; }
    .title { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:6px; }
    .pending-badge { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 5px; font-size:11px; font-weight:700; color:#fff; background:#ef4444; border-radius:12px; line-height:1; }
    .timestamp { font-size:11px; color:#64748b; margin-left:auto; }
    .summary-line { margin-top:4px; font-size:12px; color:#475569; line-height:1.25; height:2.5em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient: vertical; }
    .owner-line { margin-top:6px; }
    .owner-chip { font-size:11px; background:#f1f5f9; border:1px solid #e5e7eb; padding:2px 8px; border-radius:999px; color:#334155; }

    /* Preview & DV styling */
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
    .subagent.hidden { display:none; }
    .subagent-header { display:flex; align-items:center; gap:8px; padding:6px 8px; }
    .subagent-title { font-weight:600; font-size:13px; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
    .expander { border:none; background:transparent; font-size:16px; cursor:pointer; }

    .approval-row { display:flex; justify-content:space-between; align-items:center; padding:8px 10px; font-size:12px; background:#fffbeb; border-top:1px dashed #f59e0b; border-bottom:1px dashed #f59e0b; }
    .approval-actions { display:flex; gap:6px; }
    .subagent-body { border-top:1px dashed #e5e7eb; padding:8px 10px; display:grid; gap:8px; }
    .thinking-line { display:flex; gap:6px; align-items:flex-start; font-size:12px; color:#334155; background:#f8fafc; border:1px solid #e5e7eb; padding:6px 8px; border-radius:8px; }
    .thinking-line .bulb { opacity:.8; }
    .thinking { white-space:pre-wrap; color:#0f172a; font-size:12px; }

    .entities { display:grid; gap:8px; }
    .entity-card { border:1px solid #e5e7eb; border-radius:8px; padding:8px; }
    .entity-head { display:flex; align-items:center; gap:8px; }
    .pill { background:#e2e8f0; font-size:10px; padding:2px 6px; border-radius:99px; }
    .entity-name { font-weight:700; font-size:13px; }

    /* Status (filled) vs Action (outlined) */
    .status-chip { display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:2px 10px; font-size:11px; }
    .status-chip.pending { background:#fee4cb; color:#9a3412; }
    .status-chip.accepted { background:#dcfce7; color:#166534; }
    .status-chip.expired { background:#e2e8f0; color:#334155; }
    .status-chip .ico { font-size:12px; }

    .entity-actions { display:flex; gap:8px; margin-top:6px; align-items:center; }
    .chip { border:1px solid #e5e7eb; background:#f8fafc; border-radius:999px; padding:4px 10px; font-size:12px; cursor:pointer; }
    .chip.micro { padding:2px 8px; font-size:11px; }
    .chip-accept { background:#22c55e; color:#fff; border-color:#16a34a; } /* green Accept */
    .chip-danger { background:#fee2e2; border-color:#fecaca; color:#991b1b; }

    /* Follow-up composer */
    .followup-wrap { border:1px dashed #cbd5e1; background:#f8fafc; border-radius:10px; padding:8px; display:grid; gap:8px; }
    .followup-wrap textarea { width:100%; border:1px solid #e5e7eb; border-radius:8px; padding:6px 8px; font-size:12px; }
    .followup-actions { display:flex; gap:8px; align-items:center; }
    .followup-note { font-size:11px; color:#64748b; }

    .stopped-notice { margin-top:8px; background:#f1f5f9; padding:6px 8px; border-radius:8px; color:#0f172a; font-size:12px; }

    /* Summary */
    .floating-summary-btn { position:fixed; right:24px; bottom:92px; border-radius:999px; background:#4f46e5; color:#fff; padding:8px 14px; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,0.15); z-index:5; font-size:12px;}
    .summary-drawer { position:fixed; right:0; top:0; width:340px; height:100%; background:#f9fafb; border-left:1px solid #e5e7eb; box-shadow:-4px 0 12px rgba(0,0,0,0.08); animation:slideIn .25s ease; z-index:6; display:flex; flex-direction:column; }
    .drawer-head { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #e5e7eb; }
    .timeline { padding:10px 12px; height:calc(100% - 44px); overflow:auto; }
    .tl-row { position:relative; display:flex; gap:10px; margin-bottom:12px; }
    .tl-row::before { content:''; position:absolute; left:6px; top:14px; bottom:-6px; width:2px; background:#e2e8f0; }
    .tl-dot { width:12px; height:12px; border-radius:50%; margin-top:4px; background:#cbd5e1; flex:0 0 auto; }
    .tl-dot.analysis { background:#0ea5e9; }
    .tl-dot.other { background:#a78bfa; }
    .tl-card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:8px 10px; flex:1; }
    .tl-top { display:flex; align-items:center; gap:8px; font-size:11px; color:#64748b; }
    .tl-kind { font-weight:600; }
    .tl-time { margin-left:auto; }
    .tl-label { display:block; margin-top:4px; font-weight:600; text-decoration:none; color:#111827; }
    .tl-actions { display:flex; gap:8px; margin-top:6px; align-items:center; }

    /* End-of-chat accepted list */
    .entity-summary { margin-top:12px; border:1px solid #e5e7eb; border-radius:12px; padding:12px; }
    .entity-grid { display:grid; gap:10px; }
    .entity-row { display:grid; grid-template-columns: 120px 1fr 160px 1fr; gap:12px; align-items:center; padding:8px 10px; border:1px solid #e5e7eb; border-radius:10px; background:#fff; }

    /* Composer */
    .composer-bottom { position:fixed; left:260px; right:0; bottom:0; background:#fff; border-top:1px solid #e5e7eb; padding:10px 16px; display:flex; gap:10px; align-items:flex-end; z-index:4; }
    .composer-bottom textarea { flex:1; resize:vertical; min-height:56px; padding:8px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; }
    .composer-actions { display:flex; gap:6px; }
    .icon-btn { width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #e5e7eb; background:#f8fafc; border-radius:8px; font-size:14px; cursor:pointer; }
    .icon-btn.xs { width:26px; height:26px; font-size:12px; padding:0; }
    .icon-btn:hover { filter:brightness(0.98); }
    .icon-btn.danger { background:#fee2e2; border-color:#fecaca; color:#991b1b; }

    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  `]
})
export class ChatWorkbenchComponent {
  /* auth + view mode */
  currentUserId = 'u_self';
  currentUserName = 'You';
  isAdmin = true; // flip to false to test non-admin
  viewMode: ViewMode = 'user';

  /* left rail */
  historySearch = '';
  history: ChatItem[] = [
    { id: 'c1', title: '24h total amount feature', summary: 'Created aggregation feature, drafted velocity rule, and prepared dataset sample for QA and backtesting insights.', updatedAt: new Date(), ownerId: 'u_self', ownerName: 'You' },
    { id: 'c2', title: 'High-velocity ACH rule tuning', summary: 'Adjusted thresholds, added watchlist action; compared lift across cohorts and performed cross-validation on last 30 days.', updatedAt: new Date(Date.now() - 86400000), pendingCount: 0, ownerId: 'u_alex', ownerName: 'Alex Chen' },
    { id: 'c3', title: 'Profile transformer ideas', summary: 'Outlined embeddings & clustering; proposed features for device linkage and time-of-day anomalies with ablations.', updatedAt: new Date(Date.now() - 3*86400000), pendingCount: 2, ownerId: 'u_mei', ownerName: 'Mei Li' },
  ];
  filteredHistory: ChatItem[] = [];
  activeChatId = 'c1';
  get activeChat(): ChatItem | undefined { return this.history.find(h => h.id === this.activeChatId); }

  /* chat state */
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
      // Concurrent A: Feature + Rule visible together
      {
        id: 'sa_feature',
        name: 'Feature Creator',
        status: 'Idle',
        expanded: true,
        needsApproval: true,
        approvalAsked: true,
        thinking: 'Compute 365d moving average per customer on check events; default=0; hotspot=off.',
        response: '',
        revealed: true,
        concurrencyGroup: 'A'
      },
      {
        id: 'sa_rule',
        name: 'Rule Creator',
        status: 'Idle',
        expanded: true,
        needsApproval: true,
        approvalAsked: true,
        thinking: 'Draft RTP rule: 10d amount sum >= 5000 AND frequency >= 5.',
        response: '',
        revealed: true,
        concurrencyGroup: 'A'
      },
      // Sequential: reveal after Rule Creator completes
      {
        id: 'sa_rule_test',
        name: 'Rule Test',
        status: 'Idle',
        expanded: false,
        needsApproval: true,
        approvalAsked: true,
        thinking: 'Run backtests over last 30 days; compute precision/recall and lift vs. baseline.',
        response: '',
        revealed: false,
      }
    ]
  }];

  // Agent-centric Summary (initial main run)
  summary: ChatSummaryItem[] = [
    { id: 's1', anchorId: 'anchor-r1', time: new Date(), agentName: 'Fraud Pattern Analysis', level: 'run', agentId: 'r1' }
  ];

  constructor() {
    this.computeFilteredHistory();
    if (!this.filteredHistory.find(c => c.id === this.activeChatId)) {
      this.activeChatId = this.filteredHistory[0]?.id ?? '';
    }
  }

  /* tabs */
  setViewMode(mode: ViewMode) {
    if (mode === 'admin' && !this.isAdmin) return;
    this.viewMode = mode;
    this.computeFilteredHistory();
    // ensure active chat is visible
    if (!this.filteredHistory.find(c => c.id === this.activeChatId)) {
      this.activeChatId = this.filteredHistory[0]?.id ?? '';
    }
  }

  /* history */
  filterHistory() { this.computeFilteredHistory(); }
  private computeFilteredHistory() {
    const q = this.historySearch.toLowerCase().trim();
    const scope = this.viewMode === 'user'
      ? this.history.filter(h => h.ownerId === this.currentUserId)
      : this.history; // admin sees all
    this.filteredHistory = scope.filter(h => {
      const hay = (h.title + ' ' + h.summary + ' ' + h.ownerName).toLowerCase();
      return !q || hay.includes(q);
    }).sort((a,b) => +b.updatedAt - +a.updatedAt);
  }

  selectChat(id: string) { this.activeChatId = id; }

  newChat() {
    const id = 'c' + (this.history.length + 1);
    const item: ChatItem = {
      id,
      title: 'New Chat',
      summary: 'Kicked off a fresh orchestration to create features, rules, and datasets for investigation.',
      updatedAt: new Date(),
      pendingCount: 1,
      ownerId: this.currentUserId,
      ownerName: this.currentUserName
    };
    this.history.unshift(item);
    this.computeFilteredHistory();
    this.activeChatId = id;
  }

  getPendingCountForChat(chat: ChatItem): number {
    if (chat.id !== this.activeChatId) return chat.pendingCount || 0;
    // Active chat: compute live pending count
    return this.allEntities().filter(e => !e.saved && !e.expired).length;
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
        { id: runId + '-feat', name: 'Feature Creator', status: 'Idle', expanded: true, needsApproval: true, approvalAsked: true, thinking: 'Aggregate & velocity features.', revealed: true, concurrencyGroup: 'A' },
        { id: runId + '-rule', name: 'Rule Creator', status: 'Idle', expanded: true, needsApproval: true, approvalAsked: true, thinking: 'Draft rule with dual thresholds.', revealed: true, concurrencyGroup: 'A' },
        { id: runId + '-test', name: 'Rule Test', status: 'Idle', expanded: false, needsApproval: true, approvalAsked: true, thinking: 'Backtest & metrics.', revealed: false }
      ]
    };
    this.runs.unshift(newRun);

    // Add run-level summary row
    this.summary.unshift({
      id: 's-' + runId,
      anchorId,
      time: new Date(),
      agentName: newRun.name,
      level: 'run',
      agentId: runId
    });

    this.prompt = '';
  }
  copyPrompt() { const text = this.prompt || ''; navigator.clipboard?.writeText(text).catch(() => {}); }

  /* preview */
  openPreview(e: Entity) { this.previewEntity = e; this.previewOpen = true; }
  closePreview() { this.previewOpen = false; this.previewEntity = undefined; }

  /* summary drawer */
  toggleSummary(next?: boolean) { this.showSummary = typeof next === 'boolean' ? next : !this.showSummary; }
  scrollToAnchor(anchorId: string) { const el = document.getElementById(anchorId); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  // Live status lookup for Summary panel
  getSummaryAgentStatus(item: ChatSummaryItem): AgentStatus {
    if (item.level === 'run') {
      const r = this.runs.find(x => x.id === item.agentId);
      return r?.status ?? 'Completed';
    } else {
      for (const r of this.runs) {
        const sa = r.subAgents.find(s => s.id === item.agentId);
        if (sa) return sa.status;
      }
      return 'Completed';
    }
  }

  /* stop controls */
  anyRunRunning(): boolean { return this.runs.some(r => r.status === 'Running'); }
  stopMain() { this.runs.forEach(r => this.stopRun(r)); }
  stopRun(run: AgentRun) {
    run.status = 'Stopped';
    run.subAgents.forEach(sa => { if (sa.status === 'Running' || sa.status === 'Idle') sa.status = 'Stopped'; });
  }
  stopSubAgent(sa: SubAgent) { if (sa.status === 'Running') sa.status = 'Stopped'; }

  /* approval → generate */
  approveSubAgentToGenerate(run: AgentRun, sa: SubAgent) {
    // Add sub-agent row into Summary at approval time
    this.summary.unshift({
      id: 's-' + sa.id + '-' + Date.now(),
      anchorId: run.anchorId,
      time: new Date(),
      agentName: sa.name,
      level: 'sub',
      agentId: sa.id
    });

    sa.needsApproval = false;
    sa.denied = false;
    sa.status = 'Running';

    // Simulate generation & completion
    setTimeout(() => {
      if (sa.name.toLowerCase().includes('feature')) {
        sa.response = 'Created feature: AverageCheckAmount365';
        sa.generatedEntities = [{
          id: 'feat-' + Date.now(),
          type: 'feature',
          name: 'AverageCheckAmount365',
          description: 'Average check amount per customer in last 365 days',
          saved: false, expired: false, preview: {}
        }];
        setTimeout(() => { sa.status = 'Completed'; this.maybeRevealNext(run, sa); this.updatePendingBadge(); this.bumpActiveChatTimestamp(); }, 400);
      } else if (sa.name.toLowerCase().includes('rule creator')) {
        sa.response = 'Drafted rule: RTP Outgoing Amount & Frequency (10d)';
        sa.generatedEntities = [{
          id: 'rule-' + Date.now(),
          type: 'rule',
          name: 'RTP Outgoing: High Amount & Frequency (10d)',
          description: 'Trigger when 10d sum >= 5000 AND frequency >= 5',
          saved: false, expired: false, preview: {}
        }];
        sa.status = 'Completed';
        this.maybeRevealNext(run, sa);
        this.updatePendingBadge();
        this.bumpActiveChatTimestamp();
      } else if (sa.name.toLowerCase().includes('rule test')) {
        sa.response = 'Backtest complete: precision=0.42, recall=0.68, lift=1.9x vs. baseline.';
        sa.generatedEntities = [];
        sa.status = 'Completed';
        this.updatePendingBadge();
        this.bumpActiveChatTimestamp();
      }
    }, 500);
  }

  denySubAgent(sa: SubAgent) {
    sa.needsApproval = false;
    sa.denied = true;              // mark denied so follow-up composer appears
    sa.response = 'User denied this step.';
    sa.status = 'Completed';
  }

  /* Follow-up composer logic */
  canFollowUp(sa: SubAgent): boolean {
    return sa.status === 'Stopped' || !!sa.denied;
  }

  sendSubAgentPrompt(run: AgentRun, sa: SubAgent) {
    const text = (sa.userPrompt || '').trim();
    if (!text) return;

    // Reset the sub-agent for a new attempt with user constraints
    sa.thinking = `Follow-up: ${text}`;
    sa.response = '';
    sa.generatedEntities = [];
    sa.denied = false;
    sa.userPrompt = '';
    sa.needsApproval = true;   // ask approval again for new plan
    sa.approvalAsked = true;
    sa.status = 'Idle';
    sa.expanded = true;
    sa.revealed = true;

    // Log sub-agent in Summary again (as it re-enters flow)
    this.summary.unshift({
      id: 'fu-' + sa.id + '-' + Date.now(),
      anchorId: run.anchorId,
      time: new Date(),
      agentName: sa.name,
      level: 'sub',
      agentId: sa.id
    });

    this.bumpActiveChatTimestamp();
    this.updatePendingBadge();
  }

  /* Sequential reveal:
     - After "Rule Creator" completes, reveal "Rule Test" */
  private maybeRevealNext(run: AgentRun, completed: SubAgent) {
    if (completed.name.toLowerCase().includes('rule creator')) {
      const next = run.subAgents.find(x => x.name.toLowerCase().includes('rule test'));
      if (next && !next.revealed) {
        next.revealed = true;
        next.expanded = true;
      }
    }
    if (run.subAgents.every(sa => sa.revealed ? (sa.status === 'Completed' || sa.status === 'Stopped') : true)) {
      const anyHidden = run.subAgents.some(sa => !sa.revealed);
      if (!anyHidden) run.status = 'Completed';
    }
  }

  /* entity Accept / Reject */
  acceptEntity(e: Entity) {
    e.saved = true; e.expired = false;
    e.platformUrl = e.type === 'feature'
      ? 'https://app.datavisor.com/features/' + encodeURIComponent(e.name)
      : 'https://app.datavisor.com/rules/' + encodeURIComponent(e.name);
    this.updatePendingBadge();
  }
  rejectEntity(e: Entity) {
    e.saved = false; e.expired = true;
    if (this.previewEntity?.id === e.id) this.closePreview();
    this.updatePendingBadge();
  }

  /* completion & entity helpers */
  allComplete(): boolean {
    const runsDone = this.runs.every(r => r.status !== 'Running');
    const subsDone = this.runs.every(r =>
      r.subAgents
        .filter(sa => sa.revealed)
        .every(sa => (sa.status === 'Completed' || sa.status === 'Stopped') && !sa.needsApproval)
    );
    return runsDone && subsDone;
  }

  allEntities(): Entity[] {
    const out: Entity[] = [];
    this.runs.forEach(run =>
      run.subAgents.forEach(sa =>
        (sa.generatedEntities || []).forEach(e => out.push(e))
      )
    );
    return out;
  }
  acceptedEntities(): Entity[] {
    return this.allEntities().filter(e => e.saved);
  }

  /* helpers */
  private updatePendingBadge() {
    const active = this.history.find(h => h.id === this.activeChatId);
    if (active) active.pendingCount = this.allEntities().filter(x => !x.saved && !x.expired).length;
  }
  private bumpActiveChatTimestamp() {
    const active = this.history.find(h => h.id === this.activeChatId);
    if (active) { active.updatedAt = new Date(); this.computeFilteredHistory(); }
  }
}
