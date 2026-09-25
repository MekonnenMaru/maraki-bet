"use client";

import { useEffect, useRef } from "react";
import type { AdminSyncProgressLogEntry } from "@maraki/shared";

export function SyncProgressConsole({
  entries,
  live = false,
}: {
  entries: AdminSyncProgressLogEntry[];
  live?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [entries.length, entries.at(-1)?.at]);

  return (
    <div className={`sync-console${live ? " live" : ""}`}>
      <div className="sync-console-bar">
        <span>task log</span>
        {live && <em>live</em>}
        <span>{entries.length} lines</span>
      </div>
      <div className="sync-console-scroll" ref={scroller}>
        {entries.length === 0 ? (
          <p className="sync-console-empty">Waiting for tasks…</p>
        ) : (
          entries.map((entry, index) => (
            <div key={`${entry.at}-${entry.cmd}-${index}`} className={`sync-console-line ${entry.level}`}>
              <time>{formatLogTime(entry.at)}</time>
              <span className="sync-console-prompt">$</span>
              <code>{entry.cmd}</code>
              <span className="sync-console-detail">{entry.detail}</span>
            </div>
          ))
        )}
        {live && <div className="sync-console-cursor" aria-hidden />}
      </div>
    </div>
  );
}

function formatLogTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Africa/Addis_Ababa",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}
