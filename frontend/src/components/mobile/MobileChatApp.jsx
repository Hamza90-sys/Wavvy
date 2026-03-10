import React, { useEffect, useMemo, useRef, useState } from "react";
import { THEMES } from "../../constants/themes";

const API_URL = process.env.REACT_APP_API_URL || "";
const API_BASE = API_URL.replace(/\/api\/?$/, "");

const reactionChoices = [
  String.fromCodePoint(0x1f44d),
  String.fromCodePoint(0x2764, 0xfe0f),
  String.fromCodePoint(0x1f602),
  String.fromCodePoint(0x1f525),
  String.fromCodePoint(0x1f62e)
];

const toAttachmentUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};

const formatTime = (dateString) =>
  dateString ? new Date(dateString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

const isImage = (mimeType = "") => mimeType.startsWith("image/");
const roomTypeLabel = (roomType) => (roomType === "voice" ? "Voice chat" : "");

function WaveLogo() {
  return (
    <span className="wavvy-wave" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export default function MobileChatApp({
  user,
  connected,
  rooms,
  activeRoom,
  unreadByRoom,
  messages,
  roomUsers,
  roomMedia,
  loadingRoomMedia,
  theme,
  onThemeChange,
  onSelectRoom,
  onCreateRoom,
  onJoinRoom,
  onSendMessage,
  onToggleReaction,
  onDeleteMessage,
  onLeaveRoom,
  onDeleteRoom,
  onOpenRoomInfo,
  onLogout
}) {
  const [screen, setScreen] = useState("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [messageText, setMessageText] = useState("");
  const [messageFiles, setMessageFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [roomInfoOpen, setRoomInfoOpen] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [reactionTarget, setReactionTarget] = useState(null);
  const [hiddenRooms, setHiddenRooms] = useState([]);
  const [pinnedRooms, setPinnedRooms] = useState([]);
  const [swipeRoom, setSwipeRoom] = useState({ id: null, x: 0 });
  const fileRef = useRef(null);
  const listRef = useRef(null);
  const longPressRef = useRef(null);
  const messageTouchRef = useRef({ startX: 0, moved: false });

  useEffect(() => {
    if (!activeRoom) return;
    setScreen("chat");
  }, [activeRoom]);

  useEffect(() => {
    if (screen !== "chat") return;
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, screen]);

  const filteredRooms = useMemo(() => {
    const base = rooms.filter((room) => !hiddenRooms.includes(room._id));
    const searched = base.filter((room) => `${room.name} ${room.description || ""}`.toLowerCase().includes(searchQuery.toLowerCase()));
    const pinnedSet = new Set(pinnedRooms);
    return searched.sort((a, b) => {
      const aPinned = pinnedSet.has(a._id);
      const bPinned = pinnedSet.has(b._id);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });
  }, [rooms, hiddenRooms, searchQuery, pinnedRooms]);

  const activeNowUsers = useMemo(() => {
    const seen = new Set();
    const users = [];
    rooms.forEach((room) => {
      (room.members || []).forEach((member) => {
        const memberId = member._id || member.id;
        if (!memberId || memberId === user?.id || seen.has(memberId)) return;
        seen.add(memberId);
        users.push(member);
      });
    });
    return users.slice(0, 12);
  }, [rooms, user]);

  const onChatTouchStart = (roomId, event) => {
    setSwipeRoom({ id: roomId, x: 0, startX: event.touches[0].clientX });
  };

  const onChatTouchMove = (event) => {
    if (!swipeRoom.id) return;
    const dx = event.touches[0].clientX - swipeRoom.startX;
    const bounded = Math.max(-96, Math.min(96, dx));
    setSwipeRoom((prev) => ({ ...prev, x: bounded }));
  };

  const onChatTouchEnd = (room) => {
    if (!swipeRoom.id) return;
    if (swipeRoom.x > 70) {
      setPinnedRooms((prev) => (prev.includes(room._id) ? prev : [room._id, ...prev]));
    } else if (swipeRoom.x < -70) {
      setHiddenRooms((prev) => [...prev, room._id]);
    }
    setSwipeRoom({ id: null, x: 0 });
  };

  const startLongPress = (message) => {
    window.clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => {
      setReactionTarget(message._id);
    }, 380);
  };

  const clearLongPress = () => {
    window.clearTimeout(longPressRef.current);
  };

  const onMessageTouchStart = (event, message) => {
    messageTouchRef.current = { startX: event.touches[0].clientX, moved: false };
    startLongPress(message);
  };

  const onMessageTouchMove = (event) => {
    const dx = event.touches[0].clientX - messageTouchRef.current.startX;
    if (Math.abs(dx) > 16) {
      messageTouchRef.current.moved = true;
      clearLongPress();
    }
  };

  const onMessageTouchEnd = (event, message) => {
    clearLongPress();
    const dx = event.changedTouches[0].clientX - messageTouchRef.current.startX;
    if (Math.abs(dx) > 70) {
      setReplyTo(message);
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!messageText.trim() && !messageFiles.length) return;
    setSending(true);
    try {
      await onSendMessage({ content: messageText, files: messageFiles });
      setMessageText("");
      setMessageFiles([]);
      setReplyTo(null);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setSending(false);
    }
  };

  if (screen === "settings") {
    return (
      <main className="mobile-shell">
        <header className="mobile-header">
          <button type="button" className="micon-btn" onClick={() => setScreen("home")} aria-label="Back">←</button>
          <h2>Settings</h2>
          <span />
        </header>

        <section className="mcard">
          <h3>Theme</h3>
          <div className="theme-grid">
            {THEMES.map((themeOption) => (
              <button key={themeOption.id} type="button" className={themeOption.id === theme ? "theme-chip active" : "theme-chip"} onClick={() => onThemeChange(themeOption.id)}>
                {themeOption.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mcard">
          <h3>Account</h3>
          <p>{user?.username || "Guest"}</p>
          <small>{user?.email || ""}</small>
        </section>

        <section className="mcard">
          <button type="button" className="danger-btn mobile-danger" onClick={onLogout}>Logout</button>
        </section>
      </main>
    );
  }

  if (screen === "chat" && activeRoom) {
    const roomAvatar = toAttachmentUrl(activeRoom.avatarUrl);
    return (
      <main className="mobile-shell">
        <header className="mobile-chat-head">
          <button type="button" className="micon-btn" onClick={() => setScreen("home")} aria-label="Back">←</button>
          <button type="button" className="mroom-head" onClick={async () => {
            setRoomInfoOpen(true);
            await onOpenRoomInfo();
          }}>
            {roomAvatar ? <img src={roomAvatar} alt={activeRoom.name} className="mavatar small" /> : <span className="mavatar small">{activeRoom.name?.slice(0, 2).toUpperCase() || "RM"}</span>}
            <span>
              <strong>{activeRoom.name}</strong>
              <small>{activeRoom.description || "chat"}</small>
              {roomTypeLabel(activeRoom.roomType) ? <small>{roomTypeLabel(activeRoom.roomType)}</small> : null}
            </span>
          </button>
          <button type="button" className="micon-btn" aria-label="Call">📞</button>
          <button type="button" className="micon-btn" aria-label="More">⋯</button>
        </header>

        <section className="mobile-message-list" ref={listRef}>
          {messages.map((message) => {
            const own = (message.user?._id || message.user?.id) === user?.id;
            if (message.system) {
              return <div key={message._id || message.createdAt} className="msystem">{message.content}</div>;
            }
            return (
              <article
                key={message._id || message.createdAt}
                className={own ? "mbubble own" : "mbubble"}
                onTouchStart={(event) => onMessageTouchStart(event, message)}
                onTouchMove={onMessageTouchMove}
                onTouchEnd={(event) => onMessageTouchEnd(event, message)}
              >
                <div className="mbubble-head">
                  <strong>{message.user?.username || "Unknown"}</strong>
                  <small>{formatTime(message.createdAt)}</small>
                </div>
                {message.content ? <p>{message.content}</p> : null}
                {message.attachments?.map((file) => (
                  <a key={`${file.url}-${file.fileName}`} className="mfile" href={toAttachmentUrl(file.url)} target="_blank" rel="noreferrer">
                    {isImage(file.mimeType) ? <img src={toAttachmentUrl(file.url)} alt={file.fileName} /> : null}
                    <span>{file.fileName}</span>
                  </a>
                ))}
                {reactionTarget === message._id ? (
                  <div className="mreact-pop">
                    {reactionChoices.map((emoji) => (
                      <button key={emoji} type="button" onClick={() => {
                        onToggleReaction(message._id, emoji);
                        setReactionTarget(null);
                      }}>{emoji}</button>
                    ))}
                    <button type="button" className="mreact-delete" onClick={() => {
                      onDeleteMessage(message._id);
                      setReactionTarget(null);
                    }}>🗑</button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        {replyTo ? (
          <div className="mreply-preview">
            <span>Replying to {replyTo.user?.username}</span>
            <button type="button" onClick={() => setReplyTo(null)}>×</button>
          </div>
        ) : null}

        <form className="mobile-input-bar" onSubmit={sendMessage}>
          <button type="button" className="micon-btn">☺</button>
          <button type="button" className="micon-btn" onClick={() => fileRef.current?.click()}>＋</button>
          <input type="text" value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Type a message..." />
          <input ref={fileRef} type="file" className="file-input-hidden" multiple onChange={(event) => setMessageFiles(Array.from(event.target.files || []).slice(0, 5))} />
          <button type="submit" className="msend-btn" disabled={sending}>➤</button>
        </form>

        <section className={roomInfoOpen ? "mroom-sheet open" : "mroom-sheet"}>
          <div className="msheet-handle" onClick={() => setRoomInfoOpen(false)} />
          <div className="msheet-head">
            {roomAvatar ? <img src={roomAvatar} alt={activeRoom.name} className="mavatar large" /> : <span className="mavatar large">{activeRoom.name?.slice(0, 2).toUpperCase() || "RM"}</span>}
            <h3>{activeRoom.name}</h3>
            <p>{activeRoom.description || "chat"}</p>
            {roomTypeLabel(activeRoom.roomType) ? <p>{roomTypeLabel(activeRoom.roomType)}</p> : null}
          </div>
          <div className="msheet-block">
            <h4>Members</h4>
            <div className="msheet-members">
              {roomUsers.map((member) => (
                <div key={member.id} className="msheet-member">
                  <span className={member.online ? "dot on" : "dot"} />
                  <span>{member.username}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="msheet-block">
            <h4>Shared Media</h4>
            {loadingRoomMedia ? <p>Loading media...</p> : (
              <div className="msheet-media">
                {roomMedia.length ? roomMedia.map((media) => (
                  <a key={media.url} href={toAttachmentUrl(media.url)} target="_blank" rel="noreferrer">
                    <img src={toAttachmentUrl(media.url)} alt={media.fileName} />
                  </a>
                )) : <p>No media yet.</p>}
              </div>
            )}
          </div>
          <button type="button" className="danger-btn mobile-danger" onClick={() => onLeaveRoom(activeRoom._id)}>Leave Room</button>
          <button type="button" className="ghost-btn mobile-ghost" onClick={() => onDeleteRoom(activeRoom._id)}>Delete Room</button>
        </section>
      </main>
    );
  }

  return (
    <main className="mobile-shell">
      <header className="mobile-header">
        <div className="mobile-brand">
          <WaveLogo />
          <h1>Wavvy</h1>
        </div>
        <div className="mobile-head-actions">
          <button type="button" className="micon-btn" aria-label="Search">⌕</button>
          <button type="button" className="mprofile-btn" onClick={() => setScreen("settings")} aria-label="Settings">
            {user?.username?.slice(0, 1)?.toUpperCase() || "U"}
          </button>
        </div>
      </header>

      <label className="mobile-search">
        <input type="text" placeholder="Search chats" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
      </label>

      <section className="mobile-active-now">
        <h3>Active Now</h3>
        <div className="mobile-active-row">
          {activeNowUsers.map((member) => (
            <div key={member._id || member.id} className="mactive-chip">
              <span>{member.username?.slice(0, 1).toUpperCase() || "A"}</span>
              <small>{member.username}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="mobile-chat-list">
        {filteredRooms.map((room) => {
          const isMember = room.members?.some((member) => (member._id || member.id) === user?.id);
          const unread = unreadByRoom[room._id] || 0;
          const roomAvatar = toAttachmentUrl(room.avatarUrl);
          const dragging = swipeRoom.id === room._id;
          return (
            <article key={room._id} className="mchat-item-wrap">
              <div className={swipeRoom.x > 12 ? "swipe-hint pin show" : "swipe-hint pin"}>Pin</div>
              <div className={swipeRoom.x < -12 ? "swipe-hint del show" : "swipe-hint del"}>Delete</div>
              <button
                type="button"
                className={activeRoom?._id === room._id ? "mchat-item active" : "mchat-item"}
                onTouchStart={(event) => onChatTouchStart(room._id, event)}
                onTouchMove={onChatTouchMove}
                onTouchEnd={() => onChatTouchEnd(room)}
                onClick={() => (isMember ? onSelectRoom(room) : onJoinRoom(room._id))}
                style={dragging ? { transform: `translateX(${swipeRoom.x}px)` } : undefined}
              >
                {roomAvatar ? <img src={roomAvatar} alt={room.name} className="mavatar" /> : <span className="mavatar gradient">{room.name?.slice(0, 2).toUpperCase() || "RM"}</span>}
                <span className="mchat-copy">
                  <strong>{room.name}</strong>
                  <small>{room.description || "Tap to open chat"}</small>
                  {roomTypeLabel(room.roomType) ? <small>{roomTypeLabel(room.roomType)}</small> : null}
                </span>
                <span className="mchat-meta">
                  <small>{formatTime(room.updatedAt)}</small>
                  {unread > 0 ? <em>{unread}</em> : null}
                </span>
              </button>
            </article>
          );
        })}
      </section>

      <button type="button" className="mobile-fab" onClick={onCreateRoom} aria-label="New chat">
        +
      </button>

      <footer className="mobile-foot-status">
        <span className={connected ? "dot on" : "dot"} />
        <small>{connected ? "Online" : "Reconnecting..."}</small>
      </footer>
    </main>
  );
}
