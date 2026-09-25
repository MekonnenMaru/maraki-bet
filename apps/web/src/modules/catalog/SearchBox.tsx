"use client";

import { useSlip } from "@/modules/slip/SlipProvider";

export function SearchBox() {
  const { query, setQuery } = useSlip();
  return (
    <div className="search-wrap">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Games..." />
      <span className="search-ico" aria-hidden="true">
        ⌕
      </span>
    </div>
  );
}
