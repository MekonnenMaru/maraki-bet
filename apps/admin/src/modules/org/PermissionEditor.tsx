"use client";

import type { OrgPermissionMap } from "@maraki/shared";

export function PermissionEditor({
  keys,
  value,
  onChange,
  readOnly,
}: {
  keys: readonly string[];
  value: OrgPermissionMap;
  onChange?: (next: OrgPermissionMap) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="permission-grid">
      {keys.map((key) => (
        <label key={key} className="permission-item">
          <input
            type="checkbox"
            checked={value[key] === true}
            disabled={readOnly || !onChange}
            onChange={(event) => onChange?.({ ...value, [key]: event.target.checked })}
          />
          <span>{key}</span>
        </label>
      ))}
    </div>
  );
}
