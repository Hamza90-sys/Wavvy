import axios from "axios";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";

const API_URL = process.env.REACT_APP_API_URL || "";
const TURN_URLS = (process.env.REACT_APP_TURN_URLS || "").split(",").map((entry) => entry.trim()).filter(Boolean);
const TURN_USERNAME = process.env.REACT_APP_TURN_USERNAME || "";
const TURN_CREDENTIAL = process.env.REACT_APP_TURN_CREDENTIAL || "";
const getIceServers = () => {
  const servers = [{ urls: "stun:stun.l.google.com:19302" }];
  if (TURN_URLS.length) {
    servers.push({
      urls: TURN_URLS,
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL
    });
  }
  return servers;
};
const API_BASE = API_URL.replace(/\/api\/?$/, "");

const toAttachmentUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};

const getInitials = (value = "") => value.trim().slice(0, 2).toUpperCase() || "VR";

export default function VoiceRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { socket, connected } = useSocket();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [participants, setParticipants] = useState([]);
  const [joined, setJoined] = useState(false);
  const [localMuted, setLocalMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);

  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const remoteAudioRef = useRef({});
  const pendingCandidatesRef = useRef({});
  const joinedRef = useRef(false);

  const api = useMemo(
    () => axios.create({ baseURL: API_URL, headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/chatrooms/${id}/profile`);
        if (!mounted) return;
        setRoom(data.room || null);
      } catch (err) {
        if (!mounted) return;
        setError(err?.response?.data?.message || "Unable to load voice room.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [api, id]);

  const attachRemoteStream = useCallback((userId, stream) => {
    let audio = remoteAudioRef.current[userId];
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.playsInline = true;
      remoteAudioRef.current[userId] = audio;
    }
    audio.muted = !speakerOn;
    audio.srcObject = stream;
    audio.play().catch(() => undefined);
  }, [speakerOn]);

  const closePeerConnection = useCallback((targetUserId) => {
    const peerConnection = peerConnectionsRef.current[targetUserId];
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
      delete peerConnectionsRef.current[targetUserId];
    }
    const audio = remoteAudioRef.current[targetUserId];
    if (audio) {
      audio.srcObject = null;
      delete remoteAudioRef.current[targetUserId];
    }
    delete pendingCandidatesRef.current[targetUserId];
  }, []);

  const ensurePeerConnection = useCallback((targetUserId) => {
    if (peerConnectionsRef.current[targetUserId]) {
      return peerConnectionsRef.current[targetUserId];
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: getIceServers()
    });

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !socket) return;
      socket.emit("voice:ice-candidate", {
        roomId: id,
        targetUserId,
        candidate: event.candidate
      });
    };

    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        attachRemoteStream(targetUserId, remoteStream);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      if (["closed", "failed", "disconnected"].includes(peerConnection.connectionState)) {
        closePeerConnection(targetUserId);
      }
    };

    const localTrack = localStreamRef.current?.getAudioTracks?.()[0];
    if (localTrack) {
      peerConnection.addTrack(localTrack, localStreamRef.current);
    }

    peerConnectionsRef.current[targetUserId] = peerConnection;
    return peerConnection;
  }, [attachRemoteStream, closePeerConnection, id, socket]);

  const leaveVoiceRoom = useCallback(() => {
    if (joinedRef.current) {
      socket?.emit("voice:leave", { roomId: id });
    }
    joinedRef.current = false;
    setJoined(false);
    Object.keys(peerConnectionsRef.current).forEach((targetUserId) => closePeerConnection(targetUserId));
    localStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    localStreamRef.current = null;
    setParticipants([]);
  }, [closePeerConnection, id, socket]);

  const joinVoiceRoom = useCallback(async () => {
    if (!socket || !room?.isMember || joinedRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const audioTrack = stream.getAudioTracks?.()[0];
      if (audioTrack) {
        audioTrack.enabled = true;
      }
      socket.emit("voice:join", { roomId: id });
      joinedRef.current = true;
      setJoined(true);
      setError("");
    } catch (_error) {
      setError("Microphone access is required to join the voice room.");
    }
  }, [id, room?.isMember, socket]);

  useEffect(() => {
    if (!room?.isMember || !socket || !connected) return;
    joinVoiceRoom().catch(() => undefined);
    return () => leaveVoiceRoom();
  }, [connected, joinVoiceRoom, leaveVoiceRoom, room?.isMember, socket]);

  useEffect(() => {
    Object.values(remoteAudioRef.current).forEach((audio) => {
      audio.muted = !speakerOn;
    });
  }, [speakerOn]);

  useEffect(() => {
    const audioTrack = localStreamRef.current?.getAudioTracks?.()[0];
    if (audioTrack) {
      audioTrack.enabled = !localMuted;
    }
    if (joinedRef.current) {
      socket?.emit("voice:mute", { roomId: id, muted: localMuted });
    }
  }, [id, localMuted, socket]);

  useEffect(() => {
    if (!socket) return undefined;

    const onParticipants = ({ roomId, participants: nextParticipants }) => {
      if (roomId !== id) return;
      setParticipants(nextParticipants || []);
    };

    const onUserJoined = async ({ roomId, participant }) => {
      if (roomId !== id || participant.userId === user?.id || !joinedRef.current) return;
      const peerConnection = ensurePeerConnection(participant.userId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("voice:offer", {
        roomId,
        targetUserId: participant.userId,
        offer
      });
    };

    const onUserLeft = ({ roomId, userId }) => {
      if (roomId !== id) return;
      closePeerConnection(userId);
      setParticipants((prev) => prev.filter((participant) => participant.userId !== userId));
    };

    const onVoiceOffer = async ({ roomId, offer, fromUserId }) => {
      if (roomId !== id || fromUserId === user?.id || !joinedRef.current) return;
      const peerConnection = ensurePeerConnection(fromUserId);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      const pendingCandidates = pendingCandidatesRef.current[fromUserId] || [];
      while (pendingCandidates.length) {
        const candidate = pendingCandidates.shift();
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("voice:answer", {
        roomId,
        targetUserId: fromUserId,
        answer
      });
    };

    const onVoiceAnswer = async ({ roomId, answer, fromUserId }) => {
      if (roomId !== id) return;
      const peerConnection = peerConnectionsRef.current[fromUserId];
      if (!peerConnection) return;
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

      const pendingCandidates = pendingCandidatesRef.current[fromUserId] || [];
      while (pendingCandidates.length) {
        const candidate = pendingCandidates.shift();
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const onVoiceIceCandidate = async ({ roomId, candidate, fromUserId }) => {
      if (roomId !== id) return;
      const peerConnection = peerConnectionsRef.current[fromUserId];
      if (!peerConnection || !peerConnection.remoteDescription) {
        pendingCandidatesRef.current[fromUserId] = [
          ...(pendingCandidatesRef.current[fromUserId] || []),
          candidate
        ];
        return;
      }
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    };

    socket.on("voice:participants", onParticipants);
    socket.on("voice:user-joined", onUserJoined);
    socket.on("voice:user-left", onUserLeft);
    socket.on("voice:offer", onVoiceOffer);
    socket.on("voice:answer", onVoiceAnswer);
    socket.on("voice:ice-candidate", onVoiceIceCandidate);

    return () => {
      socket.off("voice:participants", onParticipants);
      socket.off("voice:user-joined", onUserJoined);
      socket.off("voice:user-left", onUserLeft);
      socket.off("voice:offer", onVoiceOffer);
      socket.off("voice:answer", onVoiceAnswer);
      socket.off("voice:ice-candidate", onVoiceIceCandidate);
    };
  }, [closePeerConnection, ensurePeerConnection, id, socket, user?.id]);

  if (loading) {
    return (
      <main className="profile-shell">
        <div className="profile-card glass">
          <p className="muted">Loading voice room...</p>
        </div>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="profile-shell">
        <div className="profile-card glass">
          <p className="error-text">{error}</p>
          <button type="button" className="ghost-btn" onClick={() => navigate(`/room/${id}`)}>
            Back to Room
          </button>
        </div>
      </main>
    );
  }

  if (!room) {
    return null;
  }

  const visibleParticipants = participants.length
    ? participants
    : [{
        userId: user?.id,
        username: user?.username,
        displayName: user?.displayName || user?.username,
        avatarUrl: user?.avatarUrl || "",
        avatarColor: user?.avatarColor || "",
        muted: localMuted
      }];

  return (
    <main className="voice-room-shell">
      <section className="voice-room-card glass">
        <button type="button" className="ghost-btn profile-back-btn" onClick={() => navigate(`/room/${id}`)}>
          Back
        </button>

        <header className="voice-room-head">
          <p className="eyebrow">Voice Room</p>
          <h1>{room.name}</h1>
          <p className="voice-room-subtitle">
            {connected ? (joined ? "Live audio connected" : "Joining voice room...") : "Reconnecting to voice room..."}
          </p>
          {error ? <p className="error-text">{error}</p> : null}
        </header>

        <div className="voice-room-grid">
          {visibleParticipants.map((participant) => {
            const avatarUrl = toAttachmentUrl(participant.avatarUrl);
            const label = participant.displayName || participant.username || "Member";
            const isSelf = participant.userId === user?.id;
            const isMuted = isSelf ? localMuted : participant.muted;
            return (
              <article key={participant.userId} className="voice-member-card">
                <div
                  className="voice-member-avatar"
                  style={!avatarUrl ? { backgroundColor: participant.avatarColor || "rgba(255,255,255,0.12)" } : undefined}
                >
                  {avatarUrl ? <img src={avatarUrl} alt={label} /> : <span>{getInitials(label)}</span>}
                </div>
                <strong>{label}</strong>
                <span className="voice-member-tag">{isSelf ? "You" : `@${participant.username}`}</span>
                <span className={`voice-member-mic ${isMuted ? "muted" : ""}`}>{isMuted ? "Mic Off" : "Mic On"}</span>
              </article>
            );
          })}
        </div>

        <div className="voice-room-controls">
          <button
            type="button"
            className={localMuted ? "ghost-btn" : "primary-btn"}
            onClick={() => setLocalMuted((prev) => !prev)}
          >
            {localMuted ? "Unmute Mic" : "Mute Mic"}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setSpeakerOn((prev) => !prev)}
          >
            {speakerOn ? "Speaker On" : "Speaker Off"}
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={() => {
              leaveVoiceRoom();
              navigate(`/room/${id}`);
            }}
          >
            Leave Voice Room
          </button>
        </div>
      </section>
    </main>
  );
}
