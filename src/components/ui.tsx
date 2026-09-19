'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, LoaderCircle, CheckCircle2, AlertCircle } from 'lucide-react';
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="notice error" role="alert">
      <AlertCircle size={19} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Success({ message }: { message: string }) {
  return message ? (
    <div className="notice success" role="status">
      <CheckCircle2 size={19} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={22} /> Loading your workspace…
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`badge ${value === 'TRAVEL' ? 'amber' : ['PM_APPROVED', 'EXPORTED', 'SITE', 'SHOP', 'OFFICE'].includes(value) ? 'green' : ''}`}
    >
      {value.replaceAll('_', ' ')}
    </span>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const dialog = ref.current;
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={onClose}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ActionButton({
  action,
  children,
  className = '',
  onDone,
}: {
  action: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  return (
    <>
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          setSuccess('');
          try {
            const result = await action();
            setSuccess(
              typeof result === 'object' && result && 'message' in result
                ? String(result.message)
                : 'Saved.',
            );
            onDone?.();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <LoaderCircle className="spin" size={18} /> : null}
        {children}
      </button>
      <ErrorBox message={error} />
      <Success message={success} />
    </>
  );
}
