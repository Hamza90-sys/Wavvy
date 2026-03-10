import React, { useEffect, useMemo, useRef, useState } from "react";

const API_URL = process.env.REACT_APP_API_URL || "";
const API_BASE = API_URL.replace(/\/api\/?$/, "");
const NICKNAME_STORAGE_PREFIX = "wavvy_room_nicknames";

const toAttachmentUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};
const roomTypeLabel = (roomType) => (roomType === "voice" ? "Voice chat" : "");

export default function RoomSettingsModal({
  open,
  activeRoom,
  roomUsers,
  currentUser,
  mediaItems,
  loadingMedia,
  onClose,
  onSaveRoom,
  onUploadAvatar,
  onDeleteRoom,
  onKickMember
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [selectedAvatarName, setSelectedAvatarName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [activeMemberMenuId, setActiveMemberMenuId] = useState("");
  const [activeNicknameEditorId, setActiveNicknameEditorId] = useState("");
  const creatorId = activeRoom?.createdBy?._id || activeRoom?.createdBy?.id || activeRoom?.createdBy;
  const isAdmin = useMemo(
    () => activeRoom?.admins?.some((admin) => (admin._id || admin.id) === currentUser?.id) || creatorId === currentUser?.id,
    [activeRoom, creatorId, currentUser]
  );
  const initials = activeRoom?.name?.slice(0, 2)?.toUpperCase() || "RM";
  const roomAvatarUrl = toAttachmentUrl(activeRoom?.avatarUrl);
  const [memberNicknames, setMemberNicknames] = useState({});
  const avatarInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const creatorUser =
    roomUsers.find((member) => (member.id || member._id) === creatorId) ||
    activeRoom?.createdBy ||
    null;
  const adminName =
    creatorUser?.displayName ||
    creatorUser?.username ||
    (creatorId === currentUser?.id ? currentUser?.displayName || currentUser?.username : "");

  const nicknameStorageKey = useMemo(() => {
    const roomId = activeRoom?._id;
    const viewerId = currentUser?.id;
    if (!roomId || !viewerId) return "";
    return `${NICKNAME_STORAGE_PREFIX}:${viewerId}:${roomId}`;
  }, [activeRoom?._id, currentUser?.id]);

  useEffect(() => {
    if (!activeRoom) return;
    setName(activeRoom.name || "");
    setDescription(activeRoom.description || "");
    setEditingName(false);
  }, [activeRoom]);

  useEffect(() => {
    if (!editingName) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [editingName]);

  useEffect(() => {
    if (!nicknameStorageKey) {
      setMemberNicknames({});
      return;
    }
    try {
      const raw = localStorage.getItem(nicknameStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object") {
        setMemberNicknames(parsed);
        return;
      }
    } catch (_error) {
      // Ignore invalid local storage values.
    }
    setMemberNicknames({});
  }, [nicknameStorageKey]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (event.target.closest(".room-member-actions")) return;
      setActiveMemberMenuId("");
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  if (!open || !activeRoom) return null;

  const handleSave = async (nextName) => {
    if (!isAdmin) return;
    const safeName = (nextName || "").trim();
    if (safeName.length < 2 || safeName.length > 40 || safeName === activeRoom.name) return;
    setSaving(true);
    try {
      await onSaveRoom(activeRoom._id, { name: safeName, description });
      setName(safeName);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (event) => {
    if (!isAdmin) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedAvatarName(file.name);
    setAvatarUploading(true);
    try {
      await onUploadAvatar(activeRoom._id, file);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin) return;
    if (!window.confirm("Delete this room for everyone?")) return;
    await onDeleteRoom(activeRoom._id);
    onClose();
  };

  const handleNameBlur = async () => {
    await handleSave(name);
    setEditingName(false);
  };

  const saveNicknames = (nextNicknames) => {
    setMemberNicknames(nextNicknames);
    if (!nicknameStorageKey) return;
    localStorage.setItem(nicknameStorageKey, JSON.stringify(nextNicknames));
  };

  const handleNicknameChange = (memberId, value) => {
    setMemberNicknames((prev) => ({
      ...prev,
      [memberId]: value.slice(0, 24)
    }));
  };

  const handleNicknameCommit = (memberId) => {
    const trimmed = (memberNicknames[memberId] || "").trim();
    const next = { ...memberNicknames };
    if (trimmed) next[memberId] = trimmed;
    else delete next[memberId];
    saveNicknames(next);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card room-settings-modal">
        <div className="modal-head room-settings-head">
          <button type="button" className="room-settings-back-btn" onClick={onClose} aria-label="Back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
          <div className="room-settings-avatar-wrap">
            <div className="room-settings-avatar-anchor">
              <button
                type="button"
                className={`room-settings-avatar-button ${isAdmin ? "editable" : ""}`}
                onClick={() => {
                  if (isAdmin) avatarInputRef.current?.click();
                }}
              >
                {roomAvatarUrl ? <img src={roomAvatarUrl} alt={activeRoom.name} className="room-settings-avatar" /> : <span className="room-settings-avatar">{initials}</span>}
              </button>
              <span className="room-settings-status-dot" />
            </div>
            {isAdmin ? (
              <>
                <input ref={avatarInputRef} className="room-avatar-input" type="file" accept="image/*" onChange={handleAvatarChange} disabled={avatarUploading} />
                <span className="room-settings-inline-hint">{avatarUploading ? "Uploading..." : "Click image to change"}</span>
              </>
            ) : null}
          </div>
          <div className="room-settings-head-copy">
            <p className="room-settings-kicker">Wavvy Space</p>
            {isAdmin && editingName ? (
              <input
                ref={nameInputRef}
                type="text"
                className="room-settings-name-input"
                value={name}
                minLength={2}
                maxLength={40}
                disabled={saving}
                onChange={(event) => setName(event.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setName(activeRoom.name || "");
                    setEditingName(false);
                  }
                }}
              />
            ) : (
              <button type="button" className={`room-settings-room-name ${isAdmin ? "editable" : ""}`} onClick={() => isAdmin && setEditingName(true)}>
                {activeRoom.name}
              </button>
            )}
            <p>{activeRoom.description || "No room description yet."}</p>
            {roomTypeLabel(activeRoom.roomType) ? <p className="room-settings-type">{roomTypeLabel(activeRoom.roomType)}</p> : null}
            {isAdmin && selectedAvatarName ? <p className="room-settings-inline-note">{selectedAvatarName}</p> : null}
          </div>
          <div className="room-settings-head-actions">
            <span className="room-role-pill">{isAdmin ? `Admin: ${adminName}`.trim() : "Member"}</span>
            {isAdmin ? <button type="button" className="danger-btn room-settings-delete-btn" onClick={handleDelete}>Delete room</button> : null}
          </div>
        </div>

        <div className="room-settings-section">
          <h4>Members ({roomUsers.length})</h4>
          <div className="room-settings-members">
            {roomUsers.map((member) => {
              const memberId = member.id || member._id;
              const canKick = isAdmin && memberId !== currentUser?.id && memberId !== creatorId;
              const nickname = (memberNicknames[memberId] || "").trim();
              const preferredName = nickname || member.displayName || member.username;
              const memberAvatar = toAttachmentUrl(member.avatarUrl);
              const menuOpen = activeMemberMenuId === memberId;
              const nicknameOpen = activeNicknameEditorId === memberId && memberId !== currentUser?.id;
              return (
                <div className="details-member-row room-settings-member-row" key={memberId}>
                  <div className="room-member-avatar-wrap">
                    {memberAvatar ? (
                      <img src={memberAvatar} alt={member.username} className="room-member-avatar" />
                    ) : (
                      <span className="room-member-avatar room-member-avatar-fallback">
                        {(member.displayName || member.username || "?").slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className={member.online ? "member-dot online" : "member-dot offline"} />
                  </div>
                  <div className="room-member-meta">
                    <span className="member-name">{preferredName}</span>
                    <small className="room-member-handle">@{member.username}</small>
                    {nicknameOpen ? (
                      <input
                        type="text"
                        className="room-member-nickname-field"
                        value={memberNicknames[memberId] || ""}
                        maxLength={24}
                        placeholder="Add nickname"
                        onChange={(event) => handleNicknameChange(memberId, event.target.value)}
                        onBlur={() => handleNicknameCommit(memberId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                            setActiveNicknameEditorId("");
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setActiveNicknameEditorId("");
                          }
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="room-member-actions">
                    <button
                      type="button"
                      className="room-member-menu-btn"
                      aria-label="Member actions"
                      onClick={() => setActiveMemberMenuId((prev) => (prev === memberId ? "" : memberId))}
                    >
                      ...
                    </button>
                    {menuOpen ? (
                      <div className="room-member-menu" role="menu">
                        {memberId !== currentUser?.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveNicknameEditorId((prev) => (prev === memberId ? "" : memberId));
                              setActiveMemberMenuId("");
                            }}
                          >
                            Nickname
                          </button>
                        ) : null}
                        {canKick ? (
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              onKickMember(activeRoom._id, memberId);
                              setActiveMemberMenuId("");
                            }}
                          >
                            Kick
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="room-settings-section">
          <h4>Media ({mediaItems.length})</h4>
          {loadingMedia ? <p className="room-settings-muted">Loading images...</p> : null}
          {!loadingMedia && !mediaItems.length ? <p className="room-settings-muted">No images have been shared in this room yet.</p> : null}
          {!!mediaItems.length ? (
            <div className="room-media-grid">
              {mediaItems.map((media, index) => (
                <a key={`${media.url}-${index}`} href={toAttachmentUrl(media.url)} target="_blank" rel="noreferrer" className="room-media-item">
                  <img src={toAttachmentUrl(media.url)} alt={media.fileName || "Room image"} />
                  <span className="room-media-overlay">{media.user?.username || "Member"}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div className="room-settings-section">
          <h4>Permissions</h4>
          <p className="room-settings-muted">Admins can edit room photo and name from the header. Members can view users, set nicknames, and browse room media.</p>
        </div>
      </section>
    </div>
  );
}


