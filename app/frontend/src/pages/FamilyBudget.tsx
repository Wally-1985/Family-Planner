import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Landmark, ReceiptText, WalletCards } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import type {
  BudgetCycle, BudgetIntervalUnit, BudgetItem, BudgetKind, BudgetSchedule,
  ActualCostTransaction, CsvMapping, ProjectionRangePreset, SavingsAccount, SortDirection
} from '../types';
import {
  FAMILY_BUDGET_STORAGE_KEY, SAVINGS_ACCOUNTS_STORAGE_KEY, FAMILY_BUDGET_CATEGORIES_STORAGE_KEY,
  defaultExpenseCategories, categoryChartColors
} from '../types';
import { MetricCard } from './Dashboard';

// ── utility functions ──────────────────────────────────────────────────────

export function normalizeBudgetItem(item: BudgetItem): BudgetItem {
  const cycle = (item.cycle as string) === 'yearly' ? 'annually' : item.cycle;
  return {
    ...item,
    cycle,
    schedule: normalizeBudgetSchedule(item.schedule, cycle),
    intervalCount: item.intervalCount || defaultIntervalFromCycle(cycle).count,
    intervalUnit: item.intervalUnit || defaultIntervalFromCycle(cycle).unit,
    daysOfMonth: item.daysOfMonth || (item.dayOfMonth ? [item.dayOfMonth] : [])
  };
}

export function defaultIntervalFromCycle(cycle: BudgetCycle): { count: number; unit: BudgetIntervalUnit } {
  if (cycle === 'fortnightly') return { count: 2, unit: 'week' };
  if (cycle === 'monthly') return { count: 1, unit: 'month' };
  if (cycle === 'quarterly') return { count: 3, unit: 'month' };
  if (cycle === 'bi-annually') return { count: 6, unit: 'month' };
  if (cycle === 'annually') return { count: 1, unit: 'year' };
  return { count: 1, unit: 'week' };
}

export function normalizeBudgetSchedule(schedule: BudgetItem['schedule'], cycle: BudgetCycle): BudgetSchedule {
  if ((schedule as string) === 'reoccurring') return 'recurring';
  if (schedule) return schedule;
  if (cycle === 'once-off') return 'once-off';
  if (cycle === 'random') return 'random';
  return 'recurring';
}

export function loadFamilyBudgetItems(): BudgetItem[] {
  try {
    const stored = localStorage.getItem(FAMILY_BUDGET_STORAGE_KEY);
    if (!stored) return familyBudgetItems;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return familyBudgetItems;
    const validItems = parsed.filter(
      (item) => item && (item.kind === 'income' || item.kind === 'expense') && typeof item.name === 'string' && typeof item.amount === 'number'
    );
    return validItems.map(normalizeBudgetItem);
  } catch {
    return familyBudgetItems;
  }
}

export function loadSavingsAccounts(): SavingsAccount[] {
  try {
    const stored = localStorage.getItem(SAVINGS_ACCOUNTS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a) => a && typeof a.name === 'string' && typeof a.balance === 'number');
  } catch {
    return [];
  }
}

export function loadExpenseCategories(): string[] {
  try {
    const stored = localStorage.getItem(FAMILY_BUDGET_CATEGORIES_STORAGE_KEY);
    if (!stored) return defaultExpenseCategories;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return defaultExpenseCategories;
    const categories = parsed.map((i) => String(i).trim()).filter(Boolean);
    return categories.length ? categories : defaultExpenseCategories;
  } catch {
    return defaultExpenseCategories;
  }
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function formatAuDate(date: Date): string {
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function parseBudgetDate(value: string | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const auMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (auMatch) {
    const [, day, month, year] = auMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatBudgetDateText(value: string): string {
  const parsed = parseBudgetDate(value);
  return parsed ? formatAuDate(parsed) : value;
}

export function toDateInputValue(value: string): string {
  const parsed = parseBudgetDate(value);
  if (!parsed) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
}

export function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: value % 1 === 0 ? 0 : 1 });
}

function dateInRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

function addInterval(date: Date, count: number, unit: BudgetIntervalUnit): Date {
  const copy = new Date(date);
  if (unit === 'day') copy.setDate(copy.getDate() + count);
  if (unit === 'week') copy.setDate(copy.getDate() + count * 7);
  if (unit === 'month') copy.setMonth(copy.getMonth() + count);
  if (unit === 'year') copy.setFullYear(copy.getFullYear() + count);
  return copy;
}

function datesForDayOfMonthBetween(day: number, start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, lastDay));
    if (dateInRange(candidate, start, end)) dates.push(candidate);
  }
  return dates;
}

function startOfBudgetWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (copy.getDay() + 5) % 7;
  return addDays(copy, -diff);
}

export function occurrenceDatesBetween(item: BudgetItem, start: Date, end: Date): Date[] {
  const schedule = normalizeBudgetSchedule(item.schedule, item.cycle);
  const itemEnd = parseBudgetDate(item.endDate);
  const effectiveEnd = itemEnd && itemEnd < end ? itemEnd : end;
  if (effectiveEnd < start) return [];
  if (schedule === 'once-off') {
    return (item.dueDates || []).map(parseBudgetDate).filter((d): d is Date => Boolean(d)).filter((d) => dateInRange(d, start, effectiveEnd));
  }
  if (schedule === 'random') {
    const anchor = parseBudgetDate(item.anchorDate);
    const effectiveStart = anchor && anchor > start ? anchor : start;
    if (effectiveEnd < effectiveStart) return [];
    const days = item.daysOfMonth?.length ? item.daysOfMonth : item.dayOfMonth ? [item.dayOfMonth] : [];
    return days.flatMap((day) => datesForDayOfMonthBetween(day, effectiveStart, effectiveEnd)).filter((d) => !item.months?.length || item.months.includes(d.getMonth() + 1));
  }
  const anchor = parseBudgetDate(item.anchorDate);
  if (!anchor) return [];
  const count = Math.max(1, item.intervalCount || defaultIntervalFromCycle(item.cycle).count);
  const unit = item.intervalUnit || defaultIntervalFromCycle(item.cycle).unit;
  const dates: Date[] = [];
  for (let cursor = new Date(anchor), guard = 0; cursor <= effectiveEnd && guard < 10_000; guard += 1) {
    if (dateInRange(cursor, start, effectiveEnd)) dates.push(new Date(cursor));
    const next = addInterval(cursor, count, unit);
    if (next <= cursor) break;
    cursor = next;
  }
  return dates;
}

function occurrenceCountInWeek(item: BudgetItem, start: Date, end: Date): number {
  const schedule = normalizeBudgetSchedule(item.schedule, item.cycle);
  const itemEnd = parseBudgetDate(item.endDate);
  const effectiveEnd = itemEnd && itemEnd < end ? itemEnd : end;
  if (effectiveEnd < start) return 0;
  if (schedule === 'once-off') {
    return (item.dueDates || []).filter((date) => {
      const parsedDate = parseBudgetDate(date);
      return parsedDate ? dateInRange(parsedDate, start, effectiveEnd) : false;
    }).length;
  }
  if (schedule === 'random') {
    const anchor = parseBudgetDate(item.anchorDate);
    const effectiveStart = anchor && anchor > start ? anchor : start;
    if (effectiveEnd < effectiveStart) return 0;
    const days = item.daysOfMonth?.length ? item.daysOfMonth : item.dayOfMonth ? [item.dayOfMonth] : [];
    if (!days.length) return 0;
    let count = 0;
    for (const day of days) {
      for (const candidate of datesForDayOfMonthBetween(day, effectiveStart, effectiveEnd)) {
        const monthNumber = candidate.getMonth() + 1;
        if (!item.months?.length || item.months.includes(monthNumber)) count += 1;
      }
    }
    return count;
  }
  const anchor = parseBudgetDate(item.anchorDate);
  if (!anchor) return 0;
  const count = Math.max(1, item.intervalCount || defaultIntervalFromCycle(item.cycle).count);
  const unit = item.intervalUnit || defaultIntervalFromCycle(item.cycle).unit;
  let occurrences = 0;
  for (let cursor = new Date(anchor), guard = 0; cursor <= effectiveEnd && guard < 10_000; guard += 1) {
    if (dateInRange(cursor, start, effectiveEnd)) occurrences += 1;
    const next = addInterval(cursor, count, unit);
    if (next <= cursor) break;
    cursor = next;
  }
  return occurrences;
}

export function annualOccurrenceCount(item: BudgetItem): number {
  const schedule = normalizeBudgetSchedule(item.schedule, item.cycle);
  if (schedule === 'once-off') return item.dueDates?.length || 0;
  if (schedule === 'random') {
    const days = item.daysOfMonth?.length ? item.daysOfMonth : item.dayOfMonth ? [item.dayOfMonth] : [];
    const months = item.months?.length ? item.months.length : 12;
    return days.length * months;
  }
  const count = Math.max(1, item.intervalCount || defaultIntervalFromCycle(item.cycle).count);
  const unit = item.intervalUnit || defaultIntervalFromCycle(item.cycle).unit;
  if (unit === 'day') return 365.25 / count;
  if (unit === 'week') return 52.1775 / count;
  if (unit === 'month') return 12 / count;
  if (unit === 'year') return 1 / count;
  return 0;
}

export function annualizedBudgetAmount(item: BudgetItem): number {
  return item.amount * annualOccurrenceCount(item);
}

export function buildScheduleTotalsForRange(items: BudgetItem[], from: Date, to: Date): { income: number; expenses: number } {
  return items.reduce((totals, item) => {
    const amount = occurrenceDatesBetween(item, from, to).length * item.amount;
    if (item.kind === 'income') return { ...totals, income: totals.income + amount };
    return { ...totals, expenses: totals.expenses + amount };
  }, { income: 0, expenses: 0 });
}

export function buildProjectedCategorySummaryForRange(expenses: BudgetItem[], from: Date, to: Date): Array<{ category: string; yearly: number }> {
  const totals = new Map<string, number>();
  expenses.forEach((item) => {
    const projectedTotal = occurrenceDatesBetween(item, from, to).length * item.amount;
    if (!projectedTotal) return;
    const category = item.category || 'Uncategorised';
    totals.set(category, (totals.get(category) || 0) + projectedTotal);
  });
  return Array.from(totals, ([category, yearly]) => ({ category, yearly })).sort((a, b) => b.yearly - a.yearly);
}

export function buildActualComparisonData(items: BudgetItem[], actuals: ActualCostTransaction[], days: number): Array<{ category: string; projected: number; actual: number }> {
  const projected = new Map<string, number>();
  items.filter((i) => i.kind === 'expense').forEach((item) => {
    const category = item.category || 'Uncategorised';
    projected.set(category, (projected.get(category) || 0) + annualizedBudgetAmount(item) * (days / 365.25));
  });
  const actual = new Map<string, number>();
  actuals.forEach((item) => {
    const category = item.category || 'Uncategorised';
    actual.set(category, (actual.get(category) || 0) + Math.abs(item.amount));
  });
  return Array.from(new Set([...projected.keys(), ...actual.keys()])).map((category) => ({ category, projected: projected.get(category) || 0, actual: actual.get(category) || 0 })).sort((a, b) => (b.projected + b.actual) - (a.projected + a.actual));
}

export function compareActualCostTransactions(left: ActualCostTransaction, right: ActualCostTransaction, key: keyof ActualCostTransaction, direction: SortDirection): number {
  const multiplier = direction === 'asc' ? 1 : -1;
  if (key === 'date') {
    const lt = parseBudgetDate(left.date)?.getTime() || 0;
    const rt = parseBudgetDate(right.date)?.getTime() || 0;
    return (lt - rt) * multiplier;
  }
  if (key === 'amount') return ((left.amount || 0) - (right.amount || 0)) * multiplier;
  return String(left[key] || '').localeCompare(String(right[key] || '')) * multiplier;
}

export function compareBudgetItems(left: BudgetItem, right: BudgetItem, key: 'name' | 'supplier' | 'category' | 'amount' | 'schedule' | 'rule', direction: SortDirection): number {
  const multiplier = direction === 'asc' ? 1 : -1;
  if (key === 'amount') return ((left.amount || 0) - (right.amount || 0)) * multiplier;
  const lv = key === 'schedule' ? (left.schedule || left.cycle) : key === 'rule' ? budgetRuleLabel(left) : String(left[key] || '');
  const rv = key === 'schedule' ? (right.schedule || right.cycle) : key === 'rule' ? budgetRuleLabel(right) : String(right[key] || '');
  return String(lv || '').localeCompare(String(rv || '')) * multiplier;
}

export function findLastTuesdayIncomeDate(items: BudgetItem[], referenceDate: Date): Date {
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const start = addDays(end, -730);
  let latest: Date | null = null;
  items.filter((i) => i.kind === 'income').forEach((item) => {
    for (const date of occurrenceDatesBetween(item, start, end)) {
      if (date.getDay() === 2 && (!latest || date > latest)) latest = date;
    }
  });
  if (latest) return latest;
  return addDays(end, -((end.getDay() + 5) % 7));
}

export function formatWeekRange(start: Date, end: Date): string {
  return `${start.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}`;
}

export function formatProjectionRangeLabel(from: Date, to: Date): string {
  return `${from.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })} – ${to.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

export function buildProjectionDateRange(preset: ProjectionRangePreset, customFrom: string, customTo: string): { from: Date; to: Date } {
  const today = new Date();
  const year = today.getFullYear();
  const currentMonth = today.getMonth();
  let from = new Date(year, 0, 1);
  let to = new Date(year, 11, 31);
  if (preset === 'remaining-year') from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (preset === 'current-month') { from = new Date(year, currentMonth, 1); to = new Date(year, currentMonth + 1, 0); }
  if (preset === 'current-fortnight') {
    const fortnightStart = startOfBudgetWeek(today);
    from = today.getDay() === 2 ? addDays(fortnightStart, -7) : fortnightStart;
    to = addDays(from, 13);
  }
  if (preset === 'current-week') { from = startOfBudgetWeek(today); to = addDays(from, 6); }
  if (preset === 'custom') { from = parseBudgetDate(customFrom) || from; to = parseBudgetDate(customTo) || to; }
  if (to < from) return { from: to, to: from };
  return { from, to };
}

export function buildBudgetProjectionForRange(items: BudgetItem[], rangeStart: Date, rangeEnd: Date, startingBalance: number) {
  const firstWeekStart = startOfBudgetWeek(rangeStart);
  const safeRangeEnd = rangeEnd < rangeStart ? rangeStart : rangeEnd;
  const weekCount = Math.max(1, Math.ceil((safeRangeEnd.getTime() - firstWeekStart.getTime() + 1) / (7 * 86_400_000)));
  let balance = startingBalance;
  return Array.from({ length: weekCount }, (_, index) => {
    const calendarStart = addDays(firstWeekStart, index * 7);
    const calendarEnd = addDays(calendarStart, 6);
    const start = calendarStart < rangeStart ? rangeStart : calendarStart;
    const end = calendarEnd > safeRangeEnd ? safeRangeEnd : calendarEnd;
    const dueItems = items.filter((item) => occurrenceCountInWeek(item, start, end) > 0);
    const income = dueItems.filter((i) => i.kind === 'income').reduce((sum, item) => sum + item.amount * occurrenceCountInWeek(item, start, end), 0);
    const expenses = dueItems.filter((i) => i.kind === 'expense').reduce((sum, item) => sum + item.amount * occurrenceCountInWeek(item, start, end), 0);
    const net = income - expenses;
    balance += net;
    return { start, end, items: dueItems, income, expenses, net, balance };
  }).filter((week) => week.end >= rangeStart && week.start <= safeRangeEnd);
}


export function exportExpenseCsv(items: BudgetItem[]): void {
  const expenses = items.filter((i) => i.kind === 'expense');
  // 52 weeks of the current calendar year starting from Jan 1
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const weeks: Array<{ start: Date; end: Date; label: string }> = [];
  for (let w = 0; w < 52; w++) {
    const start = new Date(yearStart.getTime() + w * 7 * 86_400_000);
    const end = new Date(start.getTime() + 6 * 86_400_000);
    const label = `W${String(w + 1).padStart(2, '0')} ${start.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}`;
    weeks.push({ start, end, label });
  }
  const headers = ['Name', 'Category', 'Supplier', ...weeks.map((w) => w.label)];
  const rows = expenses.map((item) => {
    const weeklyCosts = weeks.map(({ start, end }) => {
      const count = occurrenceCountInWeek(item, start, end);
      return count > 0 ? (item.amount * count).toFixed(2) : '';
    });
    return [item.name, item.category || '', item.supplier || '', ...weeklyCosts];
  });
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `expense-schedule-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function budgetRuleLabel(item: BudgetItem): string {
  if (item.note) return item.note;
  const endLabel = item.endDate ? ` until ${formatBudgetDateText(item.endDate)}` : '';
  const schedule = normalizeBudgetSchedule(item.schedule, item.cycle);
  if (schedule === 'recurring') return `Every ${item.intervalCount || defaultIntervalFromCycle(item.cycle).count} ${pluralizeUnit(item.intervalUnit || defaultIntervalFromCycle(item.cycle).unit, item.intervalCount || defaultIntervalFromCycle(item.cycle).count)} from ${item.anchorDate ? formatBudgetDateText(item.anchorDate) : 'start date'}${endLabel}`;
  if (schedule === 'random') {
    const days = item.daysOfMonth?.length ? item.daysOfMonth : item.dayOfMonth ? [item.dayOfMonth] : [];
    return `Day ${days.join(', ') || '—'} in month${item.months?.length ? `s ${item.months.join(', ')}` : 's'}${item.anchorDate ? ` from ${formatBudgetDateText(item.anchorDate)}` : ''}${endLabel}`;
  }
  if (item.dueDates?.length) return `${item.dueDates.map(formatBudgetDateText).join(', ')}${endLabel}`;
  return item.endDate ? `As needed until ${formatBudgetDateText(item.endDate)}` : 'As needed';
}

function pluralizeUnit(unit: BudgetIntervalUnit, count: number): string {
  const label = unit === 'day' ? 'day' : unit === 'week' ? 'week' : unit === 'month' ? 'month' : 'year';
  return count === 1 ? label : `${label}s`;
}

export function parseMoney(value: string): number {
  const cleaned = String(value).replace(/[$,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function guessHeader(headers: string[], candidates: string[]): string {
  const lower = headers.map((h) => h.toLowerCase());
  const index = candidates.map((c) => lower.findIndex((h) => h.includes(c))).find((m) => m !== -1);
  return index == null || index === -1 ? '' : headers[index];
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { current += '"'; i += 1; }
    else if (char === '"') { quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(current.trim()); current = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; current = '';
    } else { current += char; }
  }
  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows[0] || [];
  return { headers, rows: rows.slice(1).map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] || '']))) };
}

function cycleFromSchedule(item: BudgetItem): BudgetCycle {
  if (item.schedule === 'once-off') return 'once-off';
  if (item.schedule === 'random') return 'random';
  const count = item.intervalCount || 1;
  const unit = item.intervalUnit || 'week';
  if (unit === 'week' && count === 1) return 'weekly';
  if (unit === 'week' && count === 2) return 'fortnightly';
  if (unit === 'month' && count === 1) return 'monthly';
  if (unit === 'month' && count === 3) return 'quarterly';
  if (unit === 'month' && count === 6) return 'bi-annually';
  if (unit === 'year' && count === 1) return 'annually';
  return 'weekly';
}

// ── default data ───────────────────────────────────────────────────────────

const familyBudgetItems: BudgetItem[] = [
  { id: 'james-income', kind: 'income', name: 'James Income', supplier: 'AGnVET', amount: 4130.15, cycle: 'fortnightly', anchorDate: '2026-05-21', note: 'Fortnight Thursday' },
  { id: 'meg-pay', kind: 'income', name: 'Meg Pay', amount: 2229.05, cycle: 'fortnightly', anchorDate: '2026-05-22' },
  { id: 'millie-board', kind: 'income', name: 'Millie Board', amount: 50, cycle: 'weekly', anchorDate: '2026-05-19' },
  { id: 'daily-expenses', kind: 'income', name: 'Daily expenses allowance', amount: 1724, cycle: 'monthly', dayOfMonth: 1 },
  { id: 'mux-finance', kind: 'expense', name: 'Car - MU-X Finance', supplier: 'Suncorp', amount: 479.76, cycle: 'fortnightly', anchorDate: '2026-05-22' },
  { id: 'mux-fuel', kind: 'expense', name: 'Car - MU-X Fuel', supplier: 'Various', amount: 120, cycle: 'fortnightly', anchorDate: '2026-05-22' },
  { id: 'mux-insurance', kind: 'expense', name: 'Car - MU-X Insurance', amount: 106.44, cycle: 'monthly', dayOfMonth: 25 },
  { id: 'aurion-insurance', kind: 'expense', name: 'Car - Aurion Insurance', amount: 94.81, cycle: 'monthly', dayOfMonth: 18 },
  { id: 'rent', kind: 'expense', name: 'Rent', supplier: 'Ray White', amount: 870, cycle: 'weekly', anchorDate: '2026-05-19' },
  { id: 'school-fees', kind: 'expense', name: 'School Fees', supplier: 'Genesis', amount: 775, cycle: 'weekly', anchorDate: '2026-05-19' },
  { id: 'groceries', kind: 'expense', name: 'Groceries, food, alcohol, cafe, etc', supplier: 'Various', amount: 450, cycle: 'weekly', anchorDate: '2026-05-19' },
  { id: 'takeaway', kind: 'expense', name: 'Takeaway', amount: 120, cycle: 'weekly', anchorDate: '2026-05-19' },
  { id: 'internet', kind: 'expense', name: 'Internet', supplier: 'Neptune', amount: 90, cycle: 'monthly', dayOfMonth: 13 },
  { id: 'meg-phone', kind: 'expense', name: "Meg's Phone", supplier: 'Optus', amount: 115, cycle: 'monthly', dayOfMonth: 29 },
  { id: 'health-insurance', kind: 'expense', name: 'Health Insurance', supplier: 'Bupa', amount: 47.93, cycle: 'monthly', dayOfMonth: 17 },
  { id: 'apple-one', kind: 'expense', name: 'Streaming - Apple One', supplier: 'Apple / Stan / Netflix / Amazon', amount: 35, cycle: 'monthly', dayOfMonth: 22 },
  { id: 'chatgpt', kind: 'expense', name: 'ChatGPT', amount: 36, cycle: 'monthly', dayOfMonth: 4 },
  { id: 'electricity', kind: 'expense', name: 'Electricity', supplier: 'Harcourts', amount: 300, cycle: 'quarterly', months: [2, 5, 8, 11], dayOfMonth: 15 },
  { id: 'water', kind: 'expense', name: 'Water', supplier: 'Harcourts', amount: 133, cycle: 'quarterly', months: [3, 6, 9, 12], dayOfMonth: 15 },
  { id: 'pool-guy', kind: 'expense', name: 'Pool Guy', amount: 40, cycle: 'monthly', dayOfMonth: 15 },
  { id: 'qtu', kind: 'expense', name: 'QLD Teachers Union', supplier: 'QTU', amount: 16.75, cycle: 'fortnightly', anchorDate: '2026-05-22' },
  { id: 'emb-insurance', kind: 'expense', name: 'Embers - Business Insurance', supplier: 'Elders Insurance', amount: 190, cycle: 'monthly', dayOfMonth: 17 },
  { id: 'emb-trailer', kind: 'expense', name: 'Embers - Trailer Repayment', amount: 700, cycle: 'monthly', dayOfMonth: 1 },
  { id: 'aurion-rego', kind: 'expense', name: 'Car - Aurion Rego', supplier: 'TMR', amount: 452.8, cycle: 'bi-annually', dueDates: ['2026-02-12', '2026-08-12'] },
  { id: 'aurion-racq', kind: 'expense', name: 'Car - Aurion RACQ', supplier: 'RACQ', amount: 193.15, cycle: 'annually', dueDates: ['2026-02-20'] },
  { id: 'mux-rego', kind: 'expense', name: 'Car - MUX Rego', supplier: 'TMR', amount: 368.65, cycle: 'bi-annually', dueDates: ['2026-07-28', '2027-01-28'] },
  { id: 'mothers-day', kind: 'expense', name: 'Mother’s Day', amount: 300, cycle: 'once-off', dueDates: ['2026-05-10'] },
  { id: 'meg-mum', kind: 'expense', name: "Meg's Mum", amount: 600, cycle: 'once-off', dueDates: ['2026-06-01'] }
];

// ── FamilyBudgetDashboard ──────────────────────────────────────────────────

export function FamilyBudgetDashboard() {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [actuals, setActuals] = useState<ActualCostTransaction[]>([]);
  const [fromDate, setFromDate] = useState(() => formatAuDate(addDays(new Date(), -30)));
  const [toDate, setToDate] = useState(() => formatAuDate(new Date()));
  const [status, setStatus] = useState('Loading family budget comparison…');
  const [selectedDashboardCategory, setSelectedDashboardCategory] = useState<string | null>(null);
  const defaultDashboardRangeSet = useRef(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [ir, ar] = await Promise.all([fetch('/api/family-budget/items'), fetch('/api/family-budget/actual-costs')]);
        if (!ir.ok || !ar.ok) throw new Error('Could not load family budget dashboard data.');
        const itemsResult = await ir.json();
        const actualsResult = await ar.json();
        setItems(Array.isArray(itemsResult.items) ? itemsResult.items.map(normalizeBudgetItem) : []);
        setActuals(Array.isArray(actualsResult.transactions) ? actualsResult.transactions : []);
        setStatus('Comparing projections against imported actual costs.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not load family budget dashboard data.');
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (defaultDashboardRangeSet.current || !items.length) return;
    const start = findLastTuesdayIncomeDate(items, new Date());
    setFromDate(formatAuDate(start));
    setToDate(formatAuDate(addDays(start, 13)));
    defaultDashboardRangeSet.current = true;
  }, [items]);

  const from = parseBudgetDate(fromDate);
  const to = parseBudgetDate(toDate);
  const days = from && to ? Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1) : 30;
  const projected = items.filter((i) => i.kind === 'expense').reduce((sum, item) => sum + annualizedBudgetAmount(item) * (days / 365.25), 0);
  const filteredActuals = actuals.filter((item) => {
    const date = parseBudgetDate(item.date);
    return date && from && to ? date >= from && date <= to : true;
  });
  const actualTotal = filteredActuals.reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const variance = actualTotal - projected;
  const comparisonData = buildActualComparisonData(items, filteredActuals, days);

  return (
    <section className="page-stack">
      <div className="content-grid compact">
        <MetricCard title="Projected costs" value={formatMoney(projected)} detail={`${days} day projection`} icon={<BarChart3 />} />
        <MetricCard title="Actual costs" value={formatMoney(actualTotal)} detail={`${filteredActuals.length} imported transactions`} icon={<ReceiptText />} />
        <MetricCard title="Variance" value={formatMoney(variance)} detail={variance > 0 ? 'Over projection' : 'Under projection'} icon={<WalletCards />} />
      </div>
      <div className="card hero-card budget-hero">
        <div>
          <p className="eyebrow">Family Budget Dashboard</p>
          <h2>Projection vs Actual Costs</h2>
          <p>Compare the projection schedule against imported bank transactions for a date range.</p>
          <p className="help-text">{status}</p>
        </div>
        <div className="budget-controls">
          <label>From<input type="date" value={toDateInputValue(fromDate)} onChange={(e) => setFromDate(formatBudgetDateText(e.target.value))} /></label>
          <label>To<input type="date" value={toDateInputValue(toDate)} onChange={(e) => setToDate(formatBudgetDateText(e.target.value))} /></label>
        </div>
      </div>
      <div className="card span-2 table-card">
        <div className="card-header"><div><p className="eyebrow">By category</p><h2>Projected vs actual</h2></div></div>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={comparisonData} onClick={(event: any) => { const category = event?.activeLabel || event?.activePayload?.[0]?.payload?.category; if (category) setSelectedDashboardCategory(category); }} style={{ cursor: 'pointer' }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" />
            <YAxis tickFormatter={(v) => formatMoney(Number(v))} />
            <Tooltip formatter={(v) => formatMoney(Number(v))} />
            <Bar dataKey="projected" fill="var(--accent)" name="Projected" cursor="pointer" />
            <Bar dataKey="actual" fill="#dc8a32" name="Actual" cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {selectedDashboardCategory && <DashboardCategoryModal category={selectedDashboardCategory} items={items} actuals={filteredActuals} days={days} onClose={() => setSelectedDashboardCategory(null)} />}
    </section>
  );
}

function DashboardCategoryModal({ category, items, actuals, days, onClose }: { category: string; items: BudgetItem[]; actuals: ActualCostTransaction[]; days: number; onClose: () => void }) {
  const projectedRows = items.filter((i) => i.kind === 'expense' && (i.category || 'Uncategorised') === category).map((item) => ({ item, projected: annualizedBudgetAmount(item) * (days / 365.25) })).sort((a, b) => b.projected - a.projected);
  const actualRows = actuals.filter((i) => (i.category || 'Uncategorised') === category).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const projectedTotal = projectedRows.reduce((sum, r) => sum + r.projected, 0);
  const actualTotal = actualRows.reduce((sum, r) => sum + Math.abs(r.amount), 0);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card budget-modal dashboard-category-modal">
        <div className="card-header"><div><p className="eyebrow">Category detail</p><h2>{category}</h2></div><button className="secondary-button" type="button" onClick={onClose}>Close</button></div>
        <div className="detail-summary-grid">
          <MetricCard title="Projected" value={formatMoney(projectedTotal)} detail={`${projectedRows.length} projection item${projectedRows.length === 1 ? '' : 's'}`} icon={<BarChart3 />} />
          <MetricCard title="Actual" value={formatMoney(actualTotal)} detail={`${actualRows.length} imported transaction${actualRows.length === 1 ? '' : 's'}`} icon={<ReceiptText />} />
          <MetricCard title="Variance" value={formatMoney(actualTotal - projectedTotal)} detail={actualTotal > projectedTotal ? 'Over projection' : 'Under projection'} icon={<WalletCards />} />
          <MetricCard title="Range" value={`${days} days`} detail="Selected dashboard range" icon={<WalletCards />} />
        </div>
        <div className="dashboard-category-detail-grid">
          <div className="card table-card"><div className="card-header"><div><p className="eyebrow">Projected</p><h2>Schedule items</h2></div></div><div className="table-wrap budget-table-wrap"><table><thead><tr><th>Item</th><th>Rule</th><th>Projected</th></tr></thead><tbody>{projectedRows.map(({ item, projected }) => <tr key={item.id}><td>{item.name}</td><td>{budgetRuleLabel(item)}</td><td>{formatMoney(projected)}</td></tr>)}{!projectedRows.length && <tr><td colSpan={3}>No projected items in this category.</td></tr>}</tbody></table></div></div>
          <div className="card table-card"><div className="card-header"><div><p className="eyebrow">Actual</p><h2>Imported transactions</h2></div></div><div className="table-wrap budget-table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Amount</th></tr></thead><tbody>{actualRows.map((item) => <tr key={item.id}><td>{item.date}</td><td>{item.description}</td><td>{item.account || '—'}</td><td>{formatMoney(Math.abs(item.amount))}</td></tr>)}{!actualRows.length && <tr><td colSpan={4}>No actual transactions in this category.</td></tr>}</tbody></table></div></div>
        </div>
      </div>
    </div>
  );
}

// ── ActualCostsPage ────────────────────────────────────────────────────────

export function ActualCostsPage() {
  const [transactions, setTransactions] = useState<ActualCostTransaction[]>([]);
  const [categories, setCategories] = useState<string[]>(() => loadExpenseCategories());
  const [status, setStatus] = useState('Loading actual costs…');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<CsvMapping>({ date: '', description: '', amount: '', account: '' });
  const [sortKey, setSortKey] = useState<keyof ActualCostTransaction>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    const load = async () => {
      try {
        const [tr, cr] = await Promise.all([fetch('/api/family-budget/actual-costs'), fetch('/api/family-budget/categories')]);
        if (!tr.ok) throw new Error('Could not load actual costs.');
        const transactionResult = await tr.json();
        const categoryResult = cr.ok ? await cr.json() : { categories: [] };
        setTransactions(Array.isArray(transactionResult.transactions) ? transactionResult.transactions : []);
        if (Array.isArray(categoryResult.categories) && categoryResult.categories.length) setCategories(categoryResult.categories);
        setStatus(transactionResult.message || 'Actual costs loaded.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not load actual costs.');
      }
    };
    void load();
  }, []);

  const saveTransactions = async (nextTransactions: ActualCostTransaction[]) => {
    setTransactions(nextTransactions);
    setStatus('Saving actual costs…');
    try {
      const response = await fetch('/api/family-budget/actual-costs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions: nextTransactions }) });
      if (!response.ok) throw new Error(`Save failed with HTTP ${response.status}`);
      const result = await response.json();
      setStatus(result.message || 'Actual costs saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save actual costs.');
    }
  };

  const loadCsvFile = async (file: File) => {
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    setCsvHeaders(headers);
    setCsvRows(rows);
    setMapping({ date: guessHeader(headers, ['date', 'transaction date', 'posted date']), description: guessHeader(headers, ['description', 'details', 'memo', 'transaction']), amount: guessHeader(headers, ['amount', 'debit', 'value']), account: guessHeader(headers, ['account', 'account name']) });
    setStatus(`Loaded ${rows.length} CSV rows. Map the fields, then import.`);
  };

  const importMappedRows = () => {
    if (!mapping.date || !mapping.description || !mapping.amount) { setStatus('Please map at least Date, Description, and Amount.'); return; }
    const imported = csvRows.map((row, index) => ({ id: `actual-${Date.now()}-${index}`, date: formatBudgetDateText(row[mapping.date] || ''), description: row[mapping.description] || '', amount: parseMoney(row[mapping.amount] || '0'), account: mapping.account ? row[mapping.account] || '' : '', category: '', notes: '' })).filter((item) => item.date && item.description);
    void saveTransactions([...transactions, ...imported]);
    setCsvRows([]); setCsvHeaders([]);
  };

  const updateTransaction = (id: string, patch: Partial<ActualCostTransaction>) => {
    void saveTransactions(transactions.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const addManualTransaction = () => {
    const transaction: ActualCostTransaction = { id: `manual-${Date.now()}`, date: formatAuDate(new Date()), description: 'Cash transaction', amount: 0, account: 'Cash', category: '', notes: 'Added manually' };
    void saveTransactions([transaction, ...transactions]);
    setSortKey('date'); setSortDirection('desc');
  };

  const changeSort = (key: keyof ActualCostTransaction) => {
    if (sortKey === key) setSortDirection((c) => c === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDirection(key === 'date' || key === 'amount' ? 'desc' : 'asc'); }
  };

  const sortedTransactions = useMemo(() => [...transactions].sort((l, r) => compareActualCostTransactions(l, r, sortKey, sortDirection)), [transactions, sortDirection, sortKey]);

  return (
    <section className="page-stack">
      <div className="card hero-card budget-hero">
        <div><p className="eyebrow">Actual Costs</p><h2>Import and categorise transactions.</h2><p>Upload bank CSV exports or add cash transactions manually, then categorise them for dashboard comparison.</p><p className="help-text">{status}</p></div>
        <div className="budget-controls"><label>Upload CSV<input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && void loadCsvFile(e.target.files[0])} /></label><button className="primary-button" type="button" onClick={addManualTransaction}>Add transaction</button></div>
      </div>
      {csvHeaders.length > 0 && <div className="card table-card"><div className="card-header"><div><p className="eyebrow">CSV import</p><h2>Map fields</h2></div><button className="primary-button" type="button" onClick={importMappedRows}>Import rows</button></div><div className="form-grid"><CsvMapSelect label="Date" headers={csvHeaders} value={mapping.date} onChange={(date) => setMapping((c) => ({ ...c, date }))} /><CsvMapSelect label="Description" headers={csvHeaders} value={mapping.description} onChange={(description) => setMapping((c) => ({ ...c, description }))} /><CsvMapSelect label="Amount" headers={csvHeaders} value={mapping.amount} onChange={(amount) => setMapping((c) => ({ ...c, amount }))} /><CsvMapSelect label="Account" headers={csvHeaders} value={mapping.account} onChange={(account) => setMapping((c) => ({ ...c, account }))} /></div><p className="help-text">Preview: {csvRows.slice(0, 3).map((row) => row[mapping.description] || Object.values(row)[0]).join(' · ')}</p></div>}
      <div className="card table-card">
        <div className="card-header"><div><p className="eyebrow">Actual costs</p><h2>Transactions</h2></div><button className="primary-button" type="button" onClick={addManualTransaction}>Add transaction</button></div>
        <div className="table-wrap budget-table-wrap actual-costs-table">
          <table>
            <thead><tr><ActualCostSortableTh label="Date" column="date" sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /><ActualCostSortableTh label="Description" column="description" sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /><ActualCostSortableTh label="Amount" column="amount" sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /><ActualCostSortableTh label="Account" column="account" sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /><ActualCostSortableTh label="Category" column="category" sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /><ActualCostSortableTh label="Notes" column="notes" sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} /><th>Actions</th></tr></thead>
            <tbody>{sortedTransactions.map((item) => <tr key={item.id}><td><input value={item.date} onChange={(e) => updateTransaction(item.id, { date: e.target.value })} /></td><td><input value={item.description} onChange={(e) => updateTransaction(item.id, { description: e.target.value })} /></td><td><input type="number" value={item.amount} onChange={(e) => updateTransaction(item.id, { amount: Number(e.target.value || 0) })} /></td><td><input value={item.account || ''} onChange={(e) => updateTransaction(item.id, { account: e.target.value })} /></td><td><select value={item.category || ''} onChange={(e) => updateTransaction(item.id, { category: e.target.value })}><option value="">Select…</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></td><td><input value={item.notes || ''} onChange={(e) => updateTransaction(item.id, { notes: e.target.value })} /></td><td><button className="secondary-button danger-button" type="button" onClick={() => void saveTransactions(transactions.filter((r) => r.id !== item.id))}>Delete</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function CsvMapSelect({ label, headers, value, onChange }: { label: string; headers: string[]; value: string; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(e) => onChange(e.target.value)}><option value="">Do not import</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>;
}

function ActualCostSortableTh({ label, column, sortKey, sortDirection, onSort }: { label: string; column: keyof ActualCostTransaction; sortKey: keyof ActualCostTransaction; sortDirection: SortDirection; onSort: (column: keyof ActualCostTransaction) => void }) {
  const active = sortKey === column;
  return <th><button className="sort-header-button" type="button" onClick={() => onSort(column)}>{label}{active ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>;
}

// ── FamilyBudget (Projections) ─────────────────────────────────────────────

export function FamilyBudget() {
  const [projectionRangePreset, setProjectionRangePreset] = useState<ProjectionRangePreset>('remaining-year');
  const [customRangeFrom, setCustomRangeFrom] = useState(() => formatAuDate(new Date()));
  const [customRangeTo, setCustomRangeTo] = useState(() => formatAuDate(new Date(new Date().getFullYear(), 11, 31)));
  const [items, setItems] = useState<BudgetItem[]>(() => loadFamilyBudgetItems());
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>(() => loadSavingsAccounts());
  const [savingsLoaded, setSavingsLoaded] = useState(false);
  const [budgetSaveStatus, setBudgetSaveStatus] = useState('Loading budget database…');
  const [savingsSaveStatus, setSavingsSaveStatus] = useState('Loading savings accounts…');
  const [expenseCategories, setExpenseCategories] = useState<string[]>(() => loadExpenseCategories());
  const [editingBudgetItem, setEditingBudgetItem] = useState<BudgetItem | null>(null);
  const [modalKind, setModalKind] = useState<BudgetKind | null>(null);
  const [selectedBudgetItem, setSelectedBudgetItem] = useState<BudgetItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProjectionWeek, setSelectedProjectionWeek] = useState<ReturnType<typeof buildBudgetProjectionForRange>[number] | null>(null);
  const [editingSavingsAccount, setEditingSavingsAccount] = useState<SavingsAccount | null>(null);
  const budgetLeftColumnRef = useRef<HTMLDivElement>(null);
  const [budgetLeftColumnHeight, setBudgetLeftColumnHeight] = useState<number | null>(null);
  const currentAccountBalance = savingsAccounts.reduce((sum, a) => sum + a.balance, 0);
  const projectionRange = useMemo(() => buildProjectionDateRange(projectionRangePreset, customRangeFrom, customRangeTo), [projectionRangePreset, customRangeFrom, customRangeTo]);
  const projectionRangeLabel = formatProjectionRangeLabel(projectionRange.from, projectionRange.to);
  const weeks = useMemo(() => buildBudgetProjectionForRange(items, projectionRange.from, projectionRange.to, currentAccountBalance), [items, projectionRange.from, projectionRange.to, currentAccountBalance]);
  const visibleItems = useMemo(() => items.filter((item) => occurrenceDatesBetween(item, projectionRange.from, projectionRange.to).length > 0), [items, projectionRange.from, projectionRange.to]);
  const expenses = visibleItems.filter((i) => i.kind === 'expense');
  const totalAnnualExpense = items.filter((i) => i.kind === 'expense').reduce((sum, item) => sum + annualizedBudgetAmount(item), 0);
  const scheduledTotals = useMemo(() => buildScheduleTotalsForRange(items, projectionRange.from, projectionRange.to), [items, projectionRange.from, projectionRange.to]);
  const carefulWeeks = weeks.filter((w) => w.net < 0 || w.balance < 0).slice(0, 8);
  const worstWeek = [...weeks].sort((a, b) => a.net - b.net)[0];
  const categorySummary = useMemo(() => buildProjectedCategorySummaryForRange(items.filter((i) => i.kind === 'expense'), projectionRange.from, projectionRange.to), [items, projectionRange.from, projectionRange.to]);
  const categoryPieSummary = useMemo(() => {
    const unallocated = Math.max(0, scheduledTotals.income - scheduledTotals.expenses);
    return unallocated > 0 ? [...categorySummary, { category: 'Unallocated', yearly: unallocated }] : categorySummary;
  }, [categorySummary, scheduledTotals.expenses, scheduledTotals.income]);

  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      try {
        const response = await fetch('/api/family-budget/categories');
        if (!response.ok) throw new Error('');
        const result = await response.json();
        if (cancelled) return;
        const cats = Array.isArray(result.categories) && result.categories.length ? result.categories : loadExpenseCategories();
        setExpenseCategories(cats);
        localStorage.setItem(FAMILY_BUDGET_CATEGORIES_STORAGE_KEY, JSON.stringify(cats));
      } catch { if (!cancelled) setExpenseCategories(loadExpenseCategories()); }
    };
    void loadCategories();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadItems = async () => {
      try {
        const response = await fetch('/api/family-budget/items');
        if (!response.ok) throw new Error(`Budget database load failed with HTTP ${response.status}`);
        const result = await response.json();
        if (cancelled) return;
        const dbItems = Array.isArray(result.items) ? result.items.map(normalizeBudgetItem) : [];
        const nextItems = dbItems.length ? dbItems : loadFamilyBudgetItems();
        setItems(nextItems);
        setBudgetSaveStatus(dbItems.length ? 'Budget items loaded from database.' : 'Budget database started with the current starter list.');
        setItemsLoaded(true);
        if (!dbItems.length) void saveFamilyBudgetItems(nextItems, false);
      } catch (error) {
        if (cancelled) return;
        setBudgetSaveStatus(error instanceof Error ? `${error.message}; using browser backup for now.` : 'Budget database unavailable; using browser backup for now.');
        setItems(loadFamilyBudgetItems());
        setItemsLoaded(true);
      }
    };
    void loadItems();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAccounts = async () => {
      try {
        const response = await fetch('/api/family-budget/savings-accounts');
        if (!response.ok) throw new Error(`Savings database load failed with HTTP ${response.status}`);
        const result = await response.json();
        if (cancelled) return;
        const dbAccounts = Array.isArray(result.accounts) ? result.accounts : [];
        const nextAccounts = dbAccounts.length ? dbAccounts : loadSavingsAccounts();
        setSavingsAccounts(nextAccounts);
        setSavingsSaveStatus(dbAccounts.length ? 'Savings accounts loaded from database.' : 'No savings accounts added yet.');
        setSavingsLoaded(true);
        if (!dbAccounts.length && nextAccounts.length) void saveSavingsAccounts(nextAccounts, false);
      } catch (error) {
        if (cancelled) return;
        setSavingsSaveStatus(error instanceof Error ? `${error.message}; using browser backup for now.` : 'Savings database unavailable; using browser backup for now.');
        setSavingsAccounts(loadSavingsAccounts());
        setSavingsLoaded(true);
      }
    };
    void loadAccounts();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { localStorage.setItem(FAMILY_BUDGET_STORAGE_KEY, JSON.stringify(items)); if (itemsLoaded) void saveFamilyBudgetItems(items, true); }, [items, itemsLoaded]);
  useEffect(() => { localStorage.setItem(SAVINGS_ACCOUNTS_STORAGE_KEY, JSON.stringify(savingsAccounts)); if (savingsLoaded) void saveSavingsAccounts(savingsAccounts, true); }, [savingsAccounts, savingsLoaded]);

  useEffect(() => {
    const element = budgetLeftColumnRef.current;
    if (!element) return;
    const updateHeight = () => setBudgetLeftColumnHeight(Math.ceil(element.getBoundingClientRect().height));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    window.addEventListener('resize', updateHeight);
    return () => { observer.disconnect(); window.removeEventListener('resize', updateHeight); };
  }, [items, savingsAccounts]);

  const saveFamilyBudgetItems = async (nextItems: BudgetItem[], announce: boolean) => {
    if (announce) setBudgetSaveStatus('Saving budget items to database…');
    try {
      const response = await fetch('/api/family-budget/items', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: nextItems }) });
      if (!response.ok) throw new Error(`Budget database save failed with HTTP ${response.status}`);
      const result = await response.json();
      setBudgetSaveStatus(result.message || 'Budget items saved to database.');
    } catch (error) {
      setBudgetSaveStatus(error instanceof Error ? `${error.message}; browser backup saved.` : 'Budget database save failed; browser backup saved.');
    }
  };

  const saveSavingsAccounts = async (nextAccounts: SavingsAccount[], announce: boolean) => {
    if (announce) setSavingsSaveStatus('Saving savings accounts to database…');
    try {
      const response = await fetch('/api/family-budget/savings-accounts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accounts: nextAccounts }) });
      if (!response.ok) throw new Error(`Savings database save failed with HTTP ${response.status}`);
      const result = await response.json();
      setSavingsSaveStatus(result.message || 'Savings accounts saved to database.');
    } catch (error) {
      setSavingsSaveStatus(error instanceof Error ? `${error.message}; browser backup saved.` : 'Savings database save failed; browser backup saved.');
    }
  };

  const openAddBudgetItem = (kind: BudgetKind) => {
    setModalKind(kind);
    setEditingBudgetItem({ id: `budget-${Date.now()}`, kind, name: '', supplier: '', amount: 0, cycle: 'weekly', schedule: 'recurring', intervalCount: 1, intervalUnit: 'week', anchorDate: formatAuDate(new Date()) });
  };

  const openEditBudgetItem = (item: BudgetItem) => {
    setModalKind(item.kind);
    setEditingBudgetItem({ ...item, months: item.months ? [...item.months] : undefined, dueDates: item.dueDates ? [...item.dueDates] : undefined });
  };

  const saveBudgetItem = (item: BudgetItem) => {
    setItems((c) => c.some((e) => e.id === item.id) ? c.map((e) => e.id === item.id ? item : e) : [...c, item]);
    setEditingBudgetItem(null); setModalKind(null);
  };

  const deleteBudgetItem = (id: string) => setItems((c) => c.filter((i) => i.id !== id));

  const saveSavingsAccount = (account: SavingsAccount) => {
    setSavingsAccounts((c) => c.some((e) => e.id === account.id) ? c.map((e) => e.id === account.id ? account : e) : [...c, account]);
    setEditingSavingsAccount(null);
  };

  const deleteSavingsAccount = (id: string) => setSavingsAccounts((c) => c.filter((a) => a.id !== id));

  return (
    <section className="page-stack">
      <div className="card hero-card budget-hero projection-range-hero">
        <div><p className="eyebrow">Projection range</p><h2>{projectionRangeLabel}</h2><p>Switch the projection, schedule lists, totals, and category graph to a specific date range.</p></div>
        <div className="projection-range-controls">
          <div className="button-row">
            {(['entire-year', 'remaining-year', 'current-month', 'current-fortnight', 'current-week', 'custom'] as ProjectionRangePreset[]).map((preset) => (
              <button key={preset} className={projectionRangePreset === preset ? 'primary-button' : 'secondary-button'} type="button" onClick={() => setProjectionRangePreset(preset)}>
                {preset === 'entire-year' ? 'Entire Year' : preset === 'remaining-year' ? 'Remaining Year' : preset === 'current-month' ? 'Current Month' : preset === 'current-fortnight' ? 'Current Fortnight' : preset === 'current-week' ? 'Current Week' : 'Custom Date Range'}
              </button>
            ))}
          </div>
          {projectionRangePreset === 'custom' && <div className="budget-controls compact-date-controls"><label>From<input type="date" value={toDateInputValue(customRangeFrom)} onChange={(e) => setCustomRangeFrom(formatBudgetDateText(e.target.value))} /></label><label>To<input type="date" value={toDateInputValue(customRangeTo)} onChange={(e) => setCustomRangeTo(formatBudgetDateText(e.target.value))} /></label></div>}
        </div>
      </div>

      <div className="content-grid compact">
        <MetricCard title="Budget week" value="Tue–Mon" detail={`Starting balance ${formatMoney(currentAccountBalance)} from account balances`} icon={<WalletCards />} />
        <MetricCard title="Range income" value={formatMoney(scheduledTotals.income)} detail={`Calculated for ${projectionRangeLabel}`} icon={<Landmark />} />
        <MetricCard title="Range expenses" value={formatMoney(scheduledTotals.expenses)} detail={`Calculated for ${projectionRangeLabel}`} icon={<ReceiptText />} />
      </div>

      <div className="card hero-card budget-hero budget-insights-hero projections-insights-only">
        <div className="category-insights-panel">
          <div className="card-header compact-header"><div><p className="eyebrow">Expense mix</p><h2>Top categories + Other</h2></div><strong>{formatMoney(scheduledTotals.expenses)} / range</strong></div>
          <div className="category-charts-grid">
            <div className="category-chart-container"><p className="eyebrow">Spend by category</p><div className="category-chart-wrap"><ResponsiveContainer width="100%" height={230}><BarChart data={categorySummary} layout="vertical" margin={{ left: 8, right: 18, top: 8, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(v) => formatMoney(Number(v))} /><YAxis type="category" dataKey="category" width={94} /><Tooltip formatter={(v) => formatMoney(Number(v))} /><Bar dataKey="yearly" fill="var(--accent)" radius={[0, 8, 8, 0]} /></BarChart></ResponsiveContainer></div></div>
            <div className="category-chart-container"><p className="eyebrow">Category share</p><div className="category-chart-wrap"><ResponsiveContainer width="100%" height={230}><PieChart><Tooltip formatter={(v) => formatMoney(Number(v))} /><Pie data={categoryPieSummary} dataKey="yearly" nameKey="category" cx="50%" cy="50%" innerRadius={46} outerRadius={82} label={(e) => `${e.category} ${((e.percent || 0) * 100).toFixed(0)}%`}>{categoryPieSummary.map((item, index) => <Cell key={item.category} fill={item.category === 'Unallocated' ? '#94a3b8' : categoryChartColors[index % categoryChartColors.length]} />)}</Pie></PieChart></ResponsiveContainer></div></div>
            <div className="category-chart-container category-list-panel">
              <p className="eyebrow">Categories</p>
              <ul className="category-scroll-list">
                {categorySummary.map((item, index) => (
                  <li key={item.category} className="clickable-row" onClick={() => setSelectedCategory(item.category)}>
                    <span className="category-list-swatch" style={{ background: categoryChartColors[index % categoryChartColors.length] }} />
                    <span className="category-list-name">{item.category}</span>
                    <span className="category-list-amount">{formatMoney(item.yearly)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="budget-schedules-grid">
        <div className="budget-left-column" ref={budgetLeftColumnRef}>
          <BudgetScheduleCard title="Income schedule" items={visibleItems.filter((i) => i.kind === 'income')} categories={expenseCategories} onAdd={() => openAddBudgetItem('income')} onEdit={openEditBudgetItem} onDelete={deleteBudgetItem} onView={setSelectedBudgetItem} />
          <SavingsAccountsCard accounts={savingsAccounts} status={savingsSaveStatus} onAdd={() => setEditingSavingsAccount({ id: `savings-${Date.now()}`, name: '', balance: 0, note: '' })} onEdit={(a) => setEditingSavingsAccount({ ...a })} onDelete={deleteSavingsAccount} />
        </div>
        <BudgetScheduleCard title="Expense schedule" items={visibleItems.filter((i) => i.kind === 'expense')} categories={expenseCategories} onAdd={() => openAddBudgetItem('expense')} onExport={() => exportExpenseCsv(items)} onEdit={openEditBudgetItem} onDelete={deleteBudgetItem} onView={setSelectedBudgetItem} matchedHeight={budgetLeftColumnHeight} wide />
      </div>

      <div className="content-grid">
        <div className="card span-2 table-card">
          <div className="card-header"><div><p className="eyebrow">Projection</p><h2>Tuesday–Monday budget weeks</h2></div></div>
          <div className="table-wrap budget-table-wrap">
            <table>
              <thead><tr><th>Week</th><th>Income</th><th>Expenses</th><th>Net</th><th>Projected balance</th><th>Watch items</th></tr></thead>
              <tbody>{weeks.map((week) => <tr key={week.start.toISOString()} className={`${week.net < 0 || week.balance < 0 ? 'risk-row' : ''} clickable-row`} onClick={() => setSelectedProjectionWeek(week)}><td>{formatWeekRange(week.start, week.end)}</td><td>{formatMoney(week.income)}</td><td>{formatMoney(week.expenses)}</td><td>{formatMoney(week.net)}</td><td>{formatMoney(week.balance)}</td><td>{week.items.slice(0, 3).map((i) => i.name).join(', ') || '—'}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="help-text">Showing weeks inside {projectionRangeLabel}; the metrics, risk detection, schedule lists, and graph use the same range.</p>
        </div>
        <div className="card">
          <div className="card-header"><div><p className="eyebrow">Careful weeks</p><h2>Risk flags</h2></div></div>
          <div className="risk-list">
            {carefulWeeks.map((week) => <div className="risk-card" key={week.start.toISOString()}><strong>{formatWeekRange(week.start, week.end)}</strong><span>Net {formatMoney(week.net)} · Balance {formatMoney(week.balance)}</span></div>)}
            {!carefulWeeks.length && <p className="help-text">No negative weeks in the selected projection.</p>}
          </div>
          {worstWeek && <p className="help-text">Worst projected week: {formatWeekRange(worstWeek.start, worstWeek.end)} at {formatMoney(worstWeek.net)} net.</p>}
        </div>
      </div>

      {selectedProjectionWeek && <ProjectionWeekModal week={selectedProjectionWeek} onClose={() => setSelectedProjectionWeek(null)} />}
      {selectedBudgetItem && <BudgetItemDetailModal item={selectedBudgetItem} totalAnnualExpense={totalAnnualExpense} onClose={() => setSelectedBudgetItem(null)} />}
      {selectedCategory && (
        <CategoryDetailModal
          category={selectedCategory}
          items={items.filter((i) => i.kind === 'expense' && (i.category || 'Uncategorised') === selectedCategory)}
          projectionFrom={projectionRange.from}
          projectionTo={projectionRange.to}
          totalCategorySpend={categorySummary.find((c) => c.category === selectedCategory)?.yearly ?? 0}
          totalExpenses={scheduledTotals.expenses}
          onClose={() => setSelectedCategory(null)}
        />
      )}
      {editingBudgetItem && modalKind && <BudgetItemModal kind={modalKind} item={editingBudgetItem} categories={expenseCategories} onSave={saveBudgetItem} onClose={() => { setEditingBudgetItem(null); setModalKind(null); }} />}
      {editingSavingsAccount && <SavingsAccountModal account={editingSavingsAccount} onSave={saveSavingsAccount} onClose={() => setEditingSavingsAccount(null)} />}
    </section>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function BudgetScheduleCard({ title, items, wide, categories, onAdd, onExport, onEdit, onDelete, onView, matchedHeight }: { title: string; items: BudgetItem[]; wide?: boolean; categories: string[]; onAdd: () => void; onExport?: () => void; onEdit: (item: BudgetItem) => void; onDelete: (id: string) => void; onView: (item: BudgetItem) => void; matchedHeight?: number | null }) {
  const isIncome = !wide;
  const [expenseColumnWidths, setExpenseColumnWidths] = useState([220, 130, 120, 95, 105, 220, 145]);
  const [expenseSortKey, setExpenseSortKey] = useState<'name' | 'supplier' | 'category' | 'amount' | 'schedule' | 'rule'>('name');
  const [expenseSortDirection, setExpenseSortDirection] = useState<SortDirection>('asc');
  const startColumnResize = (e: React.PointerEvent<HTMLSpanElement>, index: number) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startWidth = expenseColumnWidths[index];
    const onPointerMove = (me: PointerEvent) => { const next = Math.max(70, startWidth + me.clientX - startX); setExpenseColumnWidths((c) => c.map((w, wi) => wi === index ? next : w)); };
    const onPointerUp = () => { window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); };
    window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', onPointerUp);
  };
  const expenseHeadings: Array<{ label: string; key: 'name' | 'supplier' | 'category' | 'amount' | 'schedule' | 'rule' | 'actions' }> = [{ label: 'Name', key: 'name' }, { label: 'Supplier', key: 'supplier' }, { label: 'Category', key: 'category' }, { label: 'Amount', key: 'amount' }, { label: 'Schedule', key: 'schedule' }, { label: 'Rule', key: 'rule' }, { label: 'Actions', key: 'actions' }];
  const changeExpenseSort = (key: 'name' | 'supplier' | 'category' | 'amount' | 'schedule' | 'rule') => {
    if (expenseSortKey === key) setExpenseSortDirection((c) => c === 'asc' ? 'desc' : 'asc');
    else { setExpenseSortKey(key); setExpenseSortDirection(key === 'amount' ? 'desc' : 'asc'); }
  };
  const sortedExpenseItems = useMemo(() => isIncome ? items : [...items].sort((l, r) => compareBudgetItems(l, r, expenseSortKey, expenseSortDirection)), [expenseSortDirection, expenseSortKey, isIncome, items]);
  return (
    <div className={wide ? 'card table-card expense-schedule-card' : 'card table-card'} style={wide && matchedHeight ? { height: matchedHeight } : undefined}>
      <div className="card-header"><div><p className="eyebrow">Known items</p><h2>{title}</h2></div><div className="card-header-actions">{onExport && <button className="secondary-button" type="button" onClick={onExport}>Export CSV</button>}<button className="primary-button" type="button" onClick={onAdd}>Add item</button></div></div>
      {isIncome ? (
        <div className="budget-card-list income-card-list">
          {items.map((item) => (
            <div className="budget-item-card clickable-row" key={item.id} onClick={() => onView(item)}>
              <div className="budget-item-line primary-line"><strong>{item.name}</strong><span>{item.supplier || 'No source set'}</span></div>
              <div className="budget-item-line"><span>{formatMoney(item.amount)}</span><span>{item.schedule || item.cycle}</span></div>
              <div className="budget-item-line"><span>{budgetRuleLabel(item)}</span><div className="table-actions"><button className="secondary-button" type="button" onClick={(e) => { e.stopPropagation(); onEdit(item); }}>Edit</button><button className="secondary-button danger-button" type="button" onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}>Delete</button></div></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrap budget-table-wrap expense-table-wrap">
          <table className="expense-table">
            <colgroup>{expenseColumnWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead><tr>{expenseHeadings.map((h, index) => <th key={h.key}>{h.key === 'actions' ? h.label : <button className="sort-header-button" type="button" onClick={() => changeExpenseSort(h.key as any)}>{h.label}{expenseSortKey === h.key ? (expenseSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</button>}<span className="column-resize-handle" onPointerDown={(e) => startColumnResize(e, index)} /></th>)}</tr></thead>
            <tbody>{sortedExpenseItems.map((item) => <tr key={item.id} className="clickable-row" onClick={() => onView(item)}><td title={item.name}>{item.name}</td><td title={item.supplier || ''}>{item.supplier || '—'}</td><td title={item.category || ''}>{item.category || '—'}</td><td>{formatMoney(item.amount)}</td><td>{item.schedule || item.cycle}</td><td title={budgetRuleLabel(item)}>{budgetRuleLabel(item)}</td><td><div className="table-actions"><button className="secondary-button" type="button" onClick={(e) => { e.stopPropagation(); onEdit(item); }}>Edit</button><button className="secondary-button danger-button" type="button" onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}>Delete</button></div></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SavingsAccountsCard({ accounts, status, onAdd, onEdit, onDelete }: { accounts: SavingsAccount[]; status: string; onAdd: () => void; onEdit: (account: SavingsAccount) => void; onDelete: (id: string) => void }) {
  const total = accounts.reduce((sum, a) => sum + a.balance, 0);
  return (
    <div className="card table-card savings-card">
      <div className="card-header"><div><p className="eyebrow">Savings</p><h2>Account balances</h2></div><button className="primary-button" type="button" onClick={onAdd}>Add account</button></div>
      <p className="help-text">{status}</p>
      <div className="savings-total"><span>Total savings</span><strong>{formatMoney(total)}</strong></div>
      <div className="budget-card-list savings-account-list">
        {accounts.map((account) => (
          <div className="savings-account-card" key={account.id}>
            <div><strong>{account.name}</strong>{account.note && <span>{account.note}</span>}</div>
            <strong>{formatMoney(account.balance)}</strong>
            <div className="table-actions"><button className="secondary-button" type="button" onClick={() => onEdit(account)}>Edit</button><button className="secondary-button danger-button" type="button" onClick={() => onDelete(account.id)}>Delete</button></div>
          </div>
        ))}
        {!accounts.length && <p className="help-text">Add each savings account here so balances are tracked separately.</p>}
      </div>
    </div>
  );
}


function CategoryDetailModal({ category, items, projectionFrom, projectionTo, totalCategorySpend, totalExpenses, onClose }: {
  category: string;
  items: BudgetItem[];
  projectionFrom: Date;
  projectionTo: Date;
  totalCategorySpend: number;
  totalExpenses: number;
  onClose: () => void;
}) {
  const rows = items.map((item) => {
    const occ = occurrenceDatesBetween(item, projectionFrom, projectionTo).length;
    const total = occ * item.amount;
    return { item, occ, total };
  }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);

  const yearly = rows.reduce((sum, r) => sum + annualizedBudgetAmount(r.item), 0);
  const monthly = yearly / 12;
  const pctOfAll = totalExpenses > 0 ? (totalCategorySpend / totalExpenses) * 100 : 0;

  const pieData = rows.map((r) => ({ name: r.item.name, value: r.total }));

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card budget-modal category-detail-modal">
        <div className="card-header">
          <div><p className="eyebrow">Category</p><h2>{category}</h2></div>
          <button className="secondary-button" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="detail-summary-grid">
          <MetricCard title="Range total" value={formatMoney(totalCategorySpend)} detail="Projected for this range" icon={<WalletCards />} />
          <MetricCard title="Monthly avg" value={formatMoney(monthly)} detail="Annualised" icon={<WalletCards />} />
          <MetricCard title="% of expenses" value={`${pctOfAll.toFixed(1)}%`} detail="Share of all projected expenses" icon={<BarChart3 />} />
          <MetricCard title="Items" value={String(rows.length)} detail={`expense item${rows.length === 1 ? '' : 's'} in category`} icon={<ReceiptText />} />
        </div>
        <div className="category-detail-body">
          <div className="table-wrap budget-table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Supplier</th><th>Rule</th><th>Occurrences</th><th>Per occurrence</th><th>Range total</th></tr></thead>
              <tbody>
                {rows.map(({ item, occ, total }) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.supplier || '—'}</td>
                    <td>{budgetRuleLabel(item)}</td>
                    <td>{formatNumber(occ)}</td>
                    <td>{formatMoney(item.amount)}</td>
                    <td>{formatMoney(total)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={6}>No items are scheduled in this range for this category.</td></tr>}
              </tbody>
              {rows.length > 1 && (
                <tfoot><tr><td colSpan={5}>Category total</td><td>{formatMoney(totalCategorySpend)}</td></tr></tfoot>
              )}
            </table>
          </div>
          {pieData.length > 0 && (
            <div className="category-detail-pie">
              <p className="eyebrow">Item share of category</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={80}
                    label={(e) => `${e.name} ${((e.percent || 0) * 100).toFixed(0)}%`}>
                    {pieData.map((entry, index) => (
                      <Cell key={entry.name} fill={categoryChartColors[index % categoryChartColors.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BudgetItemDetailModal({ item, totalAnnualExpense, onClose }: { item: BudgetItem; totalAnnualExpense: number; onClose: () => void }) {
  const yearly = annualizedBudgetAmount(item);
  const monthly = yearly / 12;
  const weekly = yearly / 52.1775;
  const daily = yearly / 365.25;
  const percentage = item.kind === 'expense' && totalAnnualExpense > 0 ? (yearly / totalAnnualExpense) * 100 : 0;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card budget-modal item-detail-modal">
        <div className="card-header"><div><p className="eyebrow">{item.kind === 'income' ? 'Income item' : 'Expense item'}</p><h2>{item.name}</h2></div><button className="secondary-button" type="button" onClick={onClose}>Close</button></div>
        <div className="detail-summary-grid">
          <MetricCard title="Daily" value={formatMoney(daily)} detail="Annualised average" icon={<WalletCards />} />
          <MetricCard title="Weekly" value={formatMoney(weekly)} detail="Annualised average" icon={<WalletCards />} />
          <MetricCard title="Monthly" value={formatMoney(monthly)} detail="Annualised average" icon={<WalletCards />} />
          <MetricCard title="Yearly" value={formatMoney(yearly)} detail={item.kind === 'expense' ? `${percentage.toFixed(1)}% of yearly expenses` : 'Annualised total'} icon={<WalletCards />} />
        </div>
        <div className="item-detail-list">
          <div><span>Supplier / source</span><strong>{item.supplier || '—'}</strong></div>
          <div><span>Category</span><strong>{item.category || '—'}</strong></div>
          <div><span>Amount per occurrence</span><strong>{formatMoney(item.amount)}</strong></div>
          <div><span>Schedule</span><strong>{item.schedule || item.cycle}</strong></div>
          <div><span>Rule</span><strong>{budgetRuleLabel(item)}</strong></div>
          <div><span>Occurrences/year</span><strong>{formatNumber(annualOccurrenceCount(item))}</strong></div>
        </div>
      </div>
    </div>
  );
}

function ProjectionWeekModal({ week, onClose }: { week: ReturnType<typeof buildBudgetProjectionForRange>[number]; onClose: () => void }) {
  const expenseRows = week.items.filter((i) => i.kind === 'expense').map((item) => { const count = occurrenceCountInWeek(item, week.start, week.end); return { item, count, total: item.amount * count }; }).filter((r) => r.count > 0).sort((a, b) => b.total - a.total);
  const expenseTotal = expenseRows.reduce((sum, r) => sum + r.total, 0);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card budget-modal projection-week-modal">
        <div className="card-header"><div><p className="eyebrow">Projection week</p><h2>{formatWeekRange(week.start, week.end)}</h2></div><button className="secondary-button" type="button" onClick={onClose}>Close</button></div>
        <div className="detail-summary-grid">
          <MetricCard title="Week income" value={formatMoney(week.income)} detail="Scheduled into this week" icon={<Landmark />} />
          <MetricCard title="Week expenses" value={formatMoney(week.expenses)} detail={`${expenseRows.length} expense item${expenseRows.length === 1 ? '' : 's'}`} icon={<ReceiptText />} />
          <MetricCard title="Week net" value={formatMoney(week.net)} detail="Income less expenses" icon={<WalletCards />} />
          <MetricCard title="Projected balance" value={formatMoney(week.balance)} detail="After this week" icon={<WalletCards />} />
        </div>
        <div className="table-wrap budget-table-wrap projection-week-table">
          <table>
            <thead><tr><th>Expense item</th><th>Category</th><th>Schedule</th><th>Rule</th><th>Occurrences</th><th>Amount</th><th>Week total</th></tr></thead>
            <tbody>{expenseRows.map(({ item, count, total }) => <tr key={item.id}><td>{item.name}</td><td>{item.category || '—'}</td><td>{item.schedule || item.cycle}</td><td>{budgetRuleLabel(item)}</td><td>{formatNumber(count)}</td><td>{formatMoney(item.amount)}</td><td>{formatMoney(total)}</td></tr>)}{!expenseRows.length && <tr><td colSpan={7}>No expense items are scheduled in this week.</td></tr>}</tbody>
            <tfoot><tr><td colSpan={6}>Expense total</td><td>{formatMoney(expenseTotal)}</td></tr></tfoot>
          </table>
        </div>
        <p className="help-text">This popup shows the Expense Schedule items whose rules place them inside this Tuesday–Monday week.</p>
      </div>
    </div>
  );
}

function BudgetItemModal({ kind, item, categories, onSave, onClose }: { kind: BudgetKind; item: BudgetItem; categories: string[]; onSave: (item: BudgetItem) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<BudgetItem>(item);
  const [daysOfMonthText, setDaysOfMonthText] = useState((item.daysOfMonth || (item.dayOfMonth ? [item.dayOfMonth] : [])).join(', '));
  const [monthsText, setMonthsText] = useState((item.months || []).join(', '));
  const [dueDatesText, setDueDatesText] = useState((item.dueDates || []).map(formatBudgetDateText).join(', '));
  const updateDraft = (patch: Partial<BudgetItem>) => setDraft((c) => ({ ...c, ...patch }));
  const parseList = (value: string) => value.split(',').map((i) => i.trim()).filter(Boolean);
  const saveDraft = () => {
    if (!draft.name.trim()) return;
    onSave({ ...draft, kind, name: draft.name.trim(), cycle: cycleFromSchedule(draft), daysOfMonth: parseList(daysOfMonthText).map(Number).filter(Boolean), dayOfMonth: parseList(daysOfMonthText).map(Number).filter(Boolean)[0], months: parseList(monthsText).map(Number).filter(Boolean), dueDates: parseList(dueDatesText), endDate: draft.endDate ? formatBudgetDateText(draft.endDate) : '' });
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card budget-modal">
        <div className="card-header"><div><p className="eyebrow">{kind === 'income' ? 'Income' : 'Expense'}</p><h2>{item.name ? 'Edit item' : 'Add item'}</h2></div><button className="secondary-button" type="button" onClick={onClose}>Close</button></div>
        <div className="form-grid">
          <label>Name<input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} /></label>
          <label>Supplier / source<input value={draft.supplier || ''} onChange={(e) => updateDraft({ supplier: e.target.value })} /></label>
          <label>Amount<input type="number" value={draft.amount} onChange={(e) => updateDraft({ amount: Number(e.target.value || 0) })} /></label>
          {kind === 'expense' && <label>Category<select value={draft.category || ''} onChange={(e) => updateDraft({ category: e.target.value })}><option value="">Select category</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>}
          <label>Schedule<select value={draft.schedule || 'recurring'} onChange={(e) => updateDraft({ schedule: e.target.value as BudgetSchedule })}><option value="recurring">Recurring</option><option value="once-off">Once off</option><option value="random">Random</option></select></label>
          {(draft.schedule || 'recurring') === 'recurring' && <div className="schedule-inline-row"><label>Count<input type="number" min="1" value={draft.intervalCount || 1} onChange={(e) => updateDraft({ intervalCount: Number(e.target.value || 1) })} /></label><label>Every<select value={draft.intervalUnit || 'week'} onChange={(e) => updateDraft({ intervalUnit: e.target.value as BudgetIntervalUnit })}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option><option value="year">Year</option></select></label><label>Starting on<input type="date" value={toDateInputValue(draft.anchorDate || '')} onChange={(e) => updateDraft({ anchorDate: formatBudgetDateText(e.target.value) })} /></label></div>}
          {(draft.schedule || 'recurring') === 'random' && <label>Start date<input type="date" value={toDateInputValue(draft.anchorDate || '')} onChange={(e) => updateDraft({ anchorDate: formatBudgetDateText(e.target.value) })} /></label>}
          {(draft.schedule || 'recurring') === 'random' && <label>Day of the month<input value={daysOfMonthText} onChange={(e) => setDaysOfMonthText(e.target.value)} placeholder="1, 15, 28" /></label>}
          {(draft.schedule || 'recurring') === 'random' && <label>Months<input value={monthsText} onChange={(e) => setMonthsText(e.target.value)} placeholder="2, 5, 8, 11" /></label>}
          <label>Due dates<input value={dueDatesText} onChange={(e) => setDueDatesText(e.target.value)} placeholder="12/02/2026, 12/08/2026" /></label>
          <label>End date<input type="date" value={toDateInputValue(draft.endDate || '')} onChange={(e) => updateDraft({ endDate: formatBudgetDateText(e.target.value) })} /></label>
          <label>Rule note<input value={draft.note || ''} onChange={(e) => updateDraft({ note: e.target.value })} placeholder="Fortnight Thursday, 15th of month, etc" /></label>
        </div>
        <div className="button-row"><button className="primary-button" type="button" onClick={saveDraft}>Save {kind}</button><button className="secondary-button" type="button" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}

function SavingsAccountModal({ account, onSave, onClose }: { account: SavingsAccount; onSave: (account: SavingsAccount) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<SavingsAccount>(account);
  const updateDraft = (patch: Partial<SavingsAccount>) => setDraft((c) => ({ ...c, ...patch }));
  const saveDraft = () => { if (!draft.name.trim()) return; onSave({ ...draft, name: draft.name.trim(), note: draft.note || '' }); };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card budget-modal">
        <div className="card-header"><div><p className="eyebrow">Savings</p><h2>{account.name ? 'Edit account' : 'Add account'}</h2></div><button className="secondary-button" type="button" onClick={onClose}>Close</button></div>
        <div className="form-grid">
          <label>Account name<input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} placeholder="Emergency fund" /></label>
          <label>Balance<input type="number" value={draft.balance} onChange={(e) => updateDraft({ balance: Number(e.target.value || 0) })} /></label>
          <label>Note<input value={draft.note || ''} onChange={(e) => updateDraft({ note: e.target.value })} placeholder="Bank, goal, offset, etc" /></label>
        </div>
        <div className="button-row"><button className="primary-button" type="button" onClick={saveDraft}>Save account</button><button className="secondary-button" type="button" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}
