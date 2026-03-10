import React from "react";

export default function CreateChatRoomForm({ form, onChange, onSubmit, loading }) {
  return (
    <form onSubmit={onSubmit} className="room-form">
      <label>Room Name<input type="text" value={form.name} onChange={(e) => onChange("name", e.target.value)} minLength={2} required /></label>
      <label>Description<input type="text" value={form.description} onChange={(e) => onChange("description", e.target.value)} maxLength={200} /></label>
      <label>
        Room Type
        <div className="room-type-row" role="radiogroup" aria-label="Room type">
          <button
            type="button"
            className={form.roomType === "normal" ? "room-type-chip active" : "room-type-chip"}
            onClick={() => onChange("roomType", "normal")}
          >
            Normal Chat
          </button>
          <button
            type="button"
            className={form.roomType === "voice" ? "room-type-chip active" : "room-type-chip"}
            onClick={() => onChange("roomType", "voice")}
          >
            Voice Chat
          </button>
        </div>
      </label>
      <label className="switch-row">
        <span>Private Room</span>
        <span className="switch-control">
          <input type="checkbox" checked={form.isPrivate} onChange={(e) => onChange("isPrivate", e.target.checked)} />
          <span className="switch-slider" />
        </span>
      </label>
      <button className="primary-btn" disabled={loading} type="submit">{loading ? "Creating..." : "Create Room"}</button>
    </form>
  );
}
