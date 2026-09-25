"use client";

export type FilterField = {
  key: string;
  label?: string;
  placeholder?: string;
  type?: "text" | "select";
  options?: Array<{ value: string; label: string }>;
  width?: string;
};

export function TableFiltersBar({
  fields,
  values,
  onChange,
  onSubmit,
  onReset,
  loading,
  actions,
}: {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onReset: () => void;
  loading?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <form className="table-toolbar" onSubmit={onSubmit}>
      <div className="table-filters">
        {fields.map((field) =>
          field.type === "select" ? (
            <label key={field.key} className="filter-field" style={field.width ? { minWidth: field.width } : undefined}>
              {field.label && <span>{field.label}</span>}
              <select value={values[field.key] ?? ""} onChange={(event) => onChange(field.key, event.target.value)}>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label key={field.key} className="filter-field" style={field.width ? { minWidth: field.width } : undefined}>
              {field.label && <span>{field.label}</span>}
              <input
                value={values[field.key] ?? ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                placeholder={field.placeholder}
              />
            </label>
          ),
        )}
      </div>
      <div className="table-toolbar-actions">
        <button type="submit" disabled={loading}>
          {loading ? "Loading…" : "Apply"}
        </button>
        <button type="button" className="ghost" onClick={onReset} disabled={loading}>
          Reset
        </button>
        {actions}
      </div>
    </form>
  );
}
