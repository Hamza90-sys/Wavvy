import React, { useEffect, useMemo, useRef, useState } from "react";
import { THEMES } from "../constants/themes";
import NotificationsPanel from "./NotificationsPanel";
import VerifiedBadge from "./VerifiedBadge";
import { isVerifiedUser } from "../constants/verifiedUsers";

const API_URL = process.env.REACT_APP_API_URL || "";
const API_BASE = API_URL.replace(/\/api\/?$/, "");

const toAttachmentUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};
const roomTypeLabel = (_roomType) => "";
const getDirectNickname = (currentUserId, otherUserId) => {
  if (!currentUserId || !otherUserId) return "";
  try {
    return localStorage.getItem(`wavvy_dm_nickname:${currentUserId}:${otherUserId}`) || "";
  } catch (_error) {
    return "";
  }
};
const applyThemePreview = (themeId) => {
  if (!themeId) return;
  document.body.dataset.theme = themeId;
};

function Icon({ path, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default function Sidebar({
  user,
  rooms,
  activeRoom,
  unreadByRoom = {},
  roomActivityById = {},
  callHistory = [],
  onStartCallFromSidebar = () => {},
  onSelectRoom,
  onCreateRoomOpen,
  onJoinRoom,
  onLogout,
  theme,
  onThemeChange,
  notifications = [],
  unreadNotifications = 0,
  notificationsLoading = false,
  onNotificationsOpen = () => {},
  onAcceptNotification = () => {},
  onDeclineNotification = () => {},
  onStartChatNotification = () => {},
  activePane = "chat",
  onPaneChange = () => {}
}) {
  const [query, setQuery] = useState("");
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [nicknameTick, setNicknameTick] = useState(0);
  const themeMenuRef = useRef(null);
  const themePanelRef = useRef(null);
  const notificationsRef = useRef(null);

  const filteredRooms = useMemo(() => {
    void nicknameTick;
    const term = query.trim().toLowerCase();
    if (!term) return rooms;
    return rooms.filter((room) => {
      const isDirectChat = Boolean(room.isPrivate) && (room.members?.length === 2);
      const otherMember = isDirectChat
        ? room.members?.find((member) => (member._id || member.id) !== user?.id)
        : null;
      const nickname = isDirectChat
        ? getDirectNickname(user?.id, otherMember?.id || otherMember?._id)
        : "";
      const directName = isDirectChat
        ? `${nickname} ${otherMember?.displayName || ""} ${otherMember?.username || ""}`
        : "";
      const roomText = `${room.name || ""} ${room.description || ""} ${directName}`.toLowerCase();
      return roomText.includes(term);
    });
  }, [rooms, query, nicknameTick, user]);

  const activeTheme = THEMES.find((item) => item.id === theme);
  const formatRelativeTime = (value) => {
    if (!value) return "";
    const diffMs = Date.now() - new Date(value).getTime();
    const diffSec = Math.max(1, Math.floor(diffMs / 1000));
    if (diffSec < 60) return `${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}d`;
  };
  const callsFilter = activePane === "calls-video" ? "video" : "audio";
  const filteredCalls = useMemo(
    () => (callHistory || []).filter((entry) => entry.callType === callsFilter),
    [callHistory, callsFilter]
  );
  const formatActivityTime = (value) => {
    if (!value) return "";
    const diffMs = Date.now() - new Date(value).getTime();
    const diffSec = Math.max(1, Math.floor(diffMs / 1000));
    if (diffSec < 60) return `${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}d`;
  };

  useEffect(() => {
    if (!themeMenuOpen) return undefined;
    const onPointerDown = (event) => {
      const hitMenu = themeMenuRef.current?.contains(event.target);
      const hitPanel = themePanelRef.current?.contains(event.target);
      if (!hitMenu && !hitPanel) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [themeMenuOpen]);

  useEffect(() => {
    if (!themeMenuOpen) {
      applyThemePreview(theme);
    }
  }, [themeMenuOpen, theme]);

  useEffect(() => {
    if (!notificationsOpen) return undefined;
    const onPointerDown = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [notificationsOpen]);

  useEffect(() => {
    const handler = () => setNicknameTick((tick) => tick + 1);
    window.addEventListener("wavvy:nickname-change", handler);
    return () => window.removeEventListener("wavvy:nickname-change", handler);
  }, []);

  return (
    <aside className="sidebar">
      <div className="icon-rail">
        <button
          type="button"
          className={`rail-btn ${activePane === "chat" ? "active" : ""}`}
          aria-label="Chats"
          onClick={() => onPaneChange("chat")}
        >
          <Icon path="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </button>
        <button
          type="button"
          className={`rail-btn ${activePane === "discover" ? "active" : ""}`}
          aria-label="Discover"
          onClick={() => onPaneChange("discover")}
        >
          <Icon path="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
        </button>
        <button
          type="button"
          className={`rail-btn ${activePane === "calls-video" ? "active" : ""}`}
          aria-label="Video Calls"
          onClick={() => {
            setThemeMenuOpen(false);
            setNotificationsOpen(false);
            onPaneChange("calls-video");
          }}
        >
          <Icon path="M15 10l5-3v10l-5-3zM4 6h11v12H4z" />
        </button>
        <button
          type="button"
          className={`rail-btn ${activePane === "calls-audio" ? "active" : ""}`}
          aria-label="Audio Calls"
          onClick={() => {
            setThemeMenuOpen(false);
            setNotificationsOpen(false);
            onPaneChange("calls-audio");
          }}
        >
          <Icon path="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.7 2.6a2 2 0 0 1-.4 2.1L8 9.9a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 2.1-.4c.8.4 1.7.6 2.6.7A2 2 0 0 1 22 16.9z" />
        </button>
        <div className="notifications-anchor">
          <button
            type="button"
            className={`rail-btn ${notificationsOpen ? "active" : ""}`}
            aria-label="Notifications"
            onClick={() => {
              setNotificationsOpen((prev) => {
                const next = !prev;
                if (next) onNotificationsOpen();
                return next;
              });
            }}
          >
            <Icon path="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
            {unreadNotifications > 0 ? (
              <span className="rail-badge">{Math.min(unreadNotifications, 99)}</span>
            ) : null}
          </button>
        </div>
        <div className="rail-spacer" />
        <button
          type="button"
          className={`rail-btn ${activePane === "settings" ? "active" : ""}`}
          aria-label="Settings"
          title="Settings"
          onClick={() => onPaneChange("settings")}
        >
          <Icon path="M12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zm7.4-3.5c0-.46-.04-.92-.1-1.36l1.58-1.23a.5.5 0 0 0 .12-.64l-1.5-2.6a.5.5 0 0 0-.6-.22l-1.86.75a7.02 7.02 0 0 0-2.35-1.36l-.28-1.98A.5.5 0 0 0 13.5 3h-3a.5.5 0 0 0-.5.42l-.28 1.98a7.02 7.02 0 0 0-2.35 1.36l-1.86-.75a.5.5 0 0 0-.6.22l-1.5 2.6a.5.5 0 0 0 .12.64L4.7 10.64c-.07.44-.1.9-.1 1.36 0 .46.04.92.1 1.36l-1.58 1.23a.5.5 0 0 0-.12.64l1.5 2.6a.5.5 0 0 0 .6.22l1.86-.75a7.02 7.02 0 0 0 2.35 1.36l.28 1.98a.5.5 0 0 0 .5.42h3a.5.5 0 0 0 .5-.42l.28-1.98a7.02 7.02 0 0 0 2.35-1.36l1.86.75a.5.5 0 0 0 .6-.22l1.5-2.6a.5.5 0 0 0-.12-.64l-1.58-1.23c.07-.44.1-.9.1-1.36z" />
        </button>
        <div className="theme-switcher" ref={themeMenuRef}>
          <button
            type="button"
            className={`rail-btn ${themeMenuOpen ? "active" : ""}`}
            onClick={() => setThemeMenuOpen((open) => !open)}
            aria-label="Theme"
            title={`Theme: ${activeTheme?.label || "Custom"}`}
            aria-expanded={themeMenuOpen}
            aria-haspopup="menu"
          >
            <Icon path="M12 3a9 9 0 1 0 9 9c0-.5-.4-.8-.8-.7A7 7 0 0 1 12.7 3.8c.1-.4-.2-.8-.7-.8z" />
          </button>
          {themeMenuOpen ? null : null}
        </div>
        <button type="button" className="rail-btn" onClick={onLogout} aria-label="Logout"><Icon path="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></button>
      </div>

      <div className={`sidebar-main glass${themeMenuOpen ? " theme-open" : ""}`}>
        <div className="sidebar-head">
          <h2>Chat</h2>
          <button className="add-room-btn" onClick={onCreateRoomOpen} type="button">+</button>
        </div>

        <label className="search-wrap">
          <span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contact" aria-label="Search rooms" />
        </label>

        {themeMenuOpen ? (
          <div className="theme-panel-inline theme-panel glass" role="menu" aria-label="Choose theme" ref={themePanelRef}>
            {THEMES.map((themeOption) => (
              <button
                key={themeOption.id}
                type="button"
                role="menuitemradio"
                aria-checked={themeOption.id === theme}
                data-theme={themeOption.id}
                className={`theme-card ${themeOption.id === theme ? "active" : ""}`}
                onMouseEnter={() => applyThemePreview(themeOption.id)}
                onMouseLeave={() => applyThemePreview(theme)}
                onFocus={() => applyThemePreview(themeOption.id)}
                onBlur={() => applyThemePreview(theme)}
                onClick={() => {
                  applyThemePreview(themeOption.id);
                  onThemeChange(themeOption.id);
                  setThemeMenuOpen(false);
                }}
              >
                <div className="theme-preview" aria-hidden="true">
                  <div className="theme-preview-top" />
                  <div className="theme-preview-bubbles">
                    <div className="theme-bubble left">Hey Hamza</div>
                    <div className="theme-bubble right">What's up?</div>
                  </div>
                </div>
                <span className="theme-card-label">{themeOption.label}</span>
              </button>
            ))}
          </div>
        ) : notificationsOpen ? (
          <div className="notifications-inline full" ref={notificationsRef}>
            <NotificationsPanel
              notifications={notifications}
              loading={notificationsLoading}
              onAccept={onAcceptNotification}
              onDecline={onDeclineNotification}
              onStartChat={onStartChatNotification}
            />
          </div>
        ) : activePane === "calls-video" || activePane === "calls-audio" ? (
          <section className="calls-inline glass">
            <header className="calls-inline-head">
              <h3>{callsFilter === "video" ? "Video Calls" : "Audio Calls"}</h3>
            </header>
            <div className="calls-inline-list">
              {filteredCalls.length ? filteredCalls.map((entry) => (
                <article key={entry.id} className="calls-inline-item">
                  <div className="calls-inline-copy">
                    <strong>{entry.roomName || "Conversation"}</strong>
                    <span>{entry.direction === "incoming" ? "Incoming" : "Outgoing"} • {formatRelativeTime(entry.createdAt)}</span>
                  </div>
                  <button
                    type="button"
                    className="ghost-btn calls-inline-btn"
                    onClick={() => onStartCallFromSidebar(entry.roomId, callsFilter)}
                  >
                    Call again
                  </button>
                </article>
              )) : (
                <p className="muted">No {callsFilter} calls yet.</p>
              )}
            </div>
          </section>
        ) : (
          <div className="room-list">
          {filteredRooms.map((room) => {
            const isMember = room.members?.some((member) => (member._id || member.id) === user?.id);
            const isActive = activeRoom?._id === room._id;
            const isDirectChat = Boolean(room.isPrivate) && (room.members?.length === 2);
            const otherMember = isDirectChat
              ? room.members?.find((member) => (member._id || member.id) !== user?.id)
              : null;
            const storedNickname = isDirectChat ? getDirectNickname(user?.id, otherMember?.id || otherMember?._id) : "";
            const displayName = isDirectChat
              ? (storedNickname || otherMember?.displayName || otherMember?.username || "Direct chat")
              : room.name;
            const initials = displayName?.slice(0, 2).toUpperCase() || "RM";
            const roomAvatarUrl = toAttachmentUrl(isDirectChat ? otherMember?.avatarUrl : room.avatarUrl);
            const activity = roomActivityById[room._id];
            const unread = unreadByRoom[room._id] || 0;
            const activityText = activity?.text || (isDirectChat ? "Direct chat" : (room.description || "chat"));
            const activityTime = formatActivityTime(activity?.createdAt);
            const isOwnActivity = (activity?.senderId || "") === (user?.id || "");
            const previewText = activity?.senderName && !isDirectChat && !isOwnActivity
              ? `${activity.senderName}: ${activityText}`
              : activityText;
            return (
              <article key={room._id} className={isActive ? "room-card active" : "room-card"}>
                <button type="button" onClick={() => (isMember ? onSelectRoom(room) : onJoinRoom(room._id))} className="room-main-btn">
                  {roomAvatarUrl ? (
                    <img
                      src={roomAvatarUrl}
                      alt={room.name}
                      className={`room-avatar room-avatar-image${isDirectChat ? " room-avatar-direct" : ""}`}
                    />
                  ) : (
                    <span className={`room-avatar${isDirectChat ? " room-avatar-direct" : ""}`}>{initials}</span>
                  )}
                  <span className="room-text">
                    <strong className="name-with-badge">
                      {displayName}
                      {isDirectChat && isVerifiedUser(otherMember) ? <VerifiedBadge className="sidebar-verified-badge" /> : null}
                    </strong>
                    <span className="room-preview-line">
                      <span className="room-preview-text">{previewText}</span>
                      {activityTime ? <small className="room-preview-time">{activityTime}</small> : null}
                    </span>
                    {roomTypeLabel(room.roomType) ? <small className="room-type-text">{roomTypeLabel(room.roomType)}</small> : null}
                  </span>
                  {unread > 0 ? (
                    <span className="room-unread-dot" aria-label={`${unread} unread messages`} />
                  ) : !isDirectChat ? (
                    <small className="room-members">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                        <path d="M20 8v6M23 11h-6" />
                      </svg>
                      {room.members?.length || 0}
                    </small>
                  ) : null}
                </button>
              </article>
            );
          })}
          </div>
        )}
      </div>
    </aside>
  );
}
