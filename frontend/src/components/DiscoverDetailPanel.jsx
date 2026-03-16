import axios from "axios";
import React, { useEffect, useMemo, useState } from "react";

const API_URL = process.env.REACT_APP_API_URL || "";
const API_BASE = API_URL.replace(/\/api\/?$/, "");

const toAttachmentUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};

const formatLastSeen = (value) => {
  if (!value) return "Offline";
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMin < 60) return `Last seen ${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `Last seen ${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `Last seen ${diffDay}d ago`;
};

export default function DiscoverDetailPanel({
  token,
  selection,
  rooms = [],
  following = [],
  pendingFollowIds = {},
  onBack = () => {},
  onFollowUser = async () => {},
  onUnfollowUser = async () => {},
  onStartChatUser = async () => {},
  onOpenRoomChat = async () => {},
  onJoinRoom = async () => {}
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);

  const api = useMemo(
    () => axios.create({ baseURL: API_URL, headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  const roomFromList = useMemo(
    () => rooms.find((room) => room._id === selection?.id),
    [rooms, selection?.id]
  );
  const followingIds = useMemo(
    () => new Set((following || []).map((entry) => entry.id || entry._id)),
    [following]
  );

  useEffect(() => {
    if (!confirmUnfollow) return undefined;
    const handle = setTimeout(() => setConfirmUnfollow(false), 4500);
    return () => clearTimeout(handle);
  }, [confirmUnfollow]);

  useEffect(() => {
    if (!selection?.id || !selection?.type) return;
    setConfirmUnfollow(false);
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        if (selection.type === "user") {
          const { data: response } = await api.get(`/users/profile/${selection.id}`);
          if (!mounted) return;
          setData({ type: "user", ...response });
        } else {
          const { data: response } = await api.get(`/chatrooms/${selection.id}/profile`);
          if (!mounted) return;
          setData({ type: "room", ...response });
        }
      } catch (err) {
        if (!mounted) return;
        setError(err?.response?.data?.message || "Unable to load details.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [api, selection?.id, selection?.type]);

  if (!selection) return null;

  if (loading) {
    return (
      <section className="discover-panel discover-detail-panel">
        <div className="discover-inline-card discover-profile-card glass">
          <p className="muted">Loading details...</p>
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="discover-panel discover-detail-panel">
        <div className="discover-inline-card discover-profile-card glass">
          <p className="error-text">{error || "Not found"}</p>
          <button type="button" className="discover-back-link" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
        </div>
      </section>
    );
  }

  if (data.type === "user") {
    const profile = data.user || {};
    const relationship = data.relationship || {};
    const stats = data.stats || { followers: 0, following: 0, rooms: 0 };
    const avatarUrl = toAttachmentUrl(profile.avatarUrl);
    const displayName = profile.displayName || profile.username;
    const isFollowing = relationship.isFollowing || followingIds.has(profile.id);
    const isRequested = relationship.hasPendingFollowRequest || Boolean(pendingFollowIds[profile.id]);
    const canFollow = !relationship.isSelf && !isFollowing && !isRequested;
    const canChat = !relationship.isSelf && (!profile.isPrivate || isFollowing);
    const showPrivateBanner = profile.isPrivate && !relationship.isSelf;
    const presenceLabel = profile.presenceStatus === "online" ? "Online" : formatLastSeen(profile.lastSeen);

    return (
      <section className="discover-panel discover-detail-panel">
        <div className="discover-inline-card discover-profile-card profile-card glass">
          <button type="button" className="discover-back-link profile-back-btn" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <div className="profile-avatar-lg" style={!avatarUrl ? { backgroundColor: profile.avatarColor || "rgba(255,255,255,0.14)" } : undefined}>
            {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : <span>{displayName?.slice(0, 2).toUpperCase()}</span>}
          </div>
          <h1>{displayName}</h1>
          <p className="profile-username">@{profile.username}</p>
          <p className={`profile-presence ${profile.presenceStatus === "online" ? "online" : ""}`}>{presenceLabel}</p>
          {showPrivateBanner ? <p className="profile-private-note">This user account is private</p> : null}
          {profile.canViewDetails && profile.bio ? <p className="profile-bio">{profile.bio}</p> : null}
          <div className="profile-stats">
            <div><strong>{stats.followers}</strong><span>Followers</span></div>
            <div><strong>{stats.following}</strong><span>Following</span></div>
            <div><strong>{stats.rooms}</strong><span>Rooms</span></div>
          </div>
          {!relationship.isSelf ? (
            <div className="profile-actions discover-profile-actions">
              <button
                type="button"
                className="discover-action-btn secondary"
                disabled={!canChat}
                onClick={() => {
                  if (!canChat) return;
                  onStartChatUser(profile.id);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Chat
              </button>
              <button type="button" className="discover-action-btn secondary" onClick={onBack}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.7 2.6a2 2 0 0 1-.4 2.1L8 9.9a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 2.1-.4c.8.4 1.7.6 2.6.7A2 2 0 0 1 22 16.9z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Call
              </button>
              <button
                type="button"
                className="discover-action-btn primary"
                onClick={async () => {
                  if (isFollowing) {
                    if (!confirmUnfollow) {
                      setConfirmUnfollow(true);
                      return;
                    }
                    await onUnfollowUser(profile.id);
                    setConfirmUnfollow(false);
                  } else {
                    await onFollowUser(profile.id);
                  }
                  const { data: response } = await api.get(`/users/profile/${selection.id}`);
                  setData({ type: "user", ...response });
                }}
                disabled={relationship.isSelf || isRequested}
              >
                {isFollowing ? (confirmUnfollow ? "Unfollow?" : "Following") : isRequested ? "Requested" : showPrivateBanner ? "Send Follow Request" : "Follow"}
              </button>
              {isFollowing && confirmUnfollow ? (
                <button
                  type="button"
                  className="discover-action-btn secondary"
                  onClick={() => setConfirmUnfollow(false)}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  const room = data.room || {};
  const avatarUrl = toAttachmentUrl(room.avatarUrl);
  const isMember = roomFromList?.members?.some((member) => (member._id || member.id) === room.id) || room.isMember;
  const actionLabel = isMember ? "Open Room" : data.joinRequestPending ? "Request Sent" : room.isPrivate ? "Send Join Request" : "Join Room";

  return (
    <section className="discover-panel discover-detail-panel">
      <div className="discover-inline-card discover-profile-card profile-card glass">
        <button type="button" className="discover-back-link profile-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <div className="profile-avatar-lg" style={!avatarUrl ? { backgroundColor: room.admin?.avatarColor || "rgba(255,255,255,0.14)" } : undefined}>
          {avatarUrl ? <img src={avatarUrl} alt={room.name} /> : <span>{room.name?.slice(0, 2).toUpperCase()}</span>}
        </div>
        <h1>{room.name}</h1>
        <p className="profile-username">Admin: @{room.admin?.username || "unknown"}</p>
        {room.description ? <p className="profile-bio">{room.description}</p> : null}
        <div className="profile-actions">
          <button
            type="button"
            className="discover-action-btn primary"
            disabled={data.joinRequestPending}
            onClick={async () => {
              if (isMember) {
                await onOpenRoomChat(room.id);
                return;
              }
              await onJoinRoom(room.id);
              const { data: response } = await api.get(`/chatrooms/${selection.id}/profile`);
              setData({ type: "room", ...response });
            }}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
