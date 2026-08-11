'use client';

/**
 * Sidebar — refined visual system + module-grant gating.
 *
 * Top-0.5% changes vs. prior:
 *   - Workspace switcher chip at top — shows tenant + active country pill
 *   - Subtle gradient backdrop (warm cream → brand-tinted at top edge)
 *   - Active item: brand bar + soft brand-50 wash + medium weight
 *   - Section labels: 10px tracked +0.16em, subdued
 *   - Module-grant aware: items disabled (greyed + tooltip) when the user lacks access
 *   - New entries for Finance, Procurement, IT-Security, Access admin
 *
 * Module-grant lookup happens client-side from the home-summary `grants` (filled by API).
 * The server re-checks on every request — UI gating is purely an affordance hint.
 */

// WP-3 ↔ WP-5 seam: the Follow-ups badge reads the SAME `useTasks({mine:true})`
// cache entry the /crm/tasks page groups from, so the count can never drift.
import { useOverdueFollowUpCount } from '@/app/(app)/crm/tasks/_lib/follow-ups';
import { ZMark, ZWordmark } from '@/components/brand/ZMark';
import { getCurrentDevUser } from '@/lib/api';
import { cn } from '@/lib/cn';
import { type GrantLevel, useFeatureFlags, useMyGrants } from '@/lib/hooks';
import { type ModuleKey, findInvalidModuleKeys } from '@zero/shared/rbac';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  Bookmark,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Coins,
  CreditCard,
  Database,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Folder,
  GaugeCircle,
  GitBranch,
  GitPullRequest,
  Globe,
  GraduationCap,
  Headphones,
  Home,
  Inbox,
  Landmark,
  Layers,
  LayoutTemplate,
  Leaf,
  ListChecks,
  Mail,
  MailX,
  MapPin,
  Megaphone,
  Package,
  PenLine,
  Receipt,
  Rocket,
  Scale,
  Search,
  Server,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Target,
  Target as TargetIcon,
  TrendingUp,
  Truck,
  UserPlus,
  UserSearch,
  Users,
  Wallet,
  Workflow,
  Wrench,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  shortcut?: string;
  /**
   * If set, the item is hidden unless the user has at least viewer grant on this
   * module. Typed as `ModuleKey` (NOT `string`) so a typo here is a COMPILE error
   * — a bad key used to fail silently and lock the whole section out (the
   * 2026-06-08 `platform` P0). See packages/shared/src/rbac/modules.ts.
   */
  module?: ModuleKey;
  /**
   * Minimum grant LEVEL on `module` required to see this item. Absent ⇒ any grant
   * (viewer+) shows it (unchanged legacy behavior). Set 'admin' on config/settings
   * surfaces and 'editor' on manager surfaces so a plain viewer's nav is a focused
   * everyday set, not the full module. Super-admins always see everything.
   */
  minLevel?: GrantLevel;
  /** If true, only super-admin sees this. */
  adminOnly?: boolean;
};
type NavSection = { title: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    title: 'Workspace',
    // Trimmed to universal, non-module surfaces. Relocated (Wave: IA cleanup):
    //   • Time → "Time & attendance" (module: time)
    //   • Policies → "HR" (module: hr)
    //   • Service catalog → "IT & Security" (module: service)
    //   • Notification prefs → Settings › Notifications tab (already there) — no longer a nav item
    //   • Reports → removed; each module owns its own reports
    items: [
      { href: '/home', label: 'Home', icon: Home, shortcut: 'g h' },
    ],
  },
  // ── Per-module sections (Wave 22 reorg, rounds 1081-1110) ─────────────────
  // Each module is its own visible section so a user with only CRM grant sees
  // only the CRM section. Sections with zero visible items auto-hide (see
  // visibleItems.length === 0 check downstream).
  {
    title: 'CRM',
    // Pruned to the CRM module's own surviving pages (Wave 22 → CRM Prisma rebuild).
    // Removed: dead/duplicate pages (pipeline, intel, revenue-intel, depth, country-config)
    // and cross-module convenience links (onboarding, reseller, marketing, meetings)
    // that belong to their own sections.
    items: [
      { href: '/crm', label: 'Revenue Intelligence Center', icon: Sparkles, module: 'crm' },
      { href: '/crm/leads', label: 'Leads', icon: UserSearch, shortcut: 'g l', module: 'crm' },
      { href: '/crm/accounts', label: 'Accounts', icon: Building2, shortcut: 'g a', module: 'crm' },
      { href: '/crm/contacts', label: 'Contacts', icon: Users, module: 'crm' },
      {
        href: '/crm/opportunities',
        label: 'Opportunities',
        icon: Target,
        shortcut: 'g i',
        module: 'crm',
      },
      { href: '/crm/tasks', label: 'Follow-ups', icon: ListChecks, module: 'crm' },
      { href: '/crm/dashboards', label: 'Dashboards', icon: BarChart3, module: 'crm' },
      { href: '/crm/forecast', label: 'Forecast', icon: TrendingUp, module: 'crm' },
      { href: '/crm/settings', label: 'Settings', icon: Settings2, minLevel: 'admin', module: 'crm' },
    ],
  },
  {
    title: 'Contracts',
    items: [
      {
        href: '/contracts',
        label: 'Contracts',
        icon: FileSignature,
        shortcut: 'g x',
        module: 'contracts',
      },
      { href: '/contracts/billing', label: 'Billing reminders', icon: Bell, module: 'contracts' },
      { href: '/contracts/renewals', label: 'Renewals', icon: TrendingUp, module: 'contracts' },
      { href: '/contracts/import', label: 'AI import', icon: Sparkles, module: 'contracts' },
      {
        href: '/contracts/obligations',
        label: 'Obligations & renewals',
        icon: ListChecks,
        module: 'contracts',
      },
      {
        href: '/contracts/templates',
        label: 'Templates',
        icon: LayoutTemplate,
        module: 'contracts',
      },
      { href: '/renewals', label: 'Renewals & expansion', icon: TrendingUp, module: 'contracts' },
    ],
  },
  {
    title: 'E-signature',
    // Standalone Sign module (relocated from /contracts/esign). Reusable by any
    // team via the `esign` module grant; the contracts "send for signature" flow
    // still calls the same shared endpoints.
    items: [
      { href: '/esign', label: 'Signature requests', icon: FileSignature, module: 'esign' },
      { href: '/esign/send', label: 'Send for signature', icon: PenLine, module: 'esign' },
      { href: '/esign/documents', label: 'Document library', icon: Folder, module: 'esign' },
    ],
  },
  {
    title: 'HR',
    items: [
      // Ungated (no `module`): policy read + acknowledgement is a universal, auth-only,
      // compliance-mandatory surface for EVERY employee — shown here under HR, visible to all.
      { href: '/policies', label: 'Policies', icon: ShieldCheck, shortcut: 'g k' },
      // 2026-08-03: every internal employee held the baseline hr:viewer self-service grant
      // (own profile / leave / payslip — persona-bundles.ts), so `module: 'hr'` alone hid
      // nothing here — it was satisfied by every employee. The items below are department/admin
      // surfaces (full roster, succession planning, headcount, offboarding, onboarding-journey
      // authoring), not self-service, so they additionally require `minLevel: 'editor'` — the
      // real HR-department floor (hr_ops/hr_country_lead get 'editor', hr_admin_global/
      // tenant_super_admin get 'admin'; baseline never exceeds 'viewer'). See ModuleGate's
      // matching `minLevel` prop (access-denied.tsx) for the page-level half of this fix — the
      // nav filter alone only hides the link, it doesn't stop direct URL navigation.
      //
      // TEMP (2026-08-05): grants-store.ts's getGrants() now carves `hr` OUT of the universal
      // baseline floor — plain employees no longer get hr:viewer at all, only managers
      // (isManager on the durable record) do, because employee HR data isn't accurate yet. So
      // `module: 'hr'` items below DO now hide for plain (non-manager) employees, unlike the
      // paragraph above describes. Revert grants-store.ts's carve-out to restore that.
      // Unlike the other items here, this is a genuine 3-tier page (employee/manager/exec —
      // hr/dashboards/page.tsx) that already does its own internal role-based tab filtering
      // and API-side comp gating (canSeeComp) — every employee legitimately has an "employee"
      // tier ("My profile") here, so no minLevel.
      { href: '/hr/dashboards', label: 'Dashboards', icon: BarChart3, module: 'hr' },
      { href: '/hr/employees', label: 'Employees', icon: Users, shortcut: 'g e', module: 'hr', minLevel: 'editor' },
      { href: '/hr/country-dashboard', label: 'HR dashboard', icon: MapPin, module: 'hr', minLevel: 'editor' },
      { href: '/hr/dashboard', label: 'Headcount overview', icon: Users, module: 'hr', minLevel: 'editor' },
      { href: '/hr/depth', label: 'Career + succession', icon: GraduationCap, module: 'hr', minLevel: 'editor' },
      {
        href: '/hr/time-admin',
        label: 'Holidays & PTO policies',
        icon: CalendarDays,
        module: 'hr',
        minLevel: 'editor',
      },
      { href: '/hr/settings', label: 'HR settings', icon: Settings2, minLevel: 'admin', module: 'hr' },
      // Payroll APIs (/api/v1/payroll, /api/v1/payroll-runs) map to the `time` module — not `hr`.
      // 2026-08-03: audited `time`'s levels — baseline is 'editor' (persona-bundles.ts), so
      // `minLevel: 'editor'` alone would hide nothing; real payroll-processing access
      // (payroll_admin persona, or tenant_super_admin) is 'admin'. "Payroll runs" is genuine
      // admin batch processing (create/calculate/approve/pay a whole company run) — gated
      // accordingly. "My pay stubs" is the new self-service counterpart, baseline-visible.
      { href: '/hr/payroll', label: 'Payroll calculator', icon: Coins, module: 'time' },
      { href: '/payroll/paystubs', label: 'My pay stubs', icon: Wallet, module: 'time' },
      { href: '/payroll/runs', label: 'Payroll runs', icon: Coins, module: 'time', minLevel: 'admin' },
      { href: '/hr/journeys', label: 'Onboarding journeys', icon: Users, module: 'hr', minLevel: 'editor' },
      // Pulse API (/api/v1/pulse) maps to the `hr` module — not `itsec`.
      { href: '/it/pulse/me', label: 'My activity data', icon: Activity, module: 'hr' },
      // HR helpdesk is intentionally self-service-first: employees see only their own tickets,
      // HR admins see the full queue — scoped in-handler, not by module grant. Leave ungated.
      { href: '/hr/helpdesk', label: 'HR helpdesk', icon: Inbox, module: 'hr' },
      { href: '/hr/offboarding', label: 'Offboarding', icon: UserSearch, module: 'hr', minLevel: 'editor' },
      { href: '/hr/new-hire-wizard', label: 'New-hire wizard', icon: Rocket, module: 'hr', minLevel: 'editor' },
      {
        href: '/hr/documents',
        label: 'HR documents',
        icon: FileText,
        shortcut: 'g f',
        module: 'hr',
      },
      // Admin surface for uploading a document into a specific employee's file — distinct from
      // the self-service page above, gated to hr:admin (it writes into someone else's record).
      { href: '/hr/documents/admin', label: 'Manage documents', icon: FileText, module: 'hr', minLevel: 'admin' },
      // 2026-08-03: renamed from "Compensation" — now the full self-service employee record
      // (identity/employment/compensation/leave/compliance, plus a manager's direct reports),
      // not just a comp figure. URL kept at /compensation so bookmarks/shortcuts survive.
      { href: '/compensation', label: 'My Record', icon: Coins, module: 'hr' },
      { href: '/onboarding', label: 'Onboarding', icon: Rocket, shortcut: 'g o', module: 'hr' },
      // Performance + Leaderboard removed for now (2026-08-03, explicit request) — Recognition
      // (the give/receive-kudos feed) stays, only the leaderboard ranking view is pulled.
      { href: '/recognition', label: 'Recognition', icon: Sparkles, shortcut: 'g r', module: 'hr' },
      // Expenses API is BASELINE (self-service, ungated by module) — nav-placed here per
      // the 2026-07 HR/T&A cleanup; URL is unchanged (/expenses), so bookmarks/shortcuts survive.
      { href: '/expenses', label: 'Expenses', icon: Receipt, module: 'hr' },
    ],
  },
  {
    title: 'Time & attendance',
    items: [
      { href: '/time/dashboard', label: 'Time dashboards', icon: BarChart3, module: 'time' },
      { href: '/time', label: 'Time & leave', icon: Clock, shortcut: 'g t', module: 'time' },
      { href: '/time/timesheets', label: 'Timesheets', icon: Clock, module: 'time' },
      { href: '/time/approvals', label: 'Approvals', icon: CheckCircle2, module: 'time' },
      // Org chart nav entry removed 2026-08 — consolidated to a single global entry point,
      // the topbar's org-chart icon (components/shell/topbar.tsx), which now points at this
      // same /time/org canvas instead of the older /hr/org-chart table view.
      { href: '/time/pto', label: 'PTO & leave', icon: CalendarDays, module: 'time' },
      { href: '/time/leave-reports', label: 'Reports & delegation', icon: BarChart3, module: 'time' },
      // Relocated from HR (2026-07 cleanup) — accrual history + leave-decision compliance are
      // both Time & Attendance reporting, not HR data ownership.
      { href: '/time/accrual-ledger', label: 'Accrual ledger', icon: Layers, minLevel: 'admin', module: 'time' },
      { href: '/time/charge-codes', label: 'Charge codes', icon: FileText, module: 'time' },
      { href: '/time/config', label: 'Time settings', icon: Settings2, minLevel: 'admin', module: 'time' },
      { href: '/time/settings', label: 'T&A Settings', icon: Settings2, minLevel: 'admin', module: 'time' },
      { href: '/time/depth', label: 'Clock + shifts + OT', icon: Clock, module: 'time' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { href: '/finance/dashboard', label: 'Dashboards', icon: BarChart3, module: 'finance' },
      { href: '/finance', label: 'Finance', icon: Banknote, module: 'finance' },
      { href: '/finance/ledger', label: 'General ledger', icon: Banknote, module: 'finance' },
      {
        href: '/finance/invoices',
        label: 'Compliance invoices',
        icon: Banknote,
        module: 'finance',
      },
      {
        href: '/finance/compliance-calendar',
        label: 'Filing calendar',
        icon: CalendarDays,
        module: 'finance',
      },
      { href: '/finance/records', label: 'Records', icon: FileText, module: 'finance' },
      { href: '/finance/config', label: 'Picklists', icon: Settings2, module: 'finance' },
      { href: '/finance/depth', label: 'TB / P&L / BS', icon: FileSpreadsheet, module: 'finance' },
      { href: '/billing', label: 'Billing & subscriptions', icon: CreditCard, module: 'billing' },
      { href: '/finops', label: 'FinOps (cloud cost)', icon: GaugeCircle, module: 'platform' },
      { href: '/treasury', label: 'Treasury', icon: Banknote, module: 'finance' },
      {
        href: '/treasury/payment-runs',
        label: 'Payment runs',
        icon: ArrowLeftRight,
        module: 'finance',
      },
      {
        href: '/treasury/settings',
        label: 'Treasury settings',
        icon: Settings2,
        minLevel: 'admin', module: 'finance',
      },
      { href: '/insurance', label: 'Insurance', icon: ShieldCheck, module: 'finance' },
      {
        href: '/insurance/settings',
        label: 'Insurance settings',
        icon: Settings2,
        minLevel: 'admin', module: 'finance',
      },
      { href: '/ma', label: 'M&A workspace', icon: Building2, module: 'finance' },
      { href: '/equity-admin', label: 'Equity admin', icon: Coins, minLevel: 'admin', module: 'finance' },
      {
        href: '/finance/country-config',
        label: 'Payroll cadence by country',
        icon: MapPin,
        module: 'finance',
      },
      {
        href: '/finance/project-profitability',
        label: 'Project profitability',
        icon: TrendingUp,
        module: 'finance',
      },
      { href: '/finance/fixed-assets', label: 'Fixed assets', icon: Package, module: 'finance' },
      { href: '/finance/subscriptions', label: 'Subscriptions', icon: Banknote, module: 'finance' },
      { href: '/finance/tax-filings', label: 'Tax filings', icon: FileText, module: 'finance' },
      { href: '/finance/banking', label: 'Banking recon', icon: Landmark, module: 'finance' },
      { href: '/finance/fx-rates', label: 'FX rates', icon: ArrowLeftRight, module: 'finance' },
      {
        href: '/finance/journal-entries',
        label: 'Journal entries',
        icon: BookOpen,
        module: 'finance',
      },
      {
        href: '/finance/close-calendar',
        label: 'Close calendar',
        icon: CalendarDays,
        module: 'finance',
      },
      { href: '/finance/reports', label: 'Reports', icon: FileText, module: 'finance' },
    ],
  },
  {
    title: 'Procurement',
    // (dashboards/requisitions/config added Phase 4 — enterprise uplift)
    items: [
      {
        href: '/procurement/dashboard',
        label: 'Dashboards',
        icon: BarChart3,
        module: 'procurement',
      },
      { href: '/procurement', label: 'Procurement', icon: ShoppingCart, module: 'procurement' },
      {
        href: '/procurement/requisitions',
        label: 'Requisitions',
        icon: ListChecks,
        module: 'procurement',
      },
      { href: '/procurement/config', label: 'Settings', icon: Settings2, minLevel: 'admin', module: 'procurement' },
      {
        href: '/procurement/scorecard',
        label: 'Vendor scorecards',
        icon: ShoppingCart,
        module: 'procurement',
      },
      {
        href: '/procurement/onboarding',
        label: 'Vendor onboarding',
        icon: Truck,
        module: 'procurement',
      },
    ],
  },
  {
    title: 'Sales (CPQ)',
    items: [
      { href: '/cpq', label: 'CPQ dashboard', icon: BarChart3, module: 'cpq' },
      { href: '/cpq/products', label: 'Catalog', icon: Package, module: 'cpq' },
      {
        href: '/cpq/quotes',
        label: 'Quotes',
        icon: FileSpreadsheet,
        shortcut: 'g q',
        module: 'cpq',
      },
      { href: '/cpq/approvals', label: 'Discount approvals', icon: ListChecks, module: 'cpq' },
      { href: '/cpq/config', label: 'CPQ settings', icon: Settings2, minLevel: 'admin', module: 'cpq' },
    ],
  },
  {
    title: 'Marketing',
    // (dashboards + settings added Phase 4)
    items: [
      { href: '/marketing', label: 'Dashboard', icon: BarChart3, module: 'marketing' },
      { href: '/marketing/campaigns', label: 'Campaigns', icon: Megaphone, module: 'marketing' },
      { href: '/marketing/settings', label: 'Settings', icon: Settings2, minLevel: 'admin', module: 'marketing' },
      { href: '/marketing/leads', label: 'Leads', icon: UserPlus, module: 'marketing' },
      {
        href: '/marketing/sequences',
        label: 'Nurture sequences',
        icon: Workflow,
        module: 'marketing',
      },
      {
        href: '/marketing/email-templates',
        label: 'Email templates',
        icon: Mail,
        module: 'marketing',
      },
    ],
  },
  {
    title: 'Talent (ATS)',
    items: [
      { href: '/ats', label: 'Talent dashboards', icon: BarChart3, module: 'ats' },
      { href: '/ats/jobs', label: 'Open jobs', icon: Briefcase, shortcut: 'g j', module: 'ats' },
      {
        href: '/ats/candidates',
        label: 'Candidates',
        icon: UserSearch,
        shortcut: 'g b',
        module: 'ats',
      },
      { href: '/ats/settings', label: 'ATS settings', icon: Settings2, minLevel: 'admin', module: 'ats' },
    ],
  },
  {
    title: 'Lumen',
    items: [
      { href: '/lms/catalog', label: 'Catalog', icon: BookOpen, module: 'lms' },
      { href: '/lms/my-learning', label: 'My learning', icon: GraduationCap, module: 'lms' },
      { href: '/lms/content', label: 'Content manager', icon: Layers, module: 'lms' },
      { href: '/lms/courses', label: 'Course builder', icon: FileSpreadsheet, module: 'lms' },
      { href: '/lms/enrollments', label: 'Enrollments', icon: UserPlus, module: 'lms' },
      { href: '/lms/assessments', label: 'Assessment builder', icon: ListChecks, module: 'lms' },
      { href: '/lms/grading', label: 'Reviews & grading', icon: CheckCircle2, module: 'lms' },
      { href: '/lms/certifications', label: 'Certifications', icon: ShieldCheck, module: 'lms' },
      { href: '/lms/reports', label: 'Reports & analytics', icon: BarChart3, module: 'lms' },
      { href: '/lms/admin', label: 'Org administration', icon: Settings2, minLevel: 'admin', module: 'lms' },
    ],
  },
  {
    title: 'Service & support',
    items: [
      { href: '/service', label: 'Dashboards', icon: BarChart3, module: 'service' },
      {
        href: '/service-desk/tickets',
        label: 'Tickets',
        icon: Headphones,
        shortcut: 'g t',
        module: 'service',
      },
      {
        href: '/service-desk/config',
        label: 'Service settings',
        icon: Settings2,
        module: 'service',
      },
      {
        href: '/field-service/work-orders',
        label: 'Work orders',
        icon: Wrench,
        shortcut: 'g v',
        module: 'service',
      },
      {
        href: '/field-service/contracts',
        label: 'Service contracts',
        icon: FileSignature,
        module: 'service',
      },
      { href: '/assets', label: 'Customer assets', icon: Server, module: 'service' },
      {
        href: '/portal/cases',
        label: 'Cases',
        icon: Headphones,
        shortcut: 'g u',
        module: 'service',
      },
      {
        href: '/service/skills',
        label: 'Agent skills + routing',
        icon: ShieldCheck,
        module: 'service',
      },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/inventory', label: 'Inventory', icon: Package, module: 'procurement' },
      { href: '/data-quality', label: 'Data quality', icon: Database, adminOnly: true },
    ],
  },
  {
    title: 'IT & Security',
    items: [
      { href: '/it-security', label: 'IT & Security', icon: ShieldCheck, module: 'itsec' },
      { href: '/it-security/grc-dashboard', label: 'GRC Dashboard', icon: GaugeCircle, module: 'itsec' },
      { href: '/it-security/compliance', label: 'Framework Compliance', icon: ShieldCheck, module: 'itsec' },
      { href: '/it-security/defender-plan', label: 'Defender 90-Day Plan', icon: Shield, module: 'itsec' },
      { href: '/it-security/playbooks', label: 'Security Playbooks', icon: BookOpen, module: 'itsec' },
      { href: '/it-security/fortigate', label: 'FortiGate', icon: Server, module: 'itsec' },
      // Pulse API (/api/v1/pulse) maps to the `hr` module — not `itsec`.
      { href: '/it/pulse', label: 'Pulse analytics', icon: Activity, module: 'hr' },
      { href: '/it/endpoints', label: 'Endpoint compliance', icon: Database, module: 'itsec' },
      { href: '/itsm', label: 'ITSM dashboards', icon: BarChart3, module: 'service' },
      // Ungated (no `module`): the catalog GET + request submission are baseline employee
      // self-service (like leave/expenses) — shown here under IT & Security, visible to all.
      { href: '/itsm/catalog', label: 'Service catalog', icon: BookOpen },
      { href: '/itsm/incidents', label: 'Incidents', icon: AlertTriangle, module: 'service' },
      { href: '/itsm/change-requests', label: 'Changes', icon: GitPullRequest, module: 'service' },
      { href: '/itsm/problems', label: 'Problems', icon: Layers, module: 'service' },
      { href: '/itsm/cmdb', label: 'CMDB', icon: Database, module: 'service' },
      { href: '/itsm/roster', label: 'Queue staffing', icon: Users, minLevel: 'editor', module: 'service' },
      { href: '/itsm/settings', label: 'ITSM settings', icon: Settings2, minLevel: 'admin', module: 'service' },
      { href: '/resilience', label: 'Resilience hub', icon: Shield, adminOnly: true },
      { href: '/sre', label: 'SRE dashboard', icon: Activity, adminOnly: true },
    ],
  },
  {
    title: 'Legal & Compliance',
    items: [
      { href: '/legal', label: 'Legal & CLM', icon: Scale, module: 'legal' },
      { href: '/legal/dashboards', label: 'Legal dashboards', icon: BarChart3, module: 'legal' },
      { href: '/legal/config', label: 'Legal settings', icon: Settings2, minLevel: 'admin', module: 'legal' },
      { href: '/risk', label: 'Risk dashboards', icon: BarChart3, module: 'risk' },
      { href: '/risk/register', label: 'Risk register', icon: TargetIcon, module: 'risk' },
      { href: '/risk/controls', label: 'Control register', icon: ShieldCheck, module: 'risk' },
      { href: '/risk/settings', label: 'Risk settings', icon: Settings2, minLevel: 'admin', module: 'risk' },
      {
        href: '/compliance/requirements',
        label: 'Regulatory reqs',
        icon: Scale,
        module: 'compliance',
      },
      { href: '/compliance', label: 'Compliance', icon: GaugeCircle, module: 'compliance' },
      { href: '/privacy/dsr', label: 'Privacy / DSR', icon: ShieldCheck, module: 'compliance' },
      { href: '/esg', label: 'ESG dashboard', icon: Leaf, module: 'compliance' },
      { href: '/esg/metrics', label: 'ESG metrics', icon: GaugeCircle, module: 'compliance' },
      { href: '/esg/compliance', label: 'ESG regulatory', icon: Scale, module: 'compliance' },
      { href: '/esg/settings', label: 'ESG settings', icon: Settings2, minLevel: 'admin', module: 'compliance' },
    ],
  },
  {
    title: 'Delivery',
    items: [
      { href: '/sow', label: 'Delivery (SOW)', icon: ListChecks, shortcut: 'g w', module: 'sow' },
      { href: '/marketplace', label: 'Marketplace', icon: Package, module: 'platform' },
    ],
  },
  {
    title: 'Platform',
    items: [
      {
        href: '/analytics',
        label: 'Analytics',
        icon: BarChart3,
        shortcut: 'g y',
        module: 'analytics',
      },
      { href: '/analytics/reports', label: 'Reports', icon: FileText, module: 'analytics' },
      {
        href: '/analytics/dashboards',
        label: 'Dashboards',
        icon: GaugeCircle,
        module: 'analytics',
      },
      {
        href: '/analytics/config',
        label: 'Metric definitions',
        icon: Settings2,
        module: 'analytics',
      },
      { href: '/workflow', label: 'Workflow home', icon: BarChart3, module: 'workflow' },
      {
        href: '/workflow/rules',
        label: 'Workflows',
        icon: Zap,
        shortcut: 'g z',
        module: 'workflow',
      },
      { href: '/workflow/runs', label: 'Run history', icon: Activity, module: 'workflow' },
      { href: '/workflow/config', label: 'Workflow config', icon: Settings2, minLevel: 'admin', module: 'workflow' },
      { href: '/workflow/analytics', label: 'Rule analytics', icon: BarChart3, module: 'workflow' },
      { href: '/workflow/blueprints', label: 'Blueprints', icon: GitBranch, module: 'workflow' },
      { href: '/workflow/outbox', label: 'Outbox', icon: Inbox, module: 'workflow' },
      { href: '/admin/access-audit', label: 'Access audit', icon: ShieldCheck, adminOnly: true },
      { href: '/admin/personas', label: 'Persona bundles', icon: Users, module: 'platform' },
      { href: '/admin/roles', label: 'Roles', icon: Shield, adminOnly: true },
      { href: '/admin/sod', label: 'Seg. of duties', icon: ShieldAlert, adminOnly: true },
      { href: '/admin/tenant', label: 'Tenant admin', icon: Building2, adminOnly: true },
      { href: '/admin/announcements', label: 'Announcements', icon: Megaphone, adminOnly: true },
      { href: '/admin/dormant-users', label: 'Dormant users', icon: Users, adminOnly: true },
      { href: '/admin/mirror-health', label: 'Mirror health', icon: Database, adminOnly: true },
      { href: '/admin/observability', label: 'Observability', icon: Activity, adminOnly: true },
      { href: '/data-lifecycle', label: 'Data lifecycle', icon: Layers, module: 'compliance' },
      { href: '/audit/archive', label: 'Audit archive', icon: Archive, adminOnly: true },
      { href: '/settings/developer', label: 'Developer portal', icon: Code2, adminOnly: true },
      { href: '/settings/billing', label: 'Billing', icon: CreditCard, module: 'billing' },
      { href: '/settings/customer-portal', label: 'Customer portal', icon: Globe, adminOnly: true },
      { href: '/settings/scim', label: 'SCIM provisioning', icon: Users, adminOnly: true },
      {
        href: '/settings/email-suppression',
        label: 'Email suppression',
        icon: MailX,
        adminOnly: true,
      },
      { href: '/admin/ai', label: 'AI permissions', icon: Sparkles, adminOnly: true },
      { href: '/admin/global', label: 'Platform admin', icon: ShieldCheck, adminOnly: true },
      { href: '/settings/marketplace', label: 'Marketplace', icon: Package, module: 'platform' },
      { href: '/settings/api-keys', label: 'API keys', icon: Wrench, adminOnly: true },
      { href: '/files', label: 'File vault', icon: Folder, module: 'platform' },
    ],
  },
];

// ── Module-key contract guard (runtime, dev only) ──────────────────────────
// `NavItem.module` is typed as `ModuleKey`, so a literal typo is already a
// COMPILE error. This is the belt-and-suspenders second gate: it catches keys
// that slip past the type system (a cast, a future refactor that loosens the
// type, or a key that was REMOVED from MODULES while a sidebar entry still
// references it). It throws loudly in dev so the bad key is caught the instant
// you load the app — never again a silent section lockout. In prod it logs
// instead of throwing, so a stale key degrades the one item, not the whole shell.
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  const invalid = findInvalidModuleKeys(SECTIONS.flatMap((s) => s.items.map((i) => i.module)));
  if (invalid.length > 0) {
    throw new Error(
      `[sidebar] These module keys are not in MODULES (would silently lock out the section): ` +
        `${invalid.join(', ')}. Fix the key in sidebar.tsx or add it to packages/shared/src/rbac/modules.ts.`,
    );
  }
}

interface SidebarSession {
  email: string;
  tenant: string;
  country: string;
  roles: string[];
}

function isSuper(roles: string[]): boolean {
  return roles.includes('tenant_super_admin') || roles.includes('platform_super_admin');
}

/** localStorage key for which sidebar sections the user has expanded.
 *  Default: 'Workspace' expanded so first-time users see navigation immediately.
 *  Super-admins get all sections expanded on first visit (they see all items anyway). */
const EXPANDED_SECTIONS_LS_KEY = 'zero:sidebar:expanded-sections:v2';

/** localStorage key for the rail-collapsed state. Unlike `expandedSections` this
 *  used to be a bare `useState(false)` that forgot on reload — now persisted and
 *  toggled via the '[' shortcut. */
const COLLAPSED_LS_KEY = 'zero:sidebar:collapsed';

/** Sections always open on first load — enough to orient without overwhelming. */
const DEFAULT_EXPANDED: ReadonlySet<string> = new Set([
  'Workspace',
  'HR',
  'Time & attendance',
  'Finance',
  'CRM',
]);

function loadExpandedSections(isSuperAdmin = false): Set<string> {
  if (typeof window === 'undefined') return new Set(DEFAULT_EXPANDED);
  try {
    const raw = window.localStorage.getItem(EXPANDED_SECTIONS_LS_KEY);
    if (!raw) {
      // First visit: expand defaults (or everything for super-admin).
      const initial = isSuperAdmin
        ? new Set(SECTIONS.map((s) => s.title))
        : new Set(DEFAULT_EXPANDED);
      // Persist so next load restores the same state.
      window.localStorage.setItem(EXPANDED_SECTIONS_LS_KEY, JSON.stringify([...initial]));
      return initial;
    }
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? new Set(arr.filter((x): x is string => typeof x === 'string'))
      : new Set(DEFAULT_EXPANDED);
  } catch {
    return new Set(DEFAULT_EXPANDED);
  }
}

function saveExpandedSections(s: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EXPANDED_SECTIONS_LS_KEY, JSON.stringify([...s]));
  } catch {
    /* swallow quota errors */
  }
}

/**
 * Follow-ups overdue-count badge (WP-3). Rendered only inside the visible
 * `/crm/tasks` nav item, so the underlying `useTasks({mine:true})` query fires
 * only for users who can see the CRM section. Hidden at zero (no badge noise).
 * The count is the shared source WP-5's Follow-ups page groups from.
 */
function FollowUpsBadge() {
  const overdue = useOverdueFollowUpCount();
  if (overdue <= 0) return null;
  return (
    <span
      title={`${overdue} overdue follow-up${overdue === 1 ? '' : 's'}`}
      className="mono inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger-bg)] px-1 text-[10px] font-semibold tabular-nums text-[var(--danger-fg)]"
    >
      {overdue > 99 ? '99+' : overdue}
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  // Drives the section-expand + active-rail motion. When the OS "reduce motion"
  // setting is on, we render the static (unanimated) equivalents.
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [session, setSession] = useState<SidebarSession | null>(null);
  // Section expand/collapse state. MUST start with the same value on server and client to avoid
  // hydration mismatch — the server has no localStorage, so we initialize to empty Set on both
  // sides and rehydrate from localStorage in a post-mount useEffect. First paint shows everything
  // collapsed; a moment later the user's saved expansions appear. Standard SSR-safe pattern.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());
  // `mounted` gates conditional renders that depend on expandedSections so the SSR HTML and the
  // first client render always agree. After mount, conditionals (chevron direction, count chip,
  // active-page dot) reflect the loaded state.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Read session first so we can pass superAdmin status to loadExpandedSections,
    // which seeds an all-expanded default for super-admin on first visit.
    const s = getCurrentDevUser();
    const isSuperAdminUser = s ? isSuper(s.roles) : false;
    setExpandedSections(loadExpandedSections(isSuperAdminUser));
    // Rehydrate the rail-collapsed state (SSR-safe: starts false on server + first
    // client render, then reflects the saved choice post-mount).
    try {
      if (window.localStorage.getItem(COLLAPSED_LS_KEY) === '1') setCollapsed(true);
    } catch {
      /* ignore quota / private-mode errors */
    }
    setMounted(true);
  }, []);

  function toggleCollapsed(): void {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_LS_KEY, next ? '1' : '0');
      } catch {
        /* swallow */
      }
      return next;
    });
  }

  // '[' toggles the rail (ignored while typing in an input/textarea/contenteditable
  // or with a modifier held, so it never collides with text entry elsewhere in the shell).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function toggleSection(title: string): void {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      saveExpandedSections(next);
      return next;
    });
  }

  useEffect(() => {
    const sync = () => {
      const s = getCurrentDevUser();
      setSession(
        s ? { email: s.email, tenant: s.tenant, country: s.country, roles: s.roles } : null,
      );
    };
    sync();
    window.addEventListener('zero:session-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('zero:session-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Mobile drawer: close on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Mobile drawer: respond to a topbar-emitted toggle event.
  useEffect(() => {
    const handler = () => setMobileOpen((v) => !v);
    document.addEventListener('zero:sidebar:toggle', handler);
    return () => document.removeEventListener('zero:sidebar:toggle', handler);
  }, []);

  const { data: myGrants } = useMyGrants();
  // Super-admin status gates adminOnly nav items. Prefer the authoritative roles from
  // /grants/me — the client session helper (getCurrentDevUser) returns no roles under prod
  // SSO. Fall back to session roles (dev mode) until grants load.
  const superAdmin = isSuper(myGrants?.roles ?? session?.roles ?? []);
  const { data: flagsResp } = useFeatureFlags();
  // Tenant feature flags: missing entry = enabled; explicit `false` = disabled.
  const isModuleFlagOn = (mod: string): boolean => {
    const map = flagsResp?.flags.modules;
    if (!map) return true;
    return map[mod] !== false;
  };

  // Module visibility: super-admin always sees everything; otherwise the user must hold
  // at least viewer on the module. Always-on modules (no `module` field) are unconditionally visible.
  function shouldShow(item: NavItem): boolean {
    if (item.adminOnly && !superAdmin) return false;
    if (!item.module) return true;
    // Tenant-flag check applies to ALL users, including super-admin (contractual constraint).
    if (!isModuleFlagOn(item.module)) return false;
    if (!superAdmin) {
      const g = myGrants?.grants?.[item.module];
      // Transitional bridge — mirror route-module-gate.moduleEntitled: a `contracts` grant entitles
      // the `esign` module (they were one module before the carve-out), so the nav matches what the
      // API actually authorizes. Without this, a contracts-only user can open /esign by URL but sees
      // no Sign entry. Drop once tenants are backfilled with explicit esign grants.
      const bridged = item.module === 'esign' && !!myGrants?.grants?.['contracts'];
      if (!g && !bridged) return false;
      // Level gate — an item requiring a higher grant LEVEL than the user holds is hidden.
      // This is a nav affordance only (the API still enforces real authz), so a plain viewer
      // gets a focused everyday nav instead of the whole module's admin/config surface.
      // Bridged esign has no level of its own → treated as viewer.
      if (item.minLevel) {
        const rank: Record<GrantLevel, number> = { viewer: 1, editor: 2, admin: 3 };
        const held = g ? rank[g.level] : 1;
        if (held < rank[item.minLevel]) return false;
      }
    }
    return true;
  }

  // Compact country chip for a module ('*' = ★, otherwise comma-joined ISO-2 list).
  function moduleScopeChip(module?: string): string | null {
    if (!module || superAdmin) return null;
    const g = myGrants?.grants?.[module];
    if (!g) return null;
    if (g.countries === '*') return '★';
    return (g.countries as string[]).join(',');
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}
      <aside
        className={cn(
          'surface-glass border-r flex flex-col',
          'transition-[width,transform] duration-[var(--motion-base)] ease-out',
          // Desktop (lg+): sticky rail in flow. Below lg it is a drawer — a 280px rail
          // on a 768px tablet is 36% chrome, so the in-flow rail starts at lg.
          'lg:sticky lg:top-0 lg:h-dvh lg:shrink-0',
          collapsed ? 'lg:w-[60px]' : 'lg:w-[var(--sidebar-comfortable)]',
          // Below lg: fixed drawer; off-canvas by default. The drawer width is scoped
          // `max-lg:` (not a bare base utility) so it never ties with `lg:w-[60px]` at the
          // lg breakpoint — a bare `w-[...]` competes with the lg width at equal specificity
          // and Tailwind v4's JIT source order then decides the winner non-deterministically,
          // which silently defeated the rail-collapse.
          'fixed left-0 top-0 bottom-0 z-40 max-lg:w-[var(--sidebar-comfortable)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        aria-label="Primary"
        style={{
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--sidebar-border)',
        }}
      >
        {/* Brand row */}
        <div className="flex h-14 items-center gap-2.5 px-3.5">
          {collapsed ? <ZMark size="h-7 w-7" /> : <ZWordmark size="h-7" className="shrink-0" />}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
            className="ml-auto rounded-md p-1 text-ink-tertiary hover:bg-[var(--surface-sunken)] hover:text-ink-primary"
          >
            <ChevronLeft
              className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')}
            />
          </button>
        </div>

        {/* Workspace switcher chip */}
        {!collapsed && session && (
          <div className="mx-3 mb-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-2.5">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-ink-primary capitalize">
                  {session.tenant.replace(/-/g, ' ')}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-ink-tertiary">{session.email}</div>
              </div>
              <span
                title={`Country scope · ${session.country}`}
                className="inline-flex shrink-0 items-center rounded-full bg-[var(--brand-50)] px-2 py-0.5 mono text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-700)]"
              >
                {session.country}
              </span>
            </div>
          </div>
        )}

        {/* Search trigger — the ONLY search surface in the shell; opens the command palette,
            which covers global search plus "Go to <page>" navigation (see command-palette.tsx). */}
        <div className="px-3 pb-3">
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)]',
              'px-2.5 h-9 text-sm text-ink-tertiary',
              'hover:border-[var(--border-default)] hover:text-ink-secondary transition-colors',
            )}
            onClick={() => document.dispatchEvent(new CustomEvent('zero:command-palette:open'))}
          >
            <Search className="h-3.5 w-3.5" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Search everything…</span>
                <kbd className="mono text-[10px] text-ink-quaternary">⌘K</kbd>
              </>
            )}
          </button>
        </div>

        <nav className="px-2 overflow-y-auto flex-1 min-h-0">
          {SECTIONS.map((section, sIdx) => {
            const visibleItems = section.items.filter(shouldShow);
            if (visibleItems.length === 0) return null;
            // Section is expanded if: user opened it (only after mount — localStorage doesn't exist
            // on the server, so this stays false during SSR + first client render to keep hydration
            // in sync), or sidebar is rail-collapsed (rail shows icons only, no headers, so
            // per-section collapse is moot).
            const userExpanded = mounted && expandedSections.has(section.title);
            const isOpen = collapsed || userExpanded;
            // Show active-marker dot on collapsed sections so the user knows where the current page lives.
            const hasActive = visibleItems.some(
              (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
            );
            return (
              <div key={section.title} className={cn(sIdx > 0 && 'mt-3')}>
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.title)}
                    aria-expanded={isOpen}
                    className={cn(
                      'group flex w-full items-center gap-1.5 rounded-md px-2 py-1 mb-1',
                      'text-[10px] uppercase tracking-[0.16em] font-semibold',
                      'text-ink-quaternary hover:text-ink-secondary hover:bg-[var(--surface-sunken)]',
                      'transition-colors duration-[var(--motion-instant)] ease-out',
                    )}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={2} />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={2} />
                    )}
                    <span className="flex-1 text-left truncate">{section.title}</span>
                    {hasActive && !isOpen && (
                      <span
                        aria-label="contains current page"
                        className="h-1.5 w-1.5 rounded-full bg-[var(--brand-600)]"
                      />
                    )}
                    <span className="mono text-[9px] font-medium normal-case tracking-normal text-ink-quaternary/70">
                      {visibleItems.length}
                    </span>
                  </button>
                )}
                {/* Section body: height-animates open/closed (200ms). AnimatePresence
                  keeps the unmount-when-closed semantics (so collapsed items stay out
                  of the tab order) while adding an exit animation. `initial={false}`
                  suppresses the animation for sections already open at first paint —
                  no load flash. Reduced-motion collapses the duration to 0. */}
                <AnimatePresence initial={false}>
                  {(isOpen || collapsed) && (
                    <motion.ul
                      key="items"
                      initial={reduce ? false : { height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
                      style={{ overflow: 'hidden' }}
                      className="space-y-0.5"
                    >
                      {visibleItems.map((item) => {
                        const Icon = item.icon;
                        const active =
                          pathname === item.href || pathname.startsWith(item.href + '/');
                        const chip = moduleScopeChip(item.module);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href as never}
                              className={cn(
                                'group relative flex items-center gap-2.5 rounded-md px-2.5 h-8 text-sm',
                                'text-ink-secondary hover:text-ink-primary hover:bg-[var(--sidebar-item-hover)]',
                                'transition-colors duration-[var(--motion-instant)] ease-out',
                                active && [
                                  'bg-[var(--sidebar-item-active-bg)]',
                                  'text-[var(--sidebar-item-active-text)]',
                                  'font-medium',
                                ],
                              )}
                            >
                              {active &&
                                // Active rail. It slides in from the left + fades on
                                // activation (transform/opacity → composited). We deliberately
                                // do NOT share one layoutId across items: nested-prefix routes
                                // (e.g. /analytics and /analytics/config) can both be "active"
                                // at once, and two elements sharing a layoutId collide. Per-item
                                // entrance is collision-proof. Reduced-motion → static bar.
                                (reduce ? (
                                  <span
                                    aria-hidden
                                    className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-[var(--brand-600)]"
                                  />
                                ) : (
                                  <motion.span
                                    aria-hidden
                                    initial={{ opacity: 0, x: -4 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                                    className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-[var(--brand-600)]"
                                  />
                                ))}
                              <Icon
                                className={cn(
                                  'h-3.5 w-3.5 shrink-0',
                                  active ? 'text-[var(--brand-600)]' : 'text-ink-tertiary',
                                )}
                                strokeWidth={active ? 2 : 1.75}
                              />
                              {!collapsed && (
                                <>
                                  <span className="flex-1 truncate">{item.label}</span>
                                  {item.href === '/crm/tasks' && <FollowUpsBadge />}
                                  {chip && (
                                    <span
                                      title={chip === '★' ? 'All countries' : `Scoped to ${chip}`}
                                      className="mono text-[9px] font-semibold uppercase tracking-wider text-[var(--brand-700)]/70"
                                    >
                                      {chip}
                                    </span>
                                  )}
                                  {item.shortcut && !chip && (
                                    <kbd className="mono text-[10px] text-ink-quaternary opacity-0 group-hover:opacity-100 transition-opacity">
                                      {item.shortcut}
                                    </kbd>
                                  )}
                                </>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

        </nav>
      </aside>
    </>
  );
}
