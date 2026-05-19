import React from 'react';

export function ComingSoon({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>This module is reserved in the dashboard. We're starting with Tax Receipts first.</p>
    </div>
  );
}
