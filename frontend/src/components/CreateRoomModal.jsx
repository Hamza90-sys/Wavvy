import React, { useState } from "react";
import CreateChatRoomForm from "./CreateChatRoomForm";

export default function CreateRoomModal({ open, onClose, onCreate }) {
  const [form, setForm] = useState({ name: "", description: "", isPrivate: false });
  const [loading, setLoading] = useState(false);
  if (!open) return null;

  const onChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await onCreate(form);
      setForm({ name: "", description: "", isPrivate: false });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head"><h3>Create Chat Room</h3><button className="modal-close-link" onClick={onClose} type="button">Close</button></div>
        <CreateChatRoomForm form={form} onChange={onChange} onSubmit={onSubmit} loading={loading} />
      </div>
    </div>
  );
}
