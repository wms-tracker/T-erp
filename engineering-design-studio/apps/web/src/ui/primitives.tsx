import React from "react";

export function Panel({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col ${className}`}>
      {title && <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400 border-b border-border">{title}</div>}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

export function TopBarButton({
  children,
  onClick,
  disabled,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-2.5 py-1.5 text-[12.5px] rounded-md transition-colors ${
        disabled
          ? "text-slate-600 cursor-not-allowed"
          : active
          ? "bg-accent text-slate-900 font-medium"
          : "text-slate-200 hover:bg-panel2"
      }`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <label className="w-24 shrink-0 text-[11.5px] text-slate-400">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  onCommit,
  step = 1,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="w-full bg-panel2 border border-border rounded px-2 py-1 text-[12.5px] text-slate-100 focus:outline-none focus:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
    />
  );
}

export function TextField({ value, onChange, onCommit, disabled }: { value: string; onChange: (v: string) => void; onCommit?: () => void; disabled?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      className="w-full bg-panel2 border border-border rounded px-2 py-1 text-[12.5px] text-slate-100 focus:outline-none focus:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
    />
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 text-[12px] border-b-2 -mb-px ${
            active === t.id ? "border-accent text-slate-100" : "border-transparent text-slate-500 hover:text-slate-300"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
