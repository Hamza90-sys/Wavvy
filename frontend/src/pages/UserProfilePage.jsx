import axios from "axios";
import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";

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
  if (diffMin < 60) return `Last seen ${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `Last seen ${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `Last seen ${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
};

export default function UserProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { socket } = useSocket();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ followers: 0, following: 0, rooms: 0 });
  const [relationship, setRelationship] = useState({
    isSelf: false,
    isFollowing: false,
    hasPendingFollowRequest: false
  });

  const api = useMemo(
    () => axios.create({ baseURL: API_URL, headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/users/profile/${id}`);
        if (!mounted) return;
        setProfile(data.user || null);
        setStats(data.stats || { followers: 0, following: 0, rooms: 0 });
        setRelationship(data.relationship || { isSelf: false, isFollowing: false, hasPendingFollowRequest: false });
      } catch (err) {
        if (!mounted) return;
        setError(err?.response?.data?.message || "Unable to load user profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [api, id]);

  React.useEffect(() => {
    if (!socket) return undefined;
    const onPresenceUpdate = (payload) => {
      if (payload.userId !== id) return;
      setProfile((prev) => (prev ? { ...prev, presenceStatus: payload.presenceStatus, lastSeen: payload.lastSeen || null } : prev));
    };
    socket.on("presence:update", onPresenceUpdate);
    return () => socket.off("presence:update", onPresenceUpdate);
  }, [id, socket]);

  const sendFollowRequest = async () => {
    if (!profile) return;
    try {
      const { data } = await api.post(`/users/follow/${profile.id}`);
      if (data.alreadyFollowing) {
        setRelationship((prev) => ({ ...prev, isFollowing: true, hasPendingFollowRequest: false }));
      } else if (data.following) {
        setRelationship((prev) => ({ ...prev, isFollowing: true, hasPendingFollowRequest: false }));
      } else if (data.requested) {
        setRelationship((prev) => ({ ...prev, hasPendingFollowRequest: true }));
      }
    } catch (err) {
      window.alert(err?.response?.data?.message || "Unable to send follow request.");
    }
  };

  if (loading) {
    return (
      <main className="profile-shell">
        <div className="profile-card glass">
          <p className="muted">Loading profile...</p>
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="profile-shell">
        <div className="profile-card glass">
          <p className="error-text">{error || "Profile not found."}</p>
          <Link to="/chat" className="ghost-btn">Back to Chat</Link>
        </div>
      </main>
    );
  }

  const avatarUrl = toAttachmentUrl(profile.avatarUrl);
  const displayName = profile.displayName || profile.username;
  const showPrivateBanner = profile.isPrivate && !relationship.isSelf;
  const canFollow = !relationship.isSelf && !relationship.isFollowing && !relationship.hasPendingFollowRequest;
  const presenceLabel = profile.presenceStatus === "online" ? "Online" : formatLastSeen(profile.lastSeen);

  return (
    <main className="profile-shell">
      <section className="profile-card glass">
        <button type="button" className="ghost-btn profile-back-btn" onClick={() => navigate("/chat")}>
          Back
        </button>

        <div className="profile-avatar-lg" style={!avatarUrl ? { backgroundColor: profile.avatarColor || "rgba(255,255,255,0.14)" } : undefined}>
          {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : <span>{displayName.slice(0, 2).toUpperCase()}</span>}
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

        <div className="profile-actions">
          <button type="button" className="ghost-btn" onClick={() => navigate("/chat")} title="Send message">
            Message
          </button>
          <button type="button" className="ghost-btn" onClick={() => navigate("/chat")} title="Call">
            Call
          </button>
          {!relationship.isSelf ? (
            <button
              type="button"
              className="primary-btn"
              onClick={sendFollowRequest}
              disabled={!canFollow}
            >
              {relationship.isFollowing
                ? "Following"
                : relationship.hasPendingFollowRequest
                  ? "Requested"
                  : showPrivateBanner
                    ? "Send Follow Request"
                    : "Follow"}
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
