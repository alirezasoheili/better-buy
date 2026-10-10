import type { ReactNode } from "react";
import { Dialog } from "radix-ui";
export function Panel({
  title,
  children,
  trigger,
}: {
  title: string;
  children: ReactNode;
  trigger: ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-backdrop" />
        <Dialog.Content className="panel" aria-describedby={undefined}>
          <header className="panel-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="بستن پنجره">
              ×
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function ReadNotice({
  title,
  children,
  retry,
  busy = false,
}: {
  title: string;
  children?: ReactNode;
  retry?: () => void;
  busy?: boolean;
}) {
  return (
    <section className="read-notice" role="status">
      <div>
        <strong>{title}</strong>
        {children && <p>{children}</p>}
      </div>
      {retry && (
        <button type="button" onClick={retry} disabled={busy}>
          {busy ? "در حال دریافت…" : "دریافت دوباره"}
        </button>
      )}
    </section>
  );
}
