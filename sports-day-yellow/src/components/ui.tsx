import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SPORT_STATUS_LABEL, type MemberStatus, type SportStatus } from '../lib/view';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- Toast
type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; text: string }
const ToastCtx = createContext<{ show: (kind: ToastKind, text: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const show = useCallback((kind: ToastKind, text: string) => {
    const id = ++seq.current;
    setItems((x) => [...x.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end" role="status" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 animate-[toast_.2s_ease-out]',
              t.kind === 'success' && 'bg-ink text-white ring-brand-400',
              t.kind === 'error' && 'bg-red-600 text-white ring-red-700',
              t.kind === 'info' && 'bg-white text-ink ring-gray-200',
            )}
          >
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" /> : t.kind === 'error' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error('useToast outside ToastProvider');
  return c;
}

// ---------------------------------------------------------------- Modal
export function Modal({
  open, onClose, title, subtitle, children, footer, size = 'md', busy,
}: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg'; busy?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, busy]);
  if (!open) return null;
  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-xl',
          size === 'lg' && 'sm:max-w-3xl',
        )}
      >
        <div className="flex items-start gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-gray-500">{subtitle}</div>}
          </div>
          <button className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40" onClick={onClose} disabled={busy} aria-label="ปิด">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3 sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Confirm dialog (promise based)
export interface ConfirmOpts {
  title: string;
  message: ReactNode;
  confirmText?: string;
  danger?: boolean;
  /** user must type this text to enable the confirm button */
  requireText?: string;
}
const ConfirmCtx = createContext<((o: ConfirmOpts) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => { setTyped(''); setState({ ...o, resolve }); }), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  const blocked = !!state?.requireText && typed.trim() !== state.requireText;
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          open
          size="sm"
          onClose={() => close(false)}
          title={<span className="flex items-center gap-2">{state.danger && <AlertTriangle className="h-5 w-5 text-red-600" />}{state.title}</span>}
          footer={
            <>
              <Button variant="ghost" onClick={() => close(false)}>ยกเลิก</Button>
              <Button variant={state.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)} autoFocus={!state.requireText}>
                {state.confirmText ?? 'ยืนยัน'}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-gray-700">{state.message}</div>
          {state.requireText && (
            <label className="mt-4 block text-sm">
              พิมพ์ <b className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">{state.requireText}</b> เพื่อยืนยัน
              <input className="input mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </label>
          )}
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error('useConfirm outside ConfirmProvider');
  return c;
}

// ---------------------------------------------------------------- Small pieces
type BtnVariant = 'primary' | 'dark' | 'ghost' | 'outline' | 'danger';
export function Button({
  variant = 'primary', size = 'md', loading, className, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'min-h-[40px] px-4 text-sm' : 'min-h-[32px] px-2.5 text-xs',
        variant === 'primary' && 'bg-brand-400 text-ink hover:bg-brand-500',
        variant === 'dark' && 'bg-ink text-white hover:bg-gray-800',
        variant === 'ghost' && 'text-gray-700 hover:bg-gray-100',
        variant === 'outline' && 'border border-gray-300 bg-white text-gray-800 hover:border-gray-400 hover:bg-gray-50',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ProgressBar({ percent, status }: { percent: number; status: SportStatus }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cx('h-full rounded-full transition-all duration-500', status === 'over' ? 'bg-orange-500' : status === 'full' ? 'bg-green-500' : 'bg-brand-400')}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function SportStatusBadge({ status }: { status: SportStatus }) {
  const cls = {
    empty: 'bg-gray-100 text-gray-600 ring-gray-200',
    open: 'bg-brand-100 text-brand-800 ring-brand-300',
    full: 'bg-green-100 text-green-800 ring-green-300',
    over: 'bg-orange-100 text-orange-800 ring-orange-300',
  }[status];
  return <span className={cx('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1', cls)}>{SPORT_STATUS_LABEL[status]}</span>;
}

export function MemberStatusBadge({ status, label }: { status: MemberStatus; label: string }) {
  const cls = { none: 'bg-gray-100 text-gray-600', one: 'bg-brand-100 text-brand-800', multi: 'bg-ink text-brand-300' }[status];
  return <span className={cx('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{label}</span>;
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
      {icon && <div className="mb-2 text-gray-400">{icon}</div>}
      <div className="font-semibold text-gray-700">{title}</div>
      {text && <div className="mt-1 text-sm text-gray-500">{text}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'กำลังโหลดข้อมูล…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
      <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      <span>{label}</span>
    </div>
  );
}
