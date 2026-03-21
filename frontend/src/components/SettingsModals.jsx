import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

function ModalShell({ open, title, onClose, children, footer }) {
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
        </div>
        <div className="room-form modal-body-scroll">
          {children}
        </div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

export function ProfileModal({ open, onClose, onSave, initialProfile }) {
  const [form, setForm] = useState({ displayName: "", bio: "", avatarFile: null });
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      displayName: initialProfile?.displayName || initialProfile?.username || "",
      bio: initialProfile?.bio || "",
      avatarFile: null
    });
    setPreview(initialProfile?.avatarUrl || "");
    setError("");
  }, [initialProfile, open]);

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setForm((prev) => ({ ...prev, avatarFile: file }));
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err?.message || "Unable to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} title="Edit profile" onClose={onClose} footer={
      <button type="button" className="primary-btn" onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
    }>
      <label>
        Display name
        <input type="text" value={form.displayName} onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))} maxLength={50} required />
      </label>
      <label>
        Bio
        <textarea
          className="modal-textarea"
          rows={3}
          value={form.bio}
          onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
          maxLength={240}
        />
      </label>
      <label className="modal-file-row">
        <input type="file" className="modal-file-input" accept="image/*" onChange={onFileChange} />
        <span>Profile photo</span>
      </label>
      {preview ? <img src={preview} alt="Avatar preview" className="modal-avatar-preview" /> : null}
      {error ? <p className="danger-text">{error}</p> : null}
    </ModalShell>
  );
}

export function UsernameModal({ open, onClose, onSave, currentUsername }) {
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setUsername(currentUsername || "");
    setError("");
  }, [currentUsername, open]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(username);
      onClose();
    } catch (err) {
      setError(err?.message || "Unable to update username");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} title="Update username" onClose={onClose} footer={
      <button type="button" className="primary-btn" onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : "Save username"}</button>
    }>
      <p className="muted">Usernames must be 3-30 characters and unique.</p>
      <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} />
      {error ? <p className="danger-text">{error}</p> : null}
    </ModalShell>
  );
}

export function StatusModal({ open, onClose, onSave, initialStatus }) {
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setText(initialStatus?.text || "");
    setEmoji(initialStatus?.emoji || "");
    setError("");
  }, [initialStatus, open]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({ text, emoji });
      onClose();
    } catch (err) {
      setError(err?.message || "Unable to save status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} title="Set your status" onClose={onClose} footer={
      <button type="button" className="primary-btn" onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : "Save status"}</button>
    }>
      <label>
        Status text
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="In the wave..." maxLength={64} />
      </label>
      <label>
        Emoji
        <input type="text" value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder={"\u{1F30A}"} maxLength={4} />
      </label>
      <p className="muted">Short text or emoji to share your vibe. Updates broadcast in real-time.</p>
      {error ? <p className="danger-text">{error}</p> : null}
    </ModalShell>
  );
}

export function BlockedModal({ open, onClose, blocked = [], onUnblock }) {
  return (
    <ModalShell open={open} title="Blocked users" onClose={onClose}>
      {blocked.length === 0 ? <p className="muted">No blocked users.</p> : (
        <div className="modal-list">
          {blocked.map((user) => (
            <div key={user.id || user._id} className="settings-item settings-item-split">
              <span><strong>{user.displayName || user.username}</strong></span>
              <button type="button" className="ghost-btn" onClick={() => onUnblock(user.id || user._id)}>Unblock</button>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

export function VisibilityModal({ open, onClose, value, onSelect }) {
  const options = [
    { id: "public", label: "Public", description: "Anyone can view your profile." },
    { id: "friends", label: "Friends only", description: "Only mutual follows can view your profile." },
    { id: "invisible", label: "Invisible", description: "Hide profile details from others." }
  ];

  return (
    <ModalShell open={open} title="Who can see me?" onClose={onClose}>
      <div className="modal-list-wide">
        {options.map((option) => (
          <label key={option.id} className="settings-item settings-item-split">
            <span>
              <strong>{option.label}</strong>
              <small className="modal-item-note">{option.description}</small>
            </span>
            <input type="radio" checked={value === option.id} onChange={() => onSelect(option.id)} />
          </label>
        ))}
      </div>
    </ModalShell>
  );
}

export function DataSharingModal({ open, onClose, enabled, onToggle }) {
  return (
    <ModalShell open={open} title="Data sharing" onClose={onClose}>
      <p className="muted">Control analytics and personalization. When off, Wavvy will avoid sending analytics events.</p>
      <label className="checkbox-row">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        <span>{enabled ? "Enabled" : "Disabled"}</span>
      </label>
    </ModalShell>
  );
}

export function ReportModal({ open, onClose, onSubmit }) {
  const [category, setCategory] = useState("bug");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setCategory("bug");
      setDescription("");
      setError("");
    }
  }, [open]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSending(true);
    try {
      await onSubmit({ category, description });
      onClose();
    } catch (err) {
      setError(err?.message || "Unable to send report");
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalShell open={open} title="Report a problem" onClose={onClose} footer={
      <button type="button" className="primary-btn" onClick={handleSubmit} disabled={sending}>{sending ? "Sending..." : "Send report"}</button>
    }>
      <label>
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="bug">Bug</option>
          <option value="abuse">Abuse</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        Description
        <textarea className="modal-textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      </label>
      {error ? <p className="danger-text">{error}</p> : null}
    </ModalShell>
  );
}

export function MyRoomsModal({ open, onClose, rooms = [], onSelectRoom }) {
  return (
    <ModalShell open={open} title="My rooms" onClose={onClose}>
      {rooms.length ? rooms.map((room) => (
        <button key={room._id} type="button" className="settings-item" onClick={() => { onSelectRoom?.(room); onClose(); }}>
          <span>
            <strong>{room.name}</strong>
            <small>{room.description || "chat room"}</small>
          </span>
          <span>{room.members?.length || 0} members</span>
        </button>
      )) : <p className="muted">No rooms yet.</p>}
    </ModalShell>
  );
}

export function FollowersModal({ open, onClose, followers = [], following = [], onUnfollow }) {
  const [tab, setTab] = useState("followers");

  const list = tab === "followers" ? followers : following;

  return (
    <ModalShell open={open} title="Connections" onClose={onClose}>
      <div className="modal-tab-row">
        <button type="button" className={tab === "followers" ? "primary-btn" : "ghost-btn"} onClick={() => setTab("followers")}>Followers</button>
        <button type="button" className={tab === "following" ? "primary-btn" : "ghost-btn"} onClick={() => setTab("following")}>Following</button>
      </div>
      <div className="modal-list modal-list-spaced">
        {list.length ? list.map((user) => (
          <div key={user.id || user._id} className="settings-item settings-item-split">
            <span>{user.displayName || user.username}</span>
            {tab === "following" ? (
              <button type="button" className="ghost-btn" onClick={() => onUnfollow(user.id || user._id)}>Unfollow</button>
            ) : null}
          </div>
        )) : <p className="muted">No users in this list.</p>}
      </div>
    </ModalShell>
  );
}

export function DiscoverPrefsModal({ open, onClose, filters = { waves: [], people: [], topics: [] }, onSave }) {
  const [state, setState] = useState({ waves: "", people: "", topics: "" });

  useEffect(() => {
    setState({
      waves: (filters.waves || []).join(", "),
      people: (filters.people || []).join(", "),
      topics: (filters.topics || []).join(", ")
    });
  }, [filters, open]);

  const parseList = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave({
      waves: parseList(state.waves),
      people: parseList(state.people),
      topics: parseList(state.topics)
    });
    onClose();
  };

  return (
    <ModalShell open={open} title="Discover preferences" onClose={onClose} footer={
      <button type="button" className="primary-btn" onClick={handleSubmit}>Save filters</button>
    }>
      <label>
        Waves (comma separated)
        <input type="text" value={state.waves} onChange={(e) => setState((prev) => ({ ...prev, waves: e.target.value }))} />
      </label>
      <label>
        People
        <input type="text" value={state.people} onChange={(e) => setState((prev) => ({ ...prev, people: e.target.value }))} />
      </label>
      <label>
        Topics
        <input type="text" value={state.topics} onChange={(e) => setState((prev) => ({ ...prev, topics: e.target.value }))} />
      </label>
    </ModalShell>
  );
}

const LANGUAGE_OPTIONS = [
  { id: "aa", label: "Afar" },
  { id: "ab", label: "Abkhazian" },
  { id: "af", label: "Afrikaans" },
  { id: "ak", label: "Akan" },
  { id: "sq", label: "Albanian" },
  { id: "am", label: "Amharic" },
  { id: "ar", label: "Arabic" },
  { id: "an", label: "Aragonese" },
  { id: "hy", label: "Armenian" },
  { id: "as", label: "Assamese" },
  { id: "av", label: "Avaric" },
  { id: "ae", label: "Avestan" },
  { id: "ay", label: "Aymara" },
  { id: "az", label: "Azerbaijani" },
  { id: "ba", label: "Bashkir" },
  { id: "bm", label: "Bambara" },
  { id: "eu", label: "Basque" },
  { id: "be", label: "Belarusian" },
  { id: "bn", label: "Bengali" },
  { id: "bh", label: "Bihari" },
  { id: "bi", label: "Bislama" },
  { id: "bs", label: "Bosnian" },
  { id: "br", label: "Breton" },
  { id: "bg", label: "Bulgarian" },
  { id: "my", label: "Burmese" },
  { id: "ca", label: "Catalan" },
  { id: "km", label: "Central Khmer" },
  { id: "ch", label: "Chamorro" },
  { id: "ce", label: "Chechen" },
  { id: "ny", label: "Chichewa" },
  { id: "zh", label: "Chinese" },
  { id: "cu", label: "Church Slavic" },
  { id: "cv", label: "Chuvash" },
  { id: "kw", label: "Cornish" },
  { id: "co", label: "Corsican" },
  { id: "cr", label: "Cree" },
  { id: "hr", label: "Croatian" },
  { id: "cs", label: "Czech" },
  { id: "da", label: "Danish" },
  { id: "dv", label: "Divehi" },
  { id: "nl", label: "Dutch" },
  { id: "dz", label: "Dzongkha" },
  { id: "en", label: "English" },
  { id: "eo", label: "Esperanto" },
  { id: "et", label: "Estonian" },
  { id: "ee", label: "Ewe" },
  { id: "fo", label: "Faroese" },
  { id: "fj", label: "Fijian" },
  { id: "fi", label: "Finnish" },
  { id: "fr", label: "Français" },
  { id: "ff", label: "Fulah" },
  { id: "gd", label: "Gaelic" },
  { id: "gl", label: "Galician" },
  { id: "lg", label: "Ganda" },
  { id: "ka", label: "Georgian" },
  { id: "de", label: "German" },
  { id: "el", label: "Greek" },
  { id: "gn", label: "Guarani" },
  { id: "gu", label: "Gujarati" },
  { id: "ht", label: "Haitian" },
  { id: "ha", label: "Hausa" },
  { id: "he", label: "Hebrew" },
  { id: "hz", label: "Herero" },
  { id: "hi", label: "Hindi" },
  { id: "ho", label: "Hiri Motu" },
  { id: "hu", label: "Hungarian" },
  { id: "is", label: "Icelandic" },
  { id: "io", label: "Ido" },
  { id: "ig", label: "Igbo" },
  { id: "id", label: "Indonesian" },
  { id: "ia", label: "Interlingua" },
  { id: "ie", label: "Interlingue" },
  { id: "iu", label: "Inuktitut" },
  { id: "ik", label: "Inupiaq" },
  { id: "ga", label: "Irish" },
  { id: "it", label: "Italian" },
  { id: "ja", label: "Japanese" },
  { id: "jv", label: "Javanese" },
  { id: "kl", label: "Kalaallisut" },
  { id: "kn", label: "Kannada" },
  { id: "kr", label: "Kanuri" },
  { id: "ks", label: "Kashmiri" },
  { id: "kk", label: "Kazakh" },
  { id: "ki", label: "Kikuyu" },
  { id: "rw", label: "Kinyarwanda" },
  { id: "ky", label: "Kirghiz" },
  { id: "kv", label: "Komi" },
  { id: "kg", label: "Kongo" },
  { id: "ko", label: "Korean" },
  { id: "kj", label: "Kuanyama" },
  { id: "ku", label: "Kurdish" },
  { id: "lo", label: "Lao" },
  { id: "la", label: "Latin" },
  { id: "lv", label: "Latvian" },
  { id: "li", label: "Limburgan" },
  { id: "ln", label: "Lingala" },
  { id: "lt", label: "Lithuanian" },
  { id: "lu", label: "Luba-Katanga" },
  { id: "lb", label: "Luxembourgish" },
  { id: "mk", label: "Macedonian" },
  { id: "mg", label: "Malagasy" },
  { id: "ms", label: "Malay" },
  { id: "ml", label: "Malayalam" },
  { id: "mt", label: "Maltese" },
  { id: "gv", label: "Manx" },
  { id: "mi", label: "Maori" },
  { id: "mr", label: "Marathi" },
  { id: "mh", label: "Marshallese" },
  { id: "mn", label: "Mongolian" },
  { id: "na", label: "Nauru" },
  { id: "nv", label: "Navajo" },
  { id: "nd", label: "North Ndebele" },
  { id: "ng", label: "Ndonga" },
  { id: "ne", label: "Nepali" },
  { id: "se", label: "Northern Sami" },
  { id: "no", label: "Norwegian" },
  { id: "nn", label: "Norwegian Nynorsk" },
  { id: "oc", label: "Occitan" },
  { id: "oj", label: "Ojibwa" },
  { id: "or", label: "Oriya" },
  { id: "om", label: "Oromo" },
  { id: "os", label: "Ossetian" },
  { id: "pi", label: "Pali" },
  { id: "ps", label: "Pashto" },
  { id: "fa", label: "Persian" },
  { id: "pl", label: "Polish" },
  { id: "pt", label: "Portuguese" },
  { id: "pa", label: "Punjabi" },
  { id: "qu", label: "Quechua" },
  { id: "ro", label: "Romanian" },
  { id: "rm", label: "Romansh" },
  { id: "rn", label: "Rundi" },
  { id: "ru", label: "Russian" },
  { id: "sm", label: "Samoan" },
  { id: "sg", label: "Sango" },
  { id: "sa", label: "Sanskrit" },
  { id: "sc", label: "Sardinian" },
  { id: "sr", label: "Serbian" },
  { id: "sn", label: "Shona" },
  { id: "ii", label: "Sichuan Yi" },
  { id: "sd", label: "Sindhi" },
  { id: "si", label: "Sinhala" },
  { id: "sk", label: "Slovak" },
  { id: "sl", label: "Slovenian" },
  { id: "so", label: "Somali" },
  { id: "nr", label: "South Ndebele" },
  { id: "st", label: "Southern Sotho" },
  { id: "es", label: "Español" },
  { id: "su", label: "Sundanese" },
  { id: "sw", label: "Swahili" },
  { id: "ss", label: "Swati" },
  { id: "sv", label: "Swedish" },
  { id: "tl", label: "Tagalog" },
  { id: "ty", label: "Tahitian" },
  { id: "tg", label: "Tajik" },
  { id: "ta", label: "Tamil" },
  { id: "tt", label: "Tatar" },
  { id: "te", label: "Telugu" },
  { id: "th", label: "Thai" },
  { id: "bo", label: "Tibetan" },
  { id: "ti", label: "Tigrinya" },
  { id: "to", label: "Tonga" },
  { id: "ts", label: "Tsonga" },
  { id: "tn", label: "Tswana" },
  { id: "tr", label: "Turkish" },
  { id: "tk", label: "Turkmen" },
  { id: "tw", label: "Twi" },
  { id: "ug", label: "Uighur" },
  { id: "uk", label: "Ukrainian" },
  { id: "ur", label: "Urdu" },
  { id: "uz", label: "Uzbek" },
  { id: "ve", label: "Venda" },
  { id: "vi", label: "Vietnamese" },
  { id: "vo", label: "Volapük" },
  { id: "wa", label: "Walloon" },
  { id: "cy", label: "Welsh" },
  { id: "fy", label: "Western Frisian" },
  { id: "wo", label: "Wolof" },
  { id: "xh", label: "Xhosa" },
  { id: "yi", label: "Yiddish" },
  { id: "yo", label: "Yoruba" },
  { id: "za", label: "Zhuang" },
  { id: "zu", label: "Zulu" }
];

export function LanguageModal({ open, onClose, value, onSelect }) {
  return (
    <ModalShell open={open} title="Choose language" onClose={onClose}>
      <div className="modal-list modal-scroll-pad">
        {LANGUAGE_OPTIONS.map((lang) => (
          <label
            key={lang.id}
            className="settings-item settings-item-split language-option language-option-row"
            data-selected={value === lang.id}
            onClick={() => onSelect(lang.id)}
          >
            <span>{lang.label}</span>
            <input
              type="radio"
              name="language"
              checked={value === lang.id}
              onChange={() => onSelect(lang.id)}
            />
          </label>
        ))}
      </div>
    </ModalShell>
  );
}

export function AboutModal({ open, onClose, about }) {
  const details = useMemo(() => about || {}, [about]);
  return (
    <ModalShell open={open} title="About Wavvy" onClose={onClose}>
      <p><strong>{details.name || "Wavvy"}</strong></p>
      <p className="muted">Version {details.version || "1.0.0"}</p>
    </ModalShell>
  );
}
