import React from 'react';
import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  GitCompare,
  LayoutDashboard,
  Menu,
  Moon,
  SearchCode,
  Sun,
  X,
} from 'lucide-react';

export type NavSection =
  | 'overview'
  | 'simulator'
  | 'inspector'
  | 'scenarios'
  | 'compare'
  | 'learn';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  mobileOpen: boolean;
  onSetMobileOpen: (open: boolean) => void;
}

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'simulator', label: 'Cache Simulator', icon: Activity },
  { id: 'inspector', label: 'Header Inspector', icon: SearchCode },
  { id: 'scenarios', label: 'Scenario Lab', icon: FlaskConical },
  { id: 'compare', label: 'Compare Policies', icon: GitCompare },
  { id: 'learn', label: 'Learning Center', icon: BookOpen },
];

export function Sidebar({
  activeSection,
  onSelectSection,
  collapsed,
  onToggleCollapse,
  theme,
  onToggleTheme,
  mobileOpen,
  onSetMobileOpen,
}: SidebarProps) {
  const handleNavClick = (section: NavSection) => {
    onSelectSection(section);
    onSetMobileOpen(false);
  };

  const brandBlock = (isCompact: boolean) => (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4 text-cyan-600 dark:text-cyan-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 7h11l-3-3" />
          <path d="M20 17H9l3 3" />
          <rect x="3" y="10" width="6" height="4" rx="1" />
          <rect x="15" y="10" width="6" height="4" rx="1" />
        </svg>
      </div>
      {!isCompact && (
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            CacheLab
          </div>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Day 42/365
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Header Bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-4 px-4 py-3 bg-white dark:bg-[#0F1522] border-b border-slate-200 dark:border-slate-800/80">
        {brandBlock(false)}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => onSetMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => onSetMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Rail (Desktop sticky + Mobile drawer) */}
      <aside
        aria-label="Primary navigation"
        className={`fixed lg:sticky top-0 left-0 z-50 lg:z-20 h-screen flex flex-col justify-between bg-white dark:bg-[#0F1522] border-r border-slate-200 dark:border-slate-800/80 transition-all duration-150 ${
          collapsed ? 'w-[72px]' : 'w-60'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Top Brand Zone */}
          <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-slate-200 dark:border-slate-800/80">
            {brandBlock(collapsed)}
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:inline-flex p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors shrink-0"
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => onSetMobileOpen(false)}
              aria-label="Close navigation menu"
              className="lg:hidden p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white border border-transparent'
                  } ${collapsed ? 'justify-center px-2' : ''}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Controls */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-slate-200 dark:border-slate-800 transition-colors whitespace-nowrap ${
              collapsed ? 'justify-center px-2' : ''
            }`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
            {!collapsed && <span>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>}
          </button>
          {!collapsed && (
            <p className="px-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Educational HTTP caching model covering selected RFC 9111 rules.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
