"use client";

import { useAuth } from "@/modules/identity/AuthProvider";

export default function AccountPage() {
  const { session, ready, openAuth } = useAuth();

  return (
    <div className="detail account-page">
      <h1>Profile</h1>
      {!ready ? (
        <div className="empty">Loading...</div>
      ) : !session ? (
        <div className="empty">
          Login to view your profile.
          <button type="button" className="primary" onClick={() => openAuth("login")}>
            Login
          </button>
        </div>
      ) : (
        <dl className="profile-list">
          <div>
            <dt>Username</dt>
            <dd>{session.user.username}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{session.user.phone ?? "—"}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{session.user.role}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
