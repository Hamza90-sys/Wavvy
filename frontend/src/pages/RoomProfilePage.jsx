import axios from "axios";
import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import VerifiedBadge from "../components/VerifiedBadge";
import { isVerifiedUser } from "../constants/verifiedUsers";
import { useAuth } from "../context/AuthContext";

const API_URL = process.env.REACT_APP_API_URL || "";
const API_BASE = API_URL.replace(/\/api\/?$/, "");

const toAttachmentUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};

export default function RoomProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [room, setRoom] = useState(null);
  const [pending, setPending] = useState(false);

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
        const { data } = await api.get(`/chatrooms/${id}/profile`);
        if (!mounted) return;
        setRoom(data.room || null);
        setPending(Boolean(data.joinRequestPending));
      } catch (err) {
        if (!mounted) return;
        setError(err?.response?.data?.message || "Unable to load room profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [api, id]);

  const requestJoin = async () => {
    if (!room) return;
    try {
      const { data } = await api.post(`/chatrooms/${room.id}/join`);
      if (data.requested) {
        setPending(true);
        return;
      }
      if (data.room) {
        setRoom((prev) => ({ ...prev, isMember: true }));
      }
    } catch (err) {
      window.alert(err?.response?.data?.message || "Unable to send join request.");
    }
  };

  if (loading) {
    return (
      <main className="profile-shell">
        <div className="profile-card glass">
          <p className="muted">Loading room...</p>
        </div>
      </main>
    );
  }

  if (error || !room) {
    return (
      <main className="profile-shell">
        <div className="profile-card glass">
          <p className="error-text">{error || "Room not found."}</p>
          <Link to="/chat" className="ghost-btn">Back to Chat</Link>
        </div>
      </main>
    );
  }

  const avatarUrl = toAttachmentUrl(room.avatarUrl);
  const adminName = room.admin?.displayName || room.admin?.username || "Unknown";
  const actionLabel = room.isMember
    ? "Joined"
    : pending
      ? "Request Sent"
      : room.isPrivate
        ? "Send Join Request"
        : "Join Room";

  return (
    <main className="profile-shell">
      <section className="profile-card glass">
        <button type="button" className="ghost-btn profile-back-btn" onClick={() => navigate("/chat")}>
          Back
        </button>

        <div className="profile-avatar-lg" style={!avatarUrl ? { backgroundColor: room.admin?.avatarColor || "rgba(255,255,255,0.14)" } : undefined}>
          {avatarUrl ? <img src={avatarUrl} alt={room.name} /> : <span>{room.name.slice(0, 2).toUpperCase()}</span>}
        </div>

        <h1>{room.name}</h1>
        <p className="profile-username name-with-badge">
          Admin: @{room.admin?.username || "unknown"}
          {isVerifiedUser(room.admin) ? <VerifiedBadge /> : null}
        </p>
        <p className="muted">{adminName}</p>
        {room.description ? <p className="profile-bio">{room.description}</p> : null}

        <div className="profile-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={requestJoin}
            disabled={room.isMember || pending}
          >
            {actionLabel}
          </button>
          <button
            type="button"
            className="ghost-btn"
            disabled={!room.isMember}
            onClick={() => navigate(`/room/${room.id}/voice`)}
          >
            Join Voice Room
          </button>
        </div>
      </section>
    </main>
  );
}
