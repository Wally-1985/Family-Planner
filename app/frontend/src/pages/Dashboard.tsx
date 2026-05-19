import React from 'react';
import { CheckCircle2, ChevronRight, Cloud, FileScan, ReceiptText, Sparkles } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import type { Page } from '../types';

const receiptTrend = [
  { month: 'Jan', receipts: 18, reviewed: 12 },
  { month: 'Feb', receipts: 31, reviewed: 25 },
  { month: 'Mar', receipts: 26, reviewed: 20 },
  { month: 'Apr', receipts: 44, reviewed: 35 },
  { month: 'May', receipts: 37, reviewed: 22 }
];

const categorySpend = [
  { name: 'Fuel', value: 1840 },
  { name: 'Tools', value: 1260 },
  { name: 'Meals', value: 720 },
  { name: 'Software', value: 950 },
  { name: 'Travel', value: 1110 }
];

export function Dashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <section className="content-grid dashboard-grid">
      <HeroCard />
      <MetricCard title="Receipts synced" value="156" detail="37 this month" icon={<Cloud />} />
      <MetricCard title="Needs review" value="21" detail="AI confidence under threshold" icon={<FileScan />} />
      <MetricCard title="Ready to write" value="68" detail="Approved metadata pending" icon={<CheckCircle2 />} />
      <div className="card chart-card span-2">
        <div className="card-header">
          <div>
            <p className="eyebrow">Progress</p>
            <h2>Receipt processing trend</h2>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={receiptTrend}>
            <defs>
              <linearGradient id="receipts" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" stroke="var(--muted)" />
            <YAxis stroke="var(--muted)" />
            <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }} />
            <Area type="monotone" dataKey="receipts" stroke="var(--accent)" fill="url(#receipts)" strokeWidth={3} />
            <Area type="monotone" dataKey="reviewed" stroke="var(--success)" fill="transparent" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="card chart-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Spend</p>
            <h2>Top categories</h2>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={categorySpend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" stroke="var(--muted)" />
            <YAxis stroke="var(--muted)" />
            <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 }} />
            <Bar dataKey="value" fill="var(--accent)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <button className="card action-card" onClick={() => onNavigate('receipts-inbox')}>
        <ReceiptText />
        <div>
          <h2>Open Tax Receipts</h2>
          <p>Review OCR, extracted fields, SharePoint sync state, and write-back queue.</p>
        </div>
        <ChevronRight />
      </button>
    </section>
  );
}

export function HeroCard() {
  return (
    <div className="hero-card span-2">
      <div>
        <p className="eyebrow">Tax Receipts MVP</p>
        <h2>One calm place to sync, OCR, review, and file receipts.</h2>
        <p>
          Built to keep SharePoint as the document source of truth while this app tracks progress, extraction confidence, and approval history.
        </p>
      </div>
      <div className="hero-orb"><Sparkles /></div>
    </div>
  );
}

export function MetricCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="card metric-card">
      <div className="metric-icon">{icon}</div>
      <p>{title}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}
