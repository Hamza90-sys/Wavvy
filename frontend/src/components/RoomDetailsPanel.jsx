import React, { useEffect, useMemo, useState } from "react";
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

export default function RoomDetailsPanel({
  activeRoom,
  roomUsers,
  currentUser,
  onKickMember,
  mediaItems = [],
  loadingMedia = false,
  onLoadMedia = () => {},
  blockedUsers = [],
  onBlockUser = () => {}
}) {
  const creatorId = activeRoom?.createdBy?._id || activeRoom?.createdBy?.id || activeRoom?.createdBy;
  const isAdmin = activeRoom?.admins?.some((admin) => (admin._id || admin.id) === currentUser?.id) || creatorId === currentUser?.id;
  const isDirectChat = Boolean(activeRoom?.isPrivate) && ((activeRoom?.members?.length || 0) === 2 || roomUsers.length === 2);
  const otherMember = isDirectChat
    ? roomUsers.find((member) => (member.id || member._id) !== currentUser?.id)
    : null;
  const baseDisplayName = isDirectChat
    ? (otherMember?.displayName || otherMember?.username || "Direct chat")
    : (activeRoom?.name || "");
  const roomAvatarUrl = toAttachmentUrl(isDirectChat ? otherMember?.avatarUrl : activeRoom?.avatarUrl);
  const otherMemberId = otherMember?.id || otherMember?._id || "";
  const nicknameStorageKey = useMemo(() => {
    if (!isDirectChat || !currentUser?.id || !otherMemberId) return "";
    return `wavvy_dm_nickname:${currentUser.id}:${otherMemberId}`;
  }, [isDirectChat, currentUser?.id, otherMemberId]);
  const [nickname, setNickname] = useState("");
  const [nicknameSaved, setNicknameSaved] = useState("");

  useEffect(() => {
    if (!nicknameStorageKey) {
      setNickname("");
      setNicknameSaved("");
      return;
    }
    const stored = localStorage.getItem(nicknameStorageKey) || "";
    setNickname(stored);
    setNicknameSaved(stored);
  }, [nicknameStorageKey]);

  useEffect(() => {
    if (isDirectChat && activeRoom?._id) {
      onLoadMedia(activeRoom._id);
    }
  }, [isDirectChat, activeRoom?._id, onLoadMedia]);

  const saveNickname = () => {
    if (!nicknameStorageKey) return;
    const trimmed = nickname.trim().slice(0, 24);
    if (trimmed) {
      localStorage.setItem(nicknameStorageKey, trimmed);
      setNickname(trimmed);
      setNicknameSaved(trimmed);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("wavvy:nickname-change"));
      }
    } else {
      localStorage.removeItem(nicknameStorageKey);
      setNickname("");
      setNicknameSaved("");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("wavvy:nickname-change"));
      }
    }
  };

  const isBlocked = Boolean(otherMemberId) && blockedUsers.includes(otherMemberId.toString());
  const displayName = isDirectChat ? (nicknameSaved.trim() || baseDisplayName) : baseDisplayName;

  if (!activeRoom) {
    return (
      <aside className="room-details glass">
        <div className="details-empty">
          <h3>No Room</h3>
          <p>Select a room to view members.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="room-details glass">
      <div
        className={`details-avatar ${roomAvatarUrl ? "image" : ""}`}
        style={!roomAvatarUrl ? undefined : { backgroundImage: `url(${roomAvatarUrl})` }}
        aria-hidden="true"
      >
        {!roomAvatarUrl ? displayName?.slice(0, 2).toUpperCase() : null}
      </div>
      <h3 className="name-with-badge">
        {displayName}
        {isVerifiedUser(otherMember) ? <VerifiedBadge /> : null}
      </h3>
      {!isDirectChat && activeRoom.description ? <p>{activeRoom.description}</p> : null}
      {isDirectChat && otherMember ? (
        <>
          <p className="profile-username">@{otherMember.username}</p>
          <p className={`profile-presence ${otherMember.presenceStatus === "online" || otherMember.online ? "online" : ""}`}>
            {otherMember.presenceStatus === "online" || otherMember.online ? "Online" : "Offline"}
          </p>
        </>
      ) : null}
      {roomTypeLabel(activeRoom.roomType) ? <p className="room-details-type">{roomTypeLabel(activeRoom.roomType)}</p> : null}
      {isDirectChat ? (
        <>
          <hr />
          <h4>Nickname</h4>
          <div className="details-nickname">
            <input
              type="text"
              className="room-member-nickname-field"
              value={nickname}
              maxLength={24}
              placeholder="Add nickname"
              onChange={(event) => setNickname(event.target.value)}
            />
            <button type="button" className="nickname-save" onClick={saveNickname} disabled={nickname.trim() === nicknameSaved.trim()}>
              Save
            </button>
          </div>
          <hr />
          <h4>Media</h4>
          {loadingMedia ? <p className="room-settings-muted">Loading media...</p> : null}
          {!loadingMedia && !mediaItems.length ? <p className="room-settings-muted">No media shared yet.</p> : null}
          {!!mediaItems.length ? (
            <div className="room-media-grid">
              {mediaItems.map((media, index) => (
                media.mimeType?.startsWith("video/") ? (
                  <video key={`${media.url}-${index}`} src={toAttachmentUrl(media.url)} controls className="room-media-item" />
                ) : (
                  <a key={`${media.url}-${index}`} href={toAttachmentUrl(media.url)} target="_blank" rel="noreferrer" className="room-media-item">
                    <img src={toAttachmentUrl(media.url)} alt={media.fileName || "Media"} />
                    <span className="room-media-overlay">{media.user?.username || "Member"}</span>
                  </a>
                )
              ))}
            </div>
          ) : null}
          <hr />
          <button type="button" className="block-btn" onClick={() => onBlockUser(otherMemberId)} disabled={!otherMemberId || isBlocked}>
            {isBlocked ? "Blocked" : "Block user"}
          </button>
        </>
      ) : null}
      {isDirectChat ? null : (
        <>
          <hr />
          <h4>MEMBERS - {roomUsers.length}</h4>
          <div className="details-members">
            {roomUsers.map((member) => {
              const memberId = member.id || member._id;
              const canKick = isAdmin && memberId !== currentUser?.id && memberId !== creatorId;
              const avatarUrl = toAttachmentUrl(member.avatarUrl);
              const displayName = member.displayName || member.username;
              const isOnline = member.presenceStatus === "online" || member.online;
              return (
                <div className="details-member-row" key={memberId}>
                  <div className="member-avatar-wrap">
                    <span className={`member-avatar ${avatarUrl ? "image" : ""}`} style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}>
                      {!avatarUrl ? displayName.slice(0, 2).toUpperCase() : null}
                    </span>
                    <span className={isOnline ? "member-dot online" : "member-dot offline"} />
                  </div>
                  <span className="member-name name-with-badge">
                    {displayName}
                    {isVerifiedUser(member) ? <VerifiedBadge /> : null}
                  </span>
                  {canKick ? <button type="button" className="member-kick" onClick={() => onKickMember(activeRoom._id, memberId)}>x</button> : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}

