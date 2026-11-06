"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "m-auto w-full max-w-md rounded-radius-lg bg-surface border-[3px] border-outline p-0 shadow-level4 backdrop:bg-black/60",
        "open:animate-[fadeIn_120ms_ease-out]",
        className,
      )}
      aria-labelledby="modal-title"
    >
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <h2 id="modal-title" className="type-title-large text-on-surface">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="rounded-full p-2 text-on-surface-variant hover:bg-on-surface/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="px-6 pb-6">{children}</div>
    </dialog>
  );
}
