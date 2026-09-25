"use client";

import { UsersDirectory } from "@/modules/users/UsersDirectory";

export default function StaffPage() {
  // readOnly blocks suspend/credit; delete stays available for other admins.
  return <UsersDirectory title="Admins" role="ADMIN" readOnly />;
}
