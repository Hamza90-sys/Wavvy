import React, { useEffect, useMemo, useRef, useState } from "react";
import ProfilePhotoCropModal from "./ProfilePhotoCropModal";
import SettingsPanel from "./SettingsPanel";

const API_URL = process.env.REACT_APP_API_URL || "";
const API_BASE = API_URL.replace(/\/api\/?$/, "");

const toAttachmentUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};

function DetailShell({ title, subtitle, onBack, children, footer }) {
  return (
    <section className="settings-panel glass">
      <header className="settings-detail-head">
        <button type="button" className="ghost-btn settings-back-btn" onClick={onBack} aria-label="Back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <div>
          <p className="eyebrow">Settings</p>
          <h2>{title}</h2>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
      </header>
      <div className="settings-detail-body">{children}</div>
      {footer ? <div className="settings-detail-footer">{footer}</div> : null}
    </section>
  );
}

export default function SettingsWorkspace({
  settings,
  user,
  blockedUsers,
  myRoomsData,
  followers,
  following,
  aboutInfo,
  onUpdateSettings,
  onLogout,
  onOpenLanguage,
  onLoadBlockedUsers,
  onLoadMyRooms,
  onLoadConnections,
  onLoadAbout,
  onSaveProfile,
  onSaveUsername,
  onSaveStatus,
  onUnblock,
  onVisibilityChange,
  onToggleAnalytics,
  onReport,
  onUnfollow,
  onFollowBack,
  onRemoveFollower,
  onBlockUser,
  onStartMessage,
  onDiscoverSave,
  onOpenHelp,
  onOpenTerms,
  onSelectRoom,
  onExitSettings
}) {
  const [view, setView] = useState("index");
  const [profileForm, setProfileForm] = useState({ displayName: "", bio: "", avatarFile: null });
  const [profilePreview, setProfilePreview] = useState("");
  const [username, setUsername] = useState("");
  const [statusText, setStatusText] = useState("");
  const [statusEmoji, setStatusEmoji] = useState("");
  const [reportCategory, setReportCategory] = useState("bug");
  const [reportDescription, setReportDescription] = useState("");
  const [discoverState, setDiscoverState] = useState({ waves: "", people: "", topics: "" });
  const [connectionsTab, setConnectionsTab] = useState("followers");
  const [connectionsQuery, setConnectionsQuery] = useState("");
  const [activeConnectionMenuId, setActiveConnectionMenuId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [pendingCropImage, setPendingCropImage] = useState("");
  const profileFileInputRef = useRef(null);
  const profileObjectUrlRef = useRef(null);
  const pendingCropUrlRef = useRef(null);

  useEffect(() => {
    setUsername(user?.username || "");
    setStatusText(user?.status?.text || "");
    setStatusEmoji(user?.status?.emoji || "");
    setDiscoverState({
      waves: (settings?.discoverFilters?.waves || []).join(", "),
      people: (settings?.discoverFilters?.people || []).join(", "),
      topics: (settings?.discoverFilters?.topics || []).join(", ")
    });
  }, [user?.username, user?.status?.text, user?.status?.emoji, settings?.discoverFilters]);

  useEffect(() => {
    if (view !== "profile") return;
    setProfileForm({
      displayName: user?.displayName || user?.username || "",
      bio: user?.bio || "",
      avatarFile: null
    });
    setProfilePreview(toAttachmentUrl(user?.avatarUrl) || "");
    if (profileObjectUrlRef.current) {
      URL.revokeObjectURL(profileObjectUrlRef.current);
      profileObjectUrlRef.current = null;
    }
  }, [view, user?.id, user?.displayName, user?.username, user?.bio, user?.avatarUrl]);

  useEffect(() => () => {
    if (profileObjectUrlRef.current) {
      URL.revokeObjectURL(profileObjectUrlRef.current);
    }
    if (pendingCropUrlRef.current) {
      URL.revokeObjectURL(pendingCropUrlRef.current);
    }
  }, []);

  const navigate = (nextView, loader) => {
    setError("");
    setView(nextView);
    if (!loader) {
      return;
    }
    Promise.resolve(loader()).catch(() => {
      setError("Unable to load this section right now.");
    });
  };

  const submitWithState = async (action, onSuccess) => {
    setSubmitting(true);
    setError("");
    try {
      await action();
      onSuccess?.();
    } catch (err) {
      setError(err?.message || "Unable to save changes.");
    } finally {
      setSubmitting(false);
    }
  };

  const parseList = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);

  const connectionsList = useMemo(
    () => (connectionsTab === "followers" ? followers : following),
    [connectionsTab, followers, following]
  );
  const followingIds = useMemo(
    () => new Set((following || []).map((connection) => connection.id || connection._id).filter(Boolean)),
    [following]
  );
  const filteredConnections = useMemo(() => {
    const query = connectionsQuery.trim().toLowerCase().replace(/^@/, "");
    if (!query) return connectionsList;
    return connectionsList.filter((connection) => {
      const label = `${connection.displayName || ""} ${connection.username || ""} ${connection.id || connection._id || ""}`
        .toLowerCase()
        .replace(/^@/, "");
      return label.includes(query);
    });
  }, [connectionsList, connectionsQuery]);
  const myCreatedRooms = useMemo(() => {
    const currentUserId = user?.id || user?._id;
    if (!currentUserId) return [];
    return (myRoomsData || []).filter((room) => {
      const creatorId = room?.createdBy?._id || room?.createdBy?.id || room?.createdBy;
      const memberCount = room?.members?.length || 0;
      const isDirectChat = (Boolean(room?.isPrivate) && memberCount === 2) || (room?.name || "").toLowerCase().startsWith("dm-");
      return String(creatorId || "") === String(currentUserId) && !isDirectChat;
    });
  }, [myRoomsData, user?.id, user?._id]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!event.target.closest(".connections-menu")) {
        setActiveConnectionMenuId(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  if (view === "index") {
    return (
      <SettingsPanel
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        onLogout={onLogout}
        onEditProfile={() => navigate("profile")}
        onChangeUsername={() => navigate("username")}
        onEditStatus={() => navigate("status")}
        onOpenBlocked={() => navigate("blocked", onLoadBlockedUsers)}
        onOpenVisibility={() => navigate("visibility")}
        onOpenDataSharing={() => navigate("dataSharing")}
        onReportProblem={() => navigate("report")}
        onOpenMyRooms={() => navigate("myRooms", onLoadMyRooms)}
        onOpenDiscoverPrefs={() => navigate("discover")}
        onOpenHelp={() => navigate("help")}
        onOpenAbout={() => navigate("about", onLoadAbout)}
        onOpenTerms={() => navigate("terms")}
        onOpenLanguage={onOpenLanguage}
        onOpenConnections={() => navigate("connections", onLoadConnections)}
      />
    );
  }

  if (view === "profile") {
    const profileInitials = (profileForm.displayName || user?.username || "WV").trim().slice(0, 2).toUpperCase();
    return (
      <DetailShell
        title="Edit Profile"
        subtitle="Update your name, bio, and avatar."
        onBack={() => setView("index")}
        footer={<button type="button" className="primary-btn" onClick={() => submitWithState(() => onSaveProfile(profileForm), () => setView("index"))} disabled={submitting}>{submitting ? "Saving..." : "Save changes"}</button>}
      >
        <div className="profile-settings-layout">
          <div className="profile-avatar-stack">
            <button
              type="button"
              className="profile-avatar-picker"
              onClick={() => profileFileInputRef.current?.click()}
              aria-label="Choose profile photo"
            >
              {profilePreview ? (
                <img src={profilePreview} alt="Avatar preview" className="settings-avatar-preview" />
              ) : (
                <span className="profile-avatar-fallback">{profileInitials}</span>
              )}
            </button>
            <button type="button" className="profile-avatar-action" onClick={() => profileFileInputRef.current?.click()}>
              Change photo
            </button>
          </div>
          <input
            ref={profileFileInputRef}
            type="file"
            accept="image/*"
            className="settings-file-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (pendingCropUrlRef.current) {
                URL.revokeObjectURL(pendingCropUrlRef.current);
              }
              const cropSourceUrl = URL.createObjectURL(file);
              pendingCropUrlRef.current = cropSourceUrl;
              setPendingCropImage(cropSourceUrl);
              setCropModalOpen(true);
              event.target.value = "";
            }}
          />
          <label className="settings-field profile-name-field">
            <span>Display name</span>
            <input type="text" value={profileForm.displayName} onChange={(e) => setProfileForm((prev) => ({ ...prev, displayName: e.target.value }))} maxLength={50} />
          </label>
          <label className="settings-field profile-bio-field">
            <span>Bio</span>
            <textarea rows={5} value={profileForm.bio} onChange={(e) => setProfileForm((prev) => ({ ...prev, bio: e.target.value }))} maxLength={240} />
          </label>
        </div>
        {error ? <p className="danger-text">{error}</p> : null}
        <ProfilePhotoCropModal
          open={cropModalOpen}
          imageSrc={pendingCropImage}
          onClose={() => {
            setCropModalOpen(false);
            setPendingCropImage("");
            if (pendingCropUrlRef.current) {
              URL.revokeObjectURL(pendingCropUrlRef.current);
              pendingCropUrlRef.current = null;
            }
          }}
          onSave={(croppedFile) => {
            if (profileObjectUrlRef.current) {
              URL.revokeObjectURL(profileObjectUrlRef.current);
            }
            const previewUrl = URL.createObjectURL(croppedFile);
            profileObjectUrlRef.current = previewUrl;
            setProfileForm((prev) => ({ ...prev, avatarFile: croppedFile }));
            setProfilePreview(previewUrl);
            setCropModalOpen(false);
            setPendingCropImage("");
            if (pendingCropUrlRef.current) {
              URL.revokeObjectURL(pendingCropUrlRef.current);
              pendingCropUrlRef.current = null;
            }
          }}
        />
      </DetailShell>
    );
  }

  if (view === "username") {
    return (
      <DetailShell
        title="Username / Handle"
        subtitle="Set a unique public handle."
        onBack={() => setView("index")}
        footer={<button type="button" className="primary-btn" onClick={() => submitWithState(() => onSaveUsername(username), () => setView("index"))} disabled={submitting}>{submitting ? "Saving..." : "Save username"}</button>}
      >
        <label className="settings-field">
          <span>Username</span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} />
        </label>
        <p className="muted">Usernames must be 3-30 characters and unique.</p>
        {error ? <p className="danger-text">{error}</p> : null}
      </DetailShell>
    );
  }

  if (view === "status") {
    return (
      <DetailShell
        title="Status / Mood"
        subtitle="Share your current vibe in real time."
        onBack={() => setView("index")}
        footer={<button type="button" className="primary-btn" onClick={() => submitWithState(() => onSaveStatus({ text: statusText, emoji: statusEmoji }), () => setView("index"))} disabled={submitting}>{submitting ? "Saving..." : "Save status"}</button>}
      >
        <label className="settings-field">
          <span>Status text</span>
          <input type="text" value={statusText} onChange={(e) => setStatusText(e.target.value)} maxLength={64} />
        </label>
        <label className="settings-field">
          <span>Emoji</span>
          <input type="text" value={statusEmoji} onChange={(e) => setStatusEmoji(e.target.value)} maxLength={4} />
        </label>
        {error ? <p className="danger-text">{error}</p> : null}
      </DetailShell>
    );
  }

  if (view === "blocked") {
    return (
      <DetailShell title="Blocked Users" subtitle="Manage people you have blocked." onBack={() => setView("index")}>
        <div className="settings-list-block">
          {blockedUsers.length ? blockedUsers.map((blockedUser) => (
            <div key={blockedUser.id || blockedUser._id} className="settings-item static">
              <span className="settings-text"><strong>{blockedUser.displayName || blockedUser.username}</strong></span>
              <button type="button" className="ghost-btn" onClick={() => onUnblock(blockedUser.id || blockedUser._id)}>Unblock</button>
            </div>
          )) : <p className="muted">No blocked users.</p>}
        </div>
      </DetailShell>
    );
  }

  if (view === "visibility") {
    const options = [
      { id: "public", label: "Public", description: "Anyone can view your profile." },
      { id: "friends", label: "Friends only", description: "Only mutual follows can view your profile." },
      { id: "invisible", label: "Invisible", description: "Hide profile details from others." }
    ];
    return (
      <DetailShell title="Who Can See Me" subtitle="Control profile visibility." onBack={() => setView("index")}>
        <div className="settings-list-block">
          {options.map((option) => (
            <label key={option.id} className="settings-item static settings-choice">
              <span className="settings-text">
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              <input type="radio" checked={settings.visibility === option.id} onChange={() => onVisibilityChange(option.id)} />
            </label>
          ))}
        </div>
      </DetailShell>
    );
  }

  if (view === "dataSharing") {
    return (
      <DetailShell title="Data Sharing" subtitle="Analytics and personalization controls." onBack={() => setView("index")}>
        <div className="settings-list-block">
          <label className="settings-item static settings-choice">
            <span className="settings-text">
              <strong>Analytics</strong>
              <small>Allow Wavvy to send product analytics events.</small>
            </span>
            <input type="checkbox" checked={settings.analytics} onChange={(e) => onToggleAnalytics(e.target.checked)} />
          </label>
        </div>
      </DetailShell>
    );
  }

  if (view === "report") {
    return (
      <DetailShell
        title="Report A Problem"
        subtitle="Send feedback or report an issue."
        onBack={() => setView("index")}
        footer={<button type="button" className="primary-btn" onClick={() => submitWithState(() => onReport({ category: reportCategory, description: reportDescription }), () => { setReportCategory("bug"); setReportDescription(""); setView("index"); })} disabled={submitting}>{submitting ? "Sending..." : "Send report"}</button>}
      >
        <label className="settings-field">
          <span>Category</span>
          <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)}>
            <option value="bug">Bug</option>
            <option value="abuse">Abuse</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="settings-field">
          <span>Description</span>
          <textarea rows={5} value={reportDescription} onChange={(e) => setReportDescription(e.target.value)} maxLength={500} />
        </label>
        {error ? <p className="danger-text">{error}</p> : null}
      </DetailShell>
    );
  }

  if (view === "myRooms") {
    return (
      <DetailShell title="My Rooms" subtitle="Rooms you created." onBack={() => setView("index")}>
        <div className="settings-list-block">
          {myCreatedRooms.length ? myCreatedRooms.map((room) => (
            <button
              key={room._id}
              type="button"
              className="settings-item"
              onClick={async () => {
                await onSelectRoom(room);
                onExitSettings?.();
              }}
            >
              <span className="settings-text">
                <strong>{room.name}</strong>
                <small>{room.description || "chat room"}</small>
              </span>
              <span className="settings-trailing">{room.members?.length || 0} members</span>
            </button>
          )) : <p className="muted">No created rooms yet.</p>}
        </div>
      </DetailShell>
    );
  }

  if (view === "connections") {
    return (
      <DetailShell title="Connections" subtitle="Followers and people you follow." onBack={() => setView("index")}>
        <div className="connections-panel">
          <div className="connections-toolbar compact">
            <div className="connections-tabs">
              <button
                type="button"
                className={connectionsTab === "followers" ? "connections-tab active" : "connections-tab"}
                onClick={() => setConnectionsTab("followers")}
              >
                Followers ({followers?.length || 0})
              </button>
              <button
                type="button"
                className={connectionsTab === "following" ? "connections-tab active" : "connections-tab"}
                onClick={() => setConnectionsTab("following")}
              >
                Following ({following?.length || 0})
              </button>
            </div>
          </div>
          <label className="connections-search compact">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={connectionsQuery}
              onChange={(event) => setConnectionsQuery(event.target.value)}
              placeholder={`Search ${connectionsTab}`}
              aria-label="Search connections"
            />
          </label>
        </div>
        <div className="connections-list">
          {filteredConnections.length ? filteredConnections.map((connection) => {
            const connectionId = connection.id || connection._id;
            const avatarUrl = toAttachmentUrl(connection.avatarUrl);
            const displayName = connection.displayName || connection.username || "User";
            const statusTextValue = connection.status?.text || connection.statusText || "";
            const isFollowingBack = connectionId && followingIds.has(connectionId);
            return (
              <div key={connectionId || displayName} className="connections-item">
                <div className="connections-left">
                  <div className="connections-avatar">
                    {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : <span>{displayName.slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <div className="connections-meta">
                    <strong>{displayName}</strong>
                    {statusTextValue ? <small>{statusTextValue}</small> : null}
                  </div>
                </div>
                <div className="connections-actions">
                  {connectionsTab === "followers" ? (
                    isFollowingBack ? (
                      <button type="button" className="ghost-btn" disabled>Following</button>
                    ) : (
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => {
                          if (onFollowBack && connectionId) onFollowBack(connectionId);
                        }}
                      >
                        Follow Back
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        if (connectionId) onUnfollow?.(connectionId);
                      }}
                    >
                      Following ✓
                    </button>
                  )}
                  <div className="connections-menu">
                    <button
                      type="button"
                      className="connections-menu-btn"
                      aria-label="More actions"
                      onClick={() => setActiveConnectionMenuId((prev) => (prev === connectionId ? null : connectionId))}
                    >
                      <span aria-hidden="true">⋯</span>
                    </button>
                    {activeConnectionMenuId === connectionId ? (
                      <div className="connections-menu-panel" role="menu">
                        <button
                          type="button"
                          onClick={() => {
                            if (connectionId) window.location.href = `/user/${connectionId}`;
                            setActiveConnectionMenuId(null);
                          }}
                        >
                          View Profile
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (onStartMessage && connectionId) onStartMessage(connectionId);
                            setActiveConnectionMenuId(null);
                          }}
                        >
                          Send Message
                        </button>
                        {connectionsTab === "followers" ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (onRemoveFollower && connectionId) onRemoveFollower(connectionId);
                              setActiveConnectionMenuId(null);
                            }}
                          >
                            Remove Follower
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (connectionId) onUnfollow?.(connectionId);
                              setActiveConnectionMenuId(null);
                            }}
                          >
                            Unfollow
                          </button>
                        )}
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            if (onBlockUser && connectionId) onBlockUser(connectionId);
                            setActiveConnectionMenuId(null);
                          }}
                        >
                          Block User
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          }) : (
            <p className="muted">
              {connectionsTab === "followers" ? "No one is following you yet." : "You are not following anyone yet."}
            </p>
          )}
        </div>
      </DetailShell>
    );
  }

  if (view === "discover") {
    return (
      <DetailShell
        title="Discover Preferences"
        subtitle="Tune waves, people, and topics."
        onBack={() => setView("index")}
        footer={<button type="button" className="primary-btn" onClick={() => submitWithState(() => onDiscoverSave({ waves: parseList(discoverState.waves), people: parseList(discoverState.people), topics: parseList(discoverState.topics) }), () => setView("index"))} disabled={submitting}>{submitting ? "Saving..." : "Save filters"}</button>}
      >
        <label className="settings-field">
          <span>Waves</span>
          <input type="text" value={discoverState.waves} onChange={(e) => setDiscoverState((prev) => ({ ...prev, waves: e.target.value }))} />
        </label>
        <label className="settings-field">
          <span>People</span>
          <input type="text" value={discoverState.people} onChange={(e) => setDiscoverState((prev) => ({ ...prev, people: e.target.value }))} />
        </label>
        <label className="settings-field">
          <span>Topics</span>
          <input type="text" value={discoverState.topics} onChange={(e) => setDiscoverState((prev) => ({ ...prev, topics: e.target.value }))} />
        </label>
        {error ? <p className="danger-text">{error}</p> : null}
      </DetailShell>
    );
  }

  if (view === "help") {
    return (
      <DetailShell title="Help Center" subtitle="Support, FAQs, and troubleshooting." onBack={() => setView("index")}>
        <div className="settings-inline-card">
          <strong>Open the Help Center</strong>
          <p className="muted">Launch the FAQ page in a new tab when you need support guides.</p>
          <button type="button" className="primary-btn" onClick={onOpenHelp}>Open Help Center</button>
        </div>
      </DetailShell>
    );
  }

  if (view === "terms") {
    return (
      <DetailShell title="Terms & Privacy" subtitle="Legal documents and privacy information." onBack={() => setView("index")}>
        <div className="settings-inline-card">
          <strong>By using Wavvy, you agree to use the platform responsibly and respectfully.</strong>
          <p className="muted">User Responsibility</p>
          <ul className="settings-list-block">
            <li>Users must not send harmful or abusive content.</li>
            <li>Users must not spam other users.</li>
            <li>Users must not share illegal material.</li>
          </ul>
          <p className="muted">Privacy</p>
          <p>Wavvy respects your privacy. Your messages and personal information are handled securely and are not shared with third parties without your consent.</p>
          <p className="muted">Data Usage</p>
          <p>Wavvy may store basic account information such as username, profile picture, and messages to provide the service.</p>
          <p className="muted">Updates</p>
          <p>These terms may be updated in the future to improve the service. If you have any questions, please contact us.</p>
        </div>
      </DetailShell>
    );
  }

  return (
    <DetailShell title="About Wavvy" subtitle="App information and version details." onBack={() => setView("index")}>
      <div className="settings-inline-card">
        <strong>{aboutInfo?.name === "wavvy-chat-backend" ? "Wavvy chat" : (aboutInfo?.name || "Wavvy")}</strong>
        <p>Wavvy is a modern messaging platform designed to make communication simple, fast, and beautiful.</p>
        <p className="muted">Our goal is to provide users with a clean and enjoyable chat experience while keeping conversations private and secure.</p>
        <p>With Wavvy, users can:</p>
        <ul className="settings-list-block">
          <li>Send messages instantly.</li>
          <li>Share photos and media.</li>
          <li>Customize their chat experience with themes.</li>
          <li>Connect with friends in a smooth and modern interface.</li>
        </ul>
        <p>Wavvy focuses on simplicity, speed, and design to create a messaging experience that feels natural and enjoyable.</p>
        <p className="muted">Version {aboutInfo?.version || "1.0.0"}</p>
        <p className="muted">Built with love by Hamza Chargui</p>
      </div>
    </DetailShell>
  );
}
