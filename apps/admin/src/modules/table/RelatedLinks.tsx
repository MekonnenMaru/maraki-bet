"use client";

import { SoftLink } from "@/modules/shell/NavPending";

export type RelatedLinkItem = {
  href: string;
  label: string;
  count?: number | null;
};

export function RelatedLinks({ items }: { items: RelatedLinkItem[] }) {
  return (
    <div className="related-links">
      {items.map((item) => (
        <SoftLink key={`${item.href}-${item.label}`} href={item.href} className="related-link" title={item.label}>
          {item.count != null ? <strong>{item.count.toLocaleString()}</strong> : null}
          <span>{item.label}</span>
        </SoftLink>
      ))}
    </div>
  );
}
