import React, { useEffect, useMemo, useState } from "react";

export default function CallWindow({
  activeRoom,
  callState,
  socketConnected,
  callControls,
  participants,
  messages,
  currentUser,
  onSendChat,
  onAcceptIncoming,
  onRejectIncoming,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onEndCall,
  onCloseWindow,
  localVideoRef,
  remoteVideoRef
}) {
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [chatDraft, setChatDraft] = useState("");
  const [showSpeakerGlow, setShowSpeakerGlow] = useState(true);
  const [endingCall, setEndingCall] = useState(false);
  const callRoomLabel = useMemo(() => {
    const members = activeRoom?.members || [];
    const isDirectChat = Boolean(activeRoom?.isPrivate) && members.length === 2;
    if (isDirectChat) {
      const otherMember = members.find((member) => (member._id || member.id) !== currentUser?.id);
      return otherMember?.displayName || otherMember?.username || "Direct chat";
    }
    return activeRoom?.name || "Room unavailable";
  }, [activeRoom, currentUser?.id]);
  const waitingForParticipant = callState?.awaitingPeer || (!callState?.inCall && !callState?.incoming);
  const showIncomingOnly = Boolean(callState?.incoming && !callState?.inCall && !callState?.connecting);
  const recentMessages = useMemo(() => (messages || []).slice(-40), [messages]);
  const status = useMemo(() => {
    if (waitingForParticipant) return { tone: "waiting", text: "Waiting for participant" };
    if (callState?.inCall && !socketConnected) return { tone: "reconnecting", text: "Reconnecting..." };
    if (callState?.inCall) return { tone: "connected", text: "Connected" };
    return { tone: "connecting", text: "Connecting..." };
  }, [callState?.inCall, socketConnected, waitingForParticipant]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!callState?.inCall || !remoteVideoRef?.current) {
      setIsRemoteSpeaking(false);
      return undefined;
    }

    const remoteEl = remoteVideoRef.current;
    const stream = remoteEl.srcObject;
    if (!stream) return undefined;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return undefined;

    let rafId = null;
    let sourceNode;
    let analyser;
    const context = new AudioCtx();
    const data = new Uint8Array(64);

    try {
      sourceNode = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 128;
      sourceNode.connect(analyser);
      const detect = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i];
        const avg = sum / data.length;
        setIsRemoteSpeaking(avg > 18);
        rafId = window.requestAnimationFrame(detect);
      };
      detect();
    } catch (_error) {
      context.close().catch(() => undefined);
      return undefined;
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (sourceNode) sourceNode.disconnect();
      if (analyser) analyser.disconnect();
      context.close().catch(() => undefined);
    };
  }, [callState?.inCall, remoteVideoRef]);

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 1400);
    } catch (_error) {
      window.prompt("Copy invite link:", window.location.href);
    }
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }
    await document.exitFullscreen();
  };

  const submitChatMessage = async () => {
    const text = chatDraft.trim();
    if (!text) return;
    await onSendChat?.(text);
    setChatDraft("");
  };

  const handleEndCall = async () => {
    if (endingCall) return;
    setEndingCall(true);
    try {
      await Promise.resolve(onEndCall?.());
    } finally {
      window.setTimeout(() => {
        window.close();
      }, 900);
    }
  };

  if (endingCall) {
    return (
      <main className="call-only-shell call-ending-shell">
        <div className="call-only-bg" aria-hidden="true" />
        <section className="call-ending-card">
          <h2>Call ending...</h2>
          <p>Wrapping things up. You can close this tab safely.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="call-only-shell">
      <div className="call-only-bg" aria-hidden="true" />
      <section className="call-window">
        <header className="call-window-head">
          <div className="call-window-meta">
            <span className={`call-window-chip ${status.tone}`}>{status.text}</span>
            <strong>{callState?.callType === "video" ? "Video call" : "Voice call"}</strong>
            <span>{callRoomLabel}</span>
          </div>
          <div className="call-window-presence">
            <button type="button" className="call-window-close" onClick={onCloseWindow}>
              Close tab
            </button>
            <button type="button" className="call-window-fullscreen" onClick={toggleFullscreen}>
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
            <span className={`presence-dot ${status.tone}`} aria-hidden="true" />
            {status.text}
          </div>
        </header>

        {callState?.incoming ? (
          <div className={`call-window-incoming${showIncomingOnly ? " compact" : ""}`}>
            <span>
              {callState.incoming.fromName} is calling ({callState.incoming.callType === "video" ? "video" : "audio"})
            </span>
            <div className="call-window-incoming-actions">
              <button type="button" className="cw-incoming-btn accept" onClick={onAcceptIncoming}>Accept</button>
              <button type="button" className="cw-incoming-btn reject" onClick={onRejectIncoming}>Reject</button>
            </div>
          </div>
        ) : null}

        {!showIncomingOnly ? (
          <div className="call-window-stage">
          {callState?.callType === "video" ? (
            <>
              <div className={`call-window-remote ${showSpeakerGlow && isRemoteSpeaking ? "speaking" : ""}`}>
                <video ref={remoteVideoRef} autoPlay playsInline className="cw-video remote" />
                <span className="cw-tag">Remote</span>
                {waitingForParticipant ? (
                  <div className="call-window-waiting">
                    <h2>Waiting for participant...</h2>
                    <p>Share the invite link to start the call.</p>
                    <button type="button" className="cw-copy-link" onClick={copyInviteLink}>
                      {copiedInvite ? "Copied" : "Copy Invite Link"}
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="call-window-local">
                <video ref={localVideoRef} autoPlay playsInline muted className="cw-video local" />
                <span className="cw-tag">{callControls?.cameraOff ? "Camera off" : "You"}</span>
              </div>
            </>
          ) : (
            <div className="call-window-audio">
              <div className="cw-wave" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <p>{callState?.inCall ? "Voice channel active" : "Voice channel standby"}</p>
              <audio ref={remoteVideoRef} autoPlay style={{ display: "none" }} />
            </div>
          )}
          </div>
        ) : null}

        {activePanel ? (
          <aside className="call-side-panel">
            <header className="call-side-head">
              <strong>{activePanel === "chat" ? "In-call chat" : activePanel === "participants" ? "Participants" : "Call settings"}</strong>
              <button type="button" onClick={() => setActivePanel(null)}>Close</button>
            </header>
            {activePanel === "chat" ? (
              <>
                <div className="call-side-content chat">
                  {recentMessages.length ? recentMessages.map((message) => {
                    const author = message.user?.displayName || message.user?.username || "Unknown";
                    const mine = (message.user?.id || message.user?._id) === currentUser?.id;
                    return (
                      <article key={message._id || `${message.createdAt}-${message.content}`} className={mine ? "call-chat-msg own" : "call-chat-msg"}>
                        <strong>{author}</strong>
                        <p>{message.content || "[attachment]"}</p>
                        <small>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                      </article>
                    );
                  }) : <p className="call-side-empty">No messages yet.</p>}
                </div>
                <div className="call-chat-compose">
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submitChatMessage().catch(() => undefined);
                    }}
                    placeholder="Send a message..."
                  />
                  <button type="button" onClick={() => submitChatMessage().catch(() => undefined)}>Send</button>
                </div>
              </>
            ) : null}
            {activePanel === "participants" ? (
              <div className="call-side-content">
                {(participants || []).map((member) => (
                  <div key={member.id || member._id || member.username} className="call-participant-row">
                    <span className={member.online ? "part-dot online" : "part-dot"} aria-hidden="true" />
                    <span>{member.displayName || member.username || "Member"}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {activePanel === "settings" ? (
              <div className="call-side-content">
                <label className="call-setting-row">
                  <span>Speaker activity glow</span>
                  <input
                    type="checkbox"
                    checked={showSpeakerGlow}
                    onChange={(event) => setShowSpeakerGlow(event.target.checked)}
                  />
                </label>
                <label className="call-setting-row">
                  <span>Auto copy invite helper</span>
                  <button type="button" className="inline-copy-btn" onClick={() => copyInviteLink().catch(() => undefined)}>
                    {copiedInvite ? "Copied" : "Copy Invite Link"}
                  </button>
                </label>
              </div>
            ) : null}
          </aside>
        ) : null}

        {!showIncomingOnly ? (
          <footer className="call-window-controls">
          <button type="button" className={callControls?.micMuted ? "cw-ctl muted" : "cw-ctl"} onClick={onToggleMic} title={callControls?.micMuted ? "Unmute microphone" : "Mute microphone"}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 19v3M8 22h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {callState?.callType === "video" ? (
            <button type="button" className={callControls?.cameraOff ? "cw-ctl muted" : "cw-ctl"} onClick={onToggleCamera} title={callControls?.cameraOff ? "Turn camera on" : "Turn camera off"}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="6" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M16 10 21 7v10l-5-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className={callControls?.sharingScreen ? "cw-ctl muted" : "cw-ctl"}
            title={callControls?.sharingScreen ? "Stop sharing screen" : "Share screen"}
            onClick={onToggleScreenShare}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className={activePanel === "chat" ? "cw-ctl active" : "cw-ctl"} title="Open chat" onClick={() => setActivePanel((prev) => (prev === "chat" ? null : "chat"))}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 5h16v10H7l-3 3V5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className={activePanel === "participants" ? "cw-ctl active" : "cw-ctl"} title="Participants list" onClick={() => setActivePanel((prev) => (prev === "participants" ? null : "participants"))}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
              <path d="M3 19a6 6 0 0 1 12 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M17 8h4M17 12h4M17 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className={activePanel === "settings" ? "cw-ctl active" : "cw-ctl"} title="Settings" onClick={() => setActivePanel((prev) => (prev === "settings" ? null : "settings"))}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="currentColor" strokeWidth="2" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 1 1-2.82 2.82l-.05-.05a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V22a2 2 0 1 1-4 0v-.08a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.05.05a2 2 0 1 1-2.82-2.82l.05-.05a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H2a2 2 0 1 1 0-4h.08a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.05-.05a2 2 0 1 1 2.82-2.82l.05.05a1.7 1.7 0 0 0 1.87.34h0A1.7 1.7 0 0 0 9 2.08V2a2 2 0 1 1 4 0v.08a1.7 1.7 0 0 0 1 1.55h0a1.7 1.7 0 0 0 1.87-.34l.05-.05a2 2 0 1 1 2.82 2.82l-.05.05a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.55 1H22a2 2 0 1 1 0 4h-.08a1.7 1.7 0 0 0-1.55 1z" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
          <button type="button" className="cw-ctl end" onClick={handleEndCall} title="End call">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21 15v-2a3 3 0 0 0-3-3h-2a15 15 0 0 0-8 0H6a3 3 0 0 0-3 3v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          </footer>
        ) : null}
      </section>
    </main>
  );
}
