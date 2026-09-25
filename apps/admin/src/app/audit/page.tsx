import { ComingSoon } from "@/modules/ui/ComingSoon";

export default function AuditPage() {
  return (
    <ComingSoon
      title="Audit logs"
      note="Staff actions (void, credit, suspend) will be written to an audit trail here. Wallet ledger already records money movement."
    />
  );
}
