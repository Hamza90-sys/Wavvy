import React, { useEffect, useMemo, useRef, useState } from "react";
import MessageForm from "./MessageForm";
import VerifiedBadge from "./VerifiedBadge";
import { isVerifiedUser } from "../constants/verifiedUsers";

const formatTime = (dateString) => new Date(dateString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const reactionChoices = [
  String.fromCodePoint(0x1F44D),
  String.fromCodePoint(0x2764, 0xFE0F),
  String.fromCodePoint(0x1F602),
  String.fromCodePoint(0x1F525),
  String.fromCodePoint(0x1F62E)
];

const API_URL = process.env.REACT_APP_API_URL || "";
const API_BASE = API_URL.replace(/\/api\/?$/, "");

const toAttachmentUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};
const getDirectNickname = (currentUserId, otherUserId) => {
  if (!currentUserId || !otherUserId) return "";
  try {
    return localStorage.getItem(`wavvy_dm_nickname:${currentUserId}:${otherUserId}`) || "";
  } catch (_error) {
    return "";
  }
};

const isImage = (mimeType = "") => mimeType.startsWith("image/");
const isAudio = (mimeType = "") => mimeType.startsWith("audio/");
const VOICE_WAVE_BARS = 24;
const roomTypeLabel = (_roomType) => "";
const formatAudioTime = (value = 0) => {
  const safe = Math.max(0, Math.floor(Number(value) || 0));
  const mm = Math.floor(safe / 60);
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

export default function ChatInterface({
  activeRoom,
  messages,
  roomUsers = [],
  typingUsers = [],
  currentUser,
  onSendMessage,
  onTypingStart,
  onTypingStop,
  onToggleReaction,
  onDeleteMessage,
  onEditMessage,
  onLeaveRoom,
  onOpenRoomSettings,
  onStartAudioCall,
  onStartVideoCall,
  onEndCall,
  onToggleMic,
  onToggleCamera,
  callState,
  callControls,
  localVideoRef,
  remoteVideoRef
}) {
  const [activeReactionPickerId, setActiveReactionPickerId] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [draftInjection, setDraftInjection] = useState(null);
  const [activeAudioId, setActiveAudioId] = useState("");
  const [audioUiById, setAudioUiById] = useState({});
  const [nicknameTick, setNicknameTick] = useState(0);
  const messageListRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const audioRefs = useRef({});

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    const messageCount = messages.length;
    const hadNewMessages = messageCount > prevMessageCountRef.current;
    prevMessageCountRef.current = messageCount;
    if (hadNewMessages || messageCount === 0) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages.length]);

  useEffect(() => {
    prevMessageCountRef.current = 0;
    const el = messageListRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [activeRoom?._id]);

  useEffect(() => {
    // Editing state is room-scoped; clear it when switching conversations.
    setEditingMessage(null);
    setDraftInjection(null);
    setActiveMenuId(null);
    setActiveReactionPickerId(null);
  }, [activeRoom?._id]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!event.target.closest(".msg-tools")) {
        setActiveReactionPickerId(null);
        setActiveMenuId(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    const handler = () => setNicknameTick((tick) => tick + 1);
    window.addEventListener("wavvy:nickname-change", handler);
    return () => window.removeEventListener("wavvy:nickname-change", handler);
  }, []);

  const canDeleteMessage = useMemo(
    () =>
      (message) => {
        const userId = message.user?._id || message.user?.id;
        return userId === currentUser?.id;
      },
    [currentUser]
  );

  const groupedMessages = useMemo(() => {
    const groups = [];
    messages.forEach((message) => {
      if (message.system) {
        groups.push({ type: "system", messages: [message] });
        return;
      }
      const userId = message.user?._id || message.user?.id || "unknown";
      const last = groups[groups.length - 1];
      if (last && last.type === "user" && last.userId === userId) {
        last.messages.push(message);
      } else {
        groups.push({ type: "user", userId, user: message.user, messages: [message] });
      }
    });
    return groups;
  }, [messages]);

  const presenceByUserId = useMemo(
    () =>
      roomUsers.reduce((acc, member) => {
        acc[member.id] = member;
        return acc;
      }, {}),
    [roomUsers]
  );

  const typingLabel = useMemo(() => {
    if (!typingUsers.length) return "";
    if (typingUsers.length === 1) return `${typingUsers[0].username} is typing...`;
    if (typingUsers.length === 2) return `${typingUsers[0].username} and ${typingUsers[1].username} are typing...`;
    return `${typingUsers[0].username} and ${typingUsers.length - 1} others are typing...`;
  }, [typingUsers]);

  const buildAudioId = (messageId, file) => `${messageId}:${file.url}`;

  const updateAudioUi = (audioId, patch) => {
    setAudioUiById((prev) => ({
      ...prev,
      [audioId]: {
        ...(prev[audioId] || { currentTime: 0, duration: 0, progress: 0, playing: false }),
        ...patch
      }
    }));
  };

  const bindAudioNode = (audioId, node) => {
    if (!node) {
      delete audioRefs.current[audioId];
      return;
    }

    audioRefs.current[audioId] = node;
    if (node.dataset.voiceBound === "1") return;
    node.dataset.voiceBound = "1";

    const onLoadedMetadata = () => {
      const duration = Number.isFinite(node.duration) ? node.duration : 0;
      updateAudioUi(audioId, { duration, progress: node.currentTime && duration ? (node.currentTime / duration) * 100 : 0 });
    };
    const onTimeUpdate = () => {
      const duration = Number.isFinite(node.duration) ? node.duration : 0;
      updateAudioUi(audioId, {
        currentTime: node.currentTime || 0,
        duration,
        progress: duration > 0 ? ((node.currentTime || 0) / duration) * 100 : 0
      });
    };
    const onEnded = () => {
      setActiveAudioId((prev) => (prev === audioId ? "" : prev));
      updateAudioUi(audioId, { playing: false, currentTime: 0, progress: 0 });
      node.currentTime = 0;
    };
    const onPlay = () => {
      updateAudioUi(audioId, { playing: true });
    };
    const onPause = () => {
      updateAudioUi(audioId, { playing: false });
    };

    node.addEventListener("loadedmetadata", onLoadedMetadata);
    node.addEventListener("timeupdate", onTimeUpdate);
    node.addEventListener("ended", onEnded);
    node.addEventListener("play", onPlay);
    node.addEventListener("pause", onPause);
  };

  const toggleAudioPlayback = async (audioId) => {
    const audio = audioRefs.current[audioId];
    if (!audio) return;

    if (activeAudioId && activeAudioId !== audioId) {
      const prevAudio = audioRefs.current[activeAudioId];
      if (prevAudio) prevAudio.pause();
    }

    if (!audio.paused) {
      audio.pause();
      setActiveAudioId((prev) => (prev === audioId ? "" : prev));
      return;
    }

    try {
      await audio.play();
      setActiveAudioId(audioId);
    } catch (_error) {
      updateAudioUi(audioId, { playing: false });
    }
  };

  const seekAudio = (audioId, progressValue) => {
    const audio = audioRefs.current[audioId];
    if (!audio || !audio.duration) return;
    const nextTime = (Number(progressValue) / 100) * audio.duration;
    audio.currentTime = nextTime;
  };

  const isDirectChat = Boolean(activeRoom?.isPrivate) && (activeRoom.members?.length === 2 || roomUsers.length === 2);
  const otherMember = isDirectChat
    ? roomUsers.find((member) => (member.id || member._id) !== currentUser?.id)
    : null;
  const storedNickname = useMemo(() => {
    if (!isDirectChat) return "";
    void nicknameTick;
    return getDirectNickname(currentUser?.id, otherMember?.id || otherMember?._id);
  }, [isDirectChat, currentUser?.id, otherMember?.id, otherMember?._id, nicknameTick]);
  const displayName = isDirectChat
    ? (storedNickname || otherMember?.displayName || otherMember?.username || "Direct chat")
    : (activeRoom?.name || "");
  const initials = displayName?.slice(0, 2).toUpperCase() || "RM";
  const memberCount = activeRoom?.members?.length || roomUsers.length || 0;
  const roomAvatarUrl = toAttachmentUrl(isDirectChat ? otherMember?.avatarUrl : activeRoom?.avatarUrl);
  const isVoiceRoom = false;

  const voiceMembers = useMemo(() => {
    const base = roomUsers?.length
      ? roomUsers
      : (activeRoom?.members || []).map((member) => ({
        id: member._id || member.id,
        username: member.username,
        displayName: member.displayName || member.username,
        avatarColor: member.avatarColor,
        avatarUrl: member.avatarUrl,
        presenceStatus: member.presenceStatus || (member.online ? "online" : "offline"),
        online: Boolean(member.online)
      }));

    const map = new Map();
    base.forEach((member) => {
      if (!member?.id) return;
      map.set(member.id, member);
    });
    if (currentUser?.id && !map.has(currentUser.id)) {
      map.set(currentUser.id, {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName || currentUser.username,
        avatarColor: currentUser.avatarColor,
        avatarUrl: currentUser.avatarUrl,
        presenceStatus: "online",
        online: true
      });
    }
    return Array.from(map.values());
  }, [roomUsers, activeRoom?.members, currentUser]);

  const voiceOnline = useMemo(
    () => voiceMembers.filter((member) => member.presenceStatus === "online" || member.online),
    [voiceMembers]
  );
  const voiceSpeakers = useMemo(() => voiceOnline.slice(0, 3), [voiceOnline]);
  const voiceListeners = useMemo(
    () => voiceMembers.filter((member) => !voiceSpeakers.some((speaker) => speaker.id === member.id)),
    [voiceMembers, voiceSpeakers]
  );

  if (!activeRoom) {
    return (
      <section className="chat-interface glass empty-chat">
        <h3>Select a room to start chatting</h3>
        <p>Join a room from the left panel or create a new one.</p>
      </section>
    );
  }

  const handleLaunchCall = (type) => {
    if (!activeRoom) return;
    const url = new URL("/chat", window.location.origin);
    url.searchParams.set("callRoom", activeRoom._id);
    url.searchParams.set("callType", type);
    url.searchParams.set("callOnly", "1");
    window.open(url.toString(), "_blank", "noopener");
  };

  const voiceChatContent = (
    <>
      {callState?.incoming ? (
        <div className="call-banner">
          <span>{callState.incoming.fromName} is calling ({callState.incoming.callType === "video" ? "video" : "audio"})</span>
          <div className="call-banner-actions">
            <button type="button" className="primary-btn" onClick={callState.onAcceptIncoming}>Accept</button>
            <button type="button" className="danger-btn" onClick={callState.onRejectIncoming}>Reject</button>
          </div>
        </div>
      ) : null}

      {callState?.inCall || callState?.connecting ? (
        <div className="call-panel pro-call">
          <div className="call-header-row">
            <div className="call-meta">
              <span className={callState.connecting ? "call-chip waiting" : "call-chip live"}>
                {callState.connecting ? (callState.awaitingPeer ? "Waiting" : "Connecting") : "Live"}
              </span>
              <span className="call-type">{callState.callType === "video" ? "Video call" : "Voice call"}</span>
              <span className="call-room-name">{activeRoom?.name}</span>
            </div>
            <div className="call-presence">
              <span className="pulse-dot" aria-hidden="true" />
              {callState.connecting ? (callState.awaitingPeer ? "Waiting for participant" : "Preparing media") : "Connected"}
            </div>
          </div>

          {callState.callType === "video" ? (
            <div className="call-stage">
              <div className="video-frame remote-frame">
                <video ref={remoteVideoRef} autoPlay playsInline className="call-video remote" />
                <div className="video-label">Remote</div>
              </div>
              <div className="video-frame local-frame">
                <video ref={localVideoRef} autoPlay playsInline muted className="call-video local" />
                <div className="video-label">{callControls?.cameraOff ? "Camera off" : "You"}</div>
              </div>
            </div>
          ) : (
            <div className="call-audio-card">
              <div className="audio-visualizer" aria-hidden="true">
                <span /><span /><span /><span /><span />
              </div>
              <div className="audio-text">Voice channel active - crystal clear</div>
              <audio ref={remoteVideoRef} autoPlay style={{ display: "none" }} />
            </div>
          )}

          <div className="call-controls">
            <button
              type="button"
              className={callControls?.micMuted ? "call-ctl-btn muted" : "call-ctl-btn"}
              onClick={onToggleMic}
              aria-label={callControls?.micMuted ? "Unmute microphone" : "Mute microphone"}
              title={callControls?.micMuted ? "Unmute" : "Mute"}
            >
              {callControls?.micMuted ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12" /><line x1="17" y1="9" x2="17" y2="13" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" /><line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M19 11a7 7 0 0 1-14 0" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              )}
              <span>{callControls?.micMuted ? "Unmute" : "Mute"}</span>
            </button>

            {callState.callType === "video" ? (
              <button
                type="button"
                className={callControls?.cameraOff ? "call-ctl-btn muted" : "call-ctl-btn"}
                onClick={onToggleCamera}
                aria-label={callControls?.cameraOff ? "Turn camera on" : "Turn camera off"}
                title={callControls?.cameraOff ? "Camera on" : "Camera off"}
              >
                {callControls?.cameraOff ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M16 16.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3" /><path d="M17 13.5V9a2 2 0 0 0-2-2h-1" /><path d="m22 15-5-5v10z" /><line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="5" width="13" height="14" rx="2" ry="2" /><polygon points="16 7 22 5 22 19 16 17 16 7" />
                  </svg>
                )}
                <span>{callControls?.cameraOff ? "Camera off" : "Camera on"}</span>
              </button>
            ) : null}

            <button type="button" className="call-ctl-btn end" onClick={onEndCall}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v-3a2 2 0 0 0-2-2h-1.2a17.9 17.9 0 0 0-11.6 0H5a2 2 0 0 0-2 2v3" />
                <path d="M7 16.5v3" /><path d="M17 16.5v3" />
              </svg>
              <span>End</span>
            </button>
          </div>
        </div>
      ) : null}

      <div className="message-list" ref={messageListRef}>
        {groupedMessages.map((group, groupIndex) => {
          if (group.type === "system") {
            const sysMessage = group.messages[0];
            return (
              <div className="system-message" key={sysMessage._id || sysMessage.createdAt + sysMessage.content + groupIndex}>
                <span>{sysMessage.content}</span>
                <small>{formatTime(sysMessage.createdAt)}</small>
              </div>
            );
          }

          const isOwnGroup = group.userId === currentUser?.id;
          const avatarUrl = toAttachmentUrl(group.user?.avatarUrl);
          const avatarInitials = (group.user?.displayName || group.user?.username || "?").trim().slice(0, 2).toUpperCase();
          const avatarNode = avatarUrl ? <img src={avatarUrl} alt={group.user?.username || "user"} /> : <span>{avatarInitials}</span>;

          return (
            <div key={group.messages[0]._id || group.messages[0].createdAt + groupIndex} className={`msg-group ${isOwnGroup ? "own" : ""}`}>
              {group.messages.map((message, index) => {
                const messageId = message._id || `${message.createdAt}-${message.content}-${index}`;
                const showAvatar = index === 0;
                const showMeta = index === 0;
                const messageUserName = message.user?.username || group.user?.username || "Unknown";
                const messageUserId = message.user?._id || message.user?.id || group.userId;
                const memberPresence = presenceByUserId[messageUserId];
                const isOnline = memberPresence?.presenceStatus === "online" || memberPresence?.online;
                const audioAttachments = (message.attachments || []).filter((file) => isAudio(file.mimeType));
                const hasOnlyAudio = !message.content && audioAttachments.length > 0 && audioAttachments.length === (message.attachments || []).length;

                return (
                  <div key={messageId} className="msg-row">
                    {!isOwnGroup ? (
                      <div className="msg-avatar-area">
                        {showAvatar ? (
                          <div className="msg-avatar-wrap">
                            <div className="msg-avatar">{avatarNode}</div>
                            <span className={isOnline ? "msg-presence-dot online" : "msg-presence-dot offline"} />
                          </div>
                        ) : (
                          <div className="msg-avatar-spacer" />
                        )}
                      </div>
                    ) : null}

                    <div className="msg-main">
                      <div className={`msg-bubble-row ${isOwnGroup ? "own" : ""}`}>
                        <article className={`msg ${isOwnGroup ? "own" : ""}${hasOnlyAudio ? " voice-only" : ""}`}>
                          {!hasOnlyAudio ? (
                            <div className={`msg-meta${showMeta ? "" : " subtle"}`}>
                              {showMeta ? (
                                <strong className="name-with-badge">
                                  {messageUserName}
                                  {isVerifiedUser(message.user || group.user) ? <VerifiedBadge /> : null}
                                </strong>
                              ) : null}
                              <small>
                                {formatTime(message.createdAt)}
                                {message.isEdited ? <span className="msg-edited-tag"> (edited)</span> : null}
                              </small>
                            </div>
                          ) : null}

                          {message.content ? <p>{message.content}</p> : null}

                          {message.attachments?.length ? (
                            <div className="msg-attachments">
                              {message.attachments.map((file) => (
                                isAudio(file.mimeType) ? (
                                  <div key={`${file.url}-${file.fileName}`} className="voice-message-card">
                                    {(() => {
                                      const audioId = buildAudioId(messageId, file);
                                      return (
                                        <>
                                          <audio
                                            ref={(node) => bindAudioNode(audioId, node)}
                                            src={toAttachmentUrl(file.url)}
                                            preload="metadata"
                                          />
                                          <div className="voice-message-controls compact">
                                            <button
                                              type="button"
                                              className="voice-play-btn"
                                              onClick={() => toggleAudioPlayback(audioId)}
                                              aria-label={audioUiById[audioId]?.playing ? "Pause voice message" : "Play voice message"}
                                            >
                                              {audioUiById[audioId]?.playing ? (
                                                <span className="voice-icon-pause" aria-hidden="true" />
                                              ) : (
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                                  <path d="M8 5v14l11-7z" />
                                                </svg>
                                              )}
                                            </button>
                                            <div className="voice-waveform" aria-hidden="true">
                                              {Array.from({ length: VOICE_WAVE_BARS }).map((_, idx) => {
                                                const progress = audioUiById[audioId]?.progress || 0;
                                                const threshold = ((idx + 1) / VOICE_WAVE_BARS) * 100;
                                                const isActive = progress >= threshold;
                                                return <span key={`${audioId}-bar-${idx}`} className={isActive ? "wave-bar active" : "wave-bar"} />;
                                              })}
                                            </div>
                                            <span className="voice-duration">
                                              {formatAudioTime(audioUiById[audioId]?.duration || file.duration || 0)}
                                            </span>
                                          </div>
                                          <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={audioUiById[audioId]?.progress || 0}
                                            onChange={(event) => seekAudio(audioId, event.target.value)}
                                            className="voice-seek-hidden"
                                            aria-label="Seek voice message"
                                          />
                                        </>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <a key={`${file.url}-${file.fileName}`} href={toAttachmentUrl(file.url)} target="_blank" rel="noreferrer" className="msg-file-link">
                                    {isImage(file.mimeType) ? <img src={toAttachmentUrl(file.url)} alt={file.fileName} className="msg-image" /> : null}
                                    <span>{file.fileName}</span>
                                  </a>
                                )
                              ))}
                            </div>
                          ) : null}
                        </article>

                        <div className="msg-tools">
                          <button
                            type="button"
                            className="msg-tool-btn emoji-launcher"
                            aria-label="Add reaction"
                            title="React"
                            onClick={() => {
                              setActiveMenuId(null);
                              setActiveReactionPickerId((prev) => (prev === messageId ? null : messageId));
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
                              <circle cx="9.3" cy="10.2" r="1.05" fill="currentColor" />
                              <circle cx="14.7" cy="10.2" r="1.05" fill="currentColor" />
                              <path d="M8.8 13.7c.9 1.3 2 1.9 3.2 1.9s2.3-.6 3.2-1.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          </button>
                          {activeReactionPickerId === messageId ? (
                            <div className="msg-popover reaction-popover" role="menu">
                              {reactionChoices.map((emoji) => {
                                const reaction = message.reactions?.find((entry) => entry.emoji === emoji);
                                const count = reaction?.users?.length || 0;
                                const reacted = reaction?.users?.some((u) => (u.id || u._id) === currentUser?.id);
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className={reacted ? "reaction-btn active" : "reaction-btn"}
                                    onClick={() => {
                                      onToggleReaction(message._id, emoji);
                                      setActiveReactionPickerId(null);
                                    }}
                                  >
                                    {emoji} {count || ""}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}

                          <button
                            type="button"
                            className="msg-tool-btn more-launcher"
                            aria-label="Message actions"
                            title="More"
                            onClick={() => {
                              setActiveReactionPickerId(null);
                              setActiveMenuId((prev) => (prev === messageId ? null : messageId));
                            }}
                          >
                            <span aria-hidden="true">...</span>
                          </button>
                          {activeMenuId === messageId ? (
                            <div className="msg-popover msg-menu" role="menu">
                              <button
                                type="button"
                                onClick={() => {
                                  const quoted = message.content?.trim()
                                    ? `Re: ${message.content}`
                                    : `Re: ${messageUserName || "message"}`;
                                  setDraftInjection({ id: Date.now(), text: quoted });
                                  setActiveMenuId(null);
                                }}
                              >
                                Reprendre
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const contentToCopy = message.content || "";
                                  if (!contentToCopy) {
                                    setActiveMenuId(null);
                                    return;
                                  }
                                  try {
                                    await navigator.clipboard.writeText(contentToCopy);
                                  } catch (_error) {
                                    window.prompt("Copy message:", contentToCopy);
                                  }
                                  setActiveMenuId(null);
                                }}
                              >
                                Copy
                              </button>
                              {canDeleteMessage(message) && message.content ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMessage(message);
                                    setActiveMenuId(null);
                                  }}
                                >
                                  Edit
                                </button>
                              ) : null}
                              {canDeleteMessage(message) ? (
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => {
                                    onDeleteMessage(message._id);
                                    setActiveMenuId(null);
                                  }}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {message.reactions?.length ? (
                        <div className="msg-reactions">
                          {message.reactions.map((reaction) => {
                            const count = reaction?.users?.length || 0;
                            const reacted = reaction?.users?.some((u) => (u.id || u._id) === currentUser?.id);
                            return (
                              <button
                                key={reaction.emoji}
                                type="button"
                                className={reacted ? "msg-reaction-pill active" : "msg-reaction-pill"}
                                onClick={() => onToggleReaction(message._id, reaction.emoji)}
                                aria-label={`React with ${reaction.emoji}`}
                              >
                                <span className="reaction-emoji">{reaction.emoji}</span>
                                <span className="reaction-count">{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>

                    {isOwnGroup ? (
                      <div className="msg-avatar-area">
                        {showAvatar ? (
                          <div className="msg-avatar-wrap">
                            <div className="msg-avatar">{avatarNode}</div>
                            <span className={isOnline ? "msg-presence-dot online" : "msg-presence-dot offline"} />
                          </div>
                        ) : (
                          <div className="msg-avatar-spacer" />
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className={`typing-indicator ${typingLabel ? "visible" : ""}`}>
        {typingLabel || "Typing"}
      </div>
      <MessageForm
        onSend={onSendMessage}
        onEdit={onEditMessage}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
        draftInjection={draftInjection}
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
      />
    </>
  );

  return (
    <section className={`chat-interface glass${isVoiceRoom ? " voice-mode" : ""}`}>
      <header className="chat-head">
        <div className="chat-title-wrap">
          {roomAvatarUrl ? (
            <img
              src={roomAvatarUrl}
              alt={displayName}
              className={`chat-avatar chat-avatar-image${isDirectChat ? " chat-avatar-direct" : ""}`}
            />
          ) : (
            <div className={`chat-avatar${isDirectChat ? " chat-avatar-direct" : ""}`}>{initials}</div>
          )}
          <div>
            <h3 className="name-with-badge">
              {displayName}
              {isVerifiedUser(otherMember) ? <VerifiedBadge /> : null}
            </h3>
            <p>{activeRoom.description || "chat"}</p>
            {roomTypeLabel(activeRoom.roomType) ? <p className="chat-room-type">{roomTypeLabel(activeRoom.roomType)}</p> : null}
          </div>
        </div>

        <div className="chat-head-actions">
          <span className="member-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <path d="M20 8v6M23 11h-6" />
            </svg>
            {memberCount}
          </span>
          <button
            type="button"
            className="ghost-btn head-link-btn icon-head-btn"
            onClick={() => handleLaunchCall("audio")}
            aria-label="Start audio call"
            title="Start audio call"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>
          <button
            type="button"
            className="ghost-btn head-link-btn icon-head-btn"
            onClick={() => handleLaunchCall("video")}
            aria-label="Start video call"
            title="Start video call"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="6" width="15" height="12" rx="2" ry="2" />
              <polygon points="17 10 22 7 22 17 17 14 17 10" />
            </svg>
          </button>
          {!isDirectChat ? (
            <button type="button" className="ghost-btn head-link-btn" onClick={() => onLeaveRoom(activeRoom._id)}>Leave</button>
          ) : null}
          {!isDirectChat ? (
            <button
              type="button"
              className="ghost-btn dots-btn"
              aria-label="More options"
              onClick={onOpenRoomSettings}
            >
              ...
            </button>
          ) : null}
        </div>
      </header>

      {isVoiceRoom ? (
        <div className="voice-room">
          <div className="voice-stage">
            <div className="voice-stage-head">
              <div>
                <h4>Live Voice</h4>
                <p>{voiceOnline.length} listening</p>
              </div>
              <div className="voice-stage-actions">
                <button type="button" className="ghost-btn" onClick={() => handleLaunchCall("audio")}>
                  Join voice
                </button>
                <button type="button" className="ghost-btn" onClick={onOpenRoomSettings}>
                  Room info
                </button>
              </div>
            </div>

            <div className="voice-section">
              <h5>Speakers</h5>
              <div className="voice-speakers">
                {voiceSpeakers.length ? voiceSpeakers.map((member) => {
                  const avatarUrl = toAttachmentUrl(member.avatarUrl);
                  const name = member.displayName || member.username || "Listener";
                  const initials = name.slice(0, 2).toUpperCase();
                  const isYou = member.id === currentUser?.id;
                  return (
                    <article key={member.id} className="voice-person-card speaker">
                      <div className="voice-avatar" style={!avatarUrl ? { backgroundColor: member.avatarColor || "rgba(0,0,0,0.12)" } : undefined}>
                        {avatarUrl ? <img src={avatarUrl} alt={name} /> : <span>{initials}</span>}
                      </div>
                      <div className="voice-person-meta">
                        <strong className="name-with-badge">
                          {isYou ? "You" : name}
                          {isVerifiedUser(member) ? <VerifiedBadge /> : null}
                        </strong>
                        <small>{member.presenceStatus === "online" ? "Speaking" : "Away"}</small>
                      </div>
                      <span className="voice-live-ring" aria-hidden="true" />
                    </article>
                  );
                }) : (
                  <p className="muted">No active speakers yet.</p>
                )}
              </div>
            </div>

            <div className="voice-section">
              <h5>Listeners</h5>
              <div className="voice-listeners">
                {voiceListeners.map((member) => {
                  const avatarUrl = toAttachmentUrl(member.avatarUrl);
                  const name = member.displayName || member.username || "Listener";
                  const initials = name.slice(0, 2).toUpperCase();
                  const isYou = member.id === currentUser?.id;
                  return (
                    <article key={member.id} className="voice-person-card listener">
                      <div className="voice-avatar" style={!avatarUrl ? { backgroundColor: member.avatarColor || "rgba(0,0,0,0.12)" } : undefined}>
                        {avatarUrl ? <img src={avatarUrl} alt={name} /> : <span>{initials}</span>}
                      </div>
                      <div className="voice-person-meta">
                        <strong className="name-with-badge">
                          {isYou ? "You" : name}
                          {isVerifiedUser(member) ? <VerifiedBadge /> : null}
                        </strong>
                        <small>{member.presenceStatus === "online" ? "Listening" : "Offline"}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="voice-chat-panel">
            {voiceChatContent}
          </div>
        </div>
      ) : (
        <div className="voice-chat-panel">
          {voiceChatContent}
        </div>
      )}
</section>
  );
}
