import React from "react";

const API_URL = process.env.REACT_APP_API_URL || "";
const API_BASE = API_URL.replace(/\/api\/?$/, "");

const toAttachmentUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};

const formatRelativeTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.max(1, Math.floor(diffMs / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
};

const canAct = (item) =>
  !item.isRead && (item.type === "FOLLOW_REQUEST" || item.type === "JOIN_ROOM_REQUEST");

export default function NotificationsPanel({
  notifications = [],
  loading = false,
  onAccept = () => {},
  onDecline = () => {}
}) {
  return (
    <section className="notifications-panel glass" aria-label="Notifications">
      <header className="notifications-head">
        <h3>Notifications</h3>
      </header>
      <div className="notifications-list">
        {loading ? <p className="muted">Loading notifications...</p> : null}
        {!loading && notifications.length === 0 ? <p className="muted">No notifications yet.</p> : null}
        {!loading
          ? notifications.map((item) => {
              const senderName = item.sender?.displayName || item.sender?.username || "User";
              const avatarUrl = toAttachmentUrl(item.sender?.avatarUrl || "");
              return (
                <article
                  key={item.id}
                  className={`notification-card ${item.isRead ? "read" : "unread"}`}
                >
                  <span className="notification-avatar">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={senderName} />
                    ) : (
                      <span>{senderName.slice(0, 2).toUpperCase()}</span>
                    )}
                  </span>
                  <div className="notification-copy">
                    <strong>{senderName}</strong>
                    <p>{item.message}</p>
                    <small>{formatRelativeTime(item.createdAt)}</small>
                    {canAct(item) ? (
                      <div className="notification-actions">
                        <button type="button" className="primary-btn" onClick={() => onAccept(item.id)}>
                          Accept
                        </button>
                        <button type="button" className="ghost-btn" onClick={() => onDecline(item.id)}>
                          Decline
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          : null}
      </div>
    </section>
  );
}
