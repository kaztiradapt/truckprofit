"use client";

/* eslint-disable @next/next/no-img-element -- private signed receipt URLs are rendered at their original resolution */

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

type ReceiptViewerButtonProps = {
  expenseId: string;
  filename?: string | null;
  contentType?: string | null;
};

export function ReceiptViewerButton({ expenseId, filename, contentType }: ReceiptViewerButtonProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const receiptUrl = `/api/expenses/${expenseId}/receipt`;
  const isImage = contentType?.startsWith("image/")
    || /\.(?:avif|gif|heic|heif|jpe?g|png|webp)$/i.test(filename ?? "");

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <>
    <button type="button" className="expense-receipt-link" onClick={() => setOpen(true)}>Посмотреть чек</button>
    {open ? createPortal(<div className="receipt-viewer-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section className="receipt-viewer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <div><small>Документ к расходу</small><h2 id={titleId}>{filename || "Чек"}</h2></div>
          <button type="button" className="receipt-viewer-close" aria-label="Закрыть просмотр чека" onClick={() => setOpen(false)} autoFocus>×</button>
        </header>
        <div className={`receipt-viewer-content${isImage ? " image" : " document"}`}>
          {isImage
            ? <img src={receiptUrl} alt={filename ? `Чек ${filename}` : "Чек к расходу"} />
            : <iframe src={receiptUrl} title={filename ? `Чек ${filename}` : "Чек к расходу"} />}
        </div>
        <footer>
          <p>{isImage ? "Изображение можно увеличить жестом внутри Mini App." : "Если документ не отобразился, откройте оригинал отдельной кнопкой."}</p>
          <div>
            <a className="tiny-button" href={receiptUrl} target="_blank" rel="noreferrer">Открыть оригинал</a>
            <button type="button" className="primary-button" onClick={() => setOpen(false)}>Закрыть</button>
          </div>
        </footer>
      </section>
    </div>, document.body) : null}
  </>;
}
