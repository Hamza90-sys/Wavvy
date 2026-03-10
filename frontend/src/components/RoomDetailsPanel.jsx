import React from "react";

const API_URL = process.env.REACT_APP_API_URL || "";
const API_BASE = API_URL.replace(/\/api\/?$/, "");

const toAttachmentUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};
const roomTypeLabel = (roomType) => (roomType === "voice" ? "Voice chat" : "");

export default function RoomDetailsPanel({ activeRoom, roomUsers, currentUser, onKickMember }) {
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

  const creatorId = activeRoom.createdBy?._id || activeRoom.createdBy?.id || activeRoom.createdBy;
  const isAdmin = activeRoom.admins?.some((admin) => (admin._id || admin.id) === currentUser?.id) || creatorId === currentUser?.id;
  const roomAvatarUrl = toAttachmentUrl(activeRoom.avatarUrl);

  return (
    <aside className="room-details glass">
      <div
        className={`details-avatar ${roomAvatarUrl ? "image" : ""}`}
        style={!roomAvatarUrl ? undefined : { backgroundImage: `url(${roomAvatarUrl})` }}
        aria-hidden="true"
      >
        {!roomAvatarUrl ? activeRoom.name?.slice(0, 2).toUpperCase() : null}
      </div>
      <h3>{activeRoom.name}</h3>
      {activeRoom.description ? <p>{activeRoom.description}</p> : null}
      {roomTypeLabel(activeRoom.roomType) ? <p className="room-details-type">{roomTypeLabel(activeRoom.roomType)}</p> : null}
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
              <span className="member-name">{displayName}</span>
              {canKick ? <button type="button" className="member-kick" onClick={() => onKickMember(activeRoom._id, memberId)}>x</button> : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

