import React, { useCallback, useEffect, useRef, useState } from "react";

export default function MessageForm({ onSend, draftInjection, onTypingStart = () => {}, onTypingStop = () => {} }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiPickerLib, setEmojiPickerLib] = useState(null);
  const [emojiData, setEmojiData] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedVoice, setRecordedVoice] = useState(null);
  const [recordingError, setRecordingError] = useState("");
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const emojiPopoverRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingActiveRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const recorderStopTimeoutRef = useRef(null);
  const sendAfterStopRef = useRef(false);
  const recordingSecondsRef = useRef(0);
  const recordingStartedAtRef = useRef(0);
  const onTypingStopRef = useRef(onTypingStop);

  const formatTimer = (seconds) => {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0));
    const mm = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
    const ss = String(safeSeconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const stopRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const clearRecorderStopTimeout = useCallback(() => {
    if (recorderStopTimeoutRef.current) {
      clearTimeout(recorderStopTimeoutRef.current);
      recorderStopTimeoutRef.current = null;
    }
  }, []);

  const stopRecordingTracks = useCallback(() => {
    recordingStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }, []);

  const resetRecordingState = useCallback(() => {
    sendAfterStopRef.current = false;
    setIsRecording(false);
    recordingStartedAtRef.current = 0;
    clearRecorderStopTimeout();
    stopRecordingTimer();
    stopRecordingTracks();
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
  }, [clearRecorderStopTimeout, stopRecordingTimer, stopRecordingTracks]);

  const submitVoiceFile = useCallback(
    async (voice) => {
      if (!voice?.file) return;
      const voiceMeta = [{
        fileName: voice.file.name,
        duration: voice.duration || 0
      }];
      await onSend({ content: "", files: [voice.file], voiceMeta });
      setRecordedVoice(null);
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;
    },
    [onSend]
  );

  const sendRecordedVoice = useCallback(async () => {
    if (!recordedVoice?.file) return;
    setSending(true);
    try {
      await submitVoiceFile(recordedVoice);
    } finally {
      setSending(false);
    }
  }, [recordedVoice, submitVoiceFile]);

  const finalizeRecording = useCallback(
    async (blob) => {
      if (!blob || blob.size < 180) {
        setRecordingError("Recording is too short. Hold a bit longer and try again.");
        setRecordedVoice(null);
        return;
      }
      const extension = blob.type.includes("ogg") ? "ogg" : "webm";
      const fileName = `voice-${Date.now()}.${extension}`;
      const file = new File([blob], fileName, { type: blob.type || "audio/webm" });
      const duration = Math.max(1, recordingSecondsRef.current || 0);
      const payload = {
        file,
        duration
      };
      setRecordingError("");
      setRecordedVoice(payload);
      if (sendAfterStopRef.current) {
        setSending(true);
        try {
          await submitVoiceFile(payload);
        } finally {
          setSending(false);
        }
      }
    },
    [submitVoiceFile]
  );

  const stopRecorder = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "inactive") return;
    const elapsed = Date.now() - (recordingStartedAtRef.current || 0);
    const minElapsed = 420;
    if (elapsed > 0 && elapsed < minElapsed) {
      const waitMs = minElapsed - elapsed;
      clearRecorderStopTimeout();
      recorderStopTimeoutRef.current = window.setTimeout(() => {
        if (recorder.state === "inactive") return;
        try {
          recorder.requestData?.();
        } catch (_error) {
          // Ignore requestData errors; stop still runs.
        }
        window.setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
        }, 200);
        recorderStopTimeoutRef.current = null;
      }, waitMs);
      return;
    }
    try {
      recorder.requestData?.();
    } catch (_error) {
      // Ignore requestData errors; stop still runs.
    }
    clearRecorderStopTimeout();
    recorderStopTimeoutRef.current = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
      recorderStopTimeoutRef.current = null;
    }, 220);
  }, [clearRecorderStopTimeout]);

  const cancelRecording = useCallback(() => {
    sendAfterStopRef.current = false;
    setRecordedVoice(null);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    stopRecorder();
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      resetRecordingState();
    }
  }, [resetRecordingState, stopRecorder]);

  const sendWhileRecording = useCallback(() => {
    if (!isRecording) {
      sendRecordedVoice().catch(() => undefined);
      return;
    }
    sendAfterStopRef.current = true;
    stopRecorder();
  }, [isRecording, sendRecordedVoice, stopRecorder]);

  const startRecording = useCallback(async () => {
    if (isRecording || sending) return;
    setRecordingError("");
    setRecordedVoice(null);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    sendAfterStopRef.current = false;
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      onTypingStop();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const preferredMime =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
            ? "audio/ogg;codecs=opus"
            : "";

      const recorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        resetRecordingState();
        finalizeRecording(blob).catch(() => undefined);
      };

      recorder.onerror = () => {
        setRecordingError("Unable to record audio.");
        resetRecordingState();
      };

      recorder.start(250);
      setIsRecording(true);
      recordingStartedAtRef.current = Date.now();
      recordingTimerRef.current = window.setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
      }, 1000);
    } catch (_error) {
      setRecordingError("Microphone permission is required.");
      resetRecordingState();
    }
  }, [finalizeRecording, isRecording, onTypingStop, resetRecordingState, sending]);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (!typingActiveRef.current) return;
    typingActiveRef.current = false;
    onTypingStop();
  }, [onTypingStop]);

  const scheduleTyping = useCallback(() => {
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      onTypingStart();
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      typingTimeoutRef.current = null;
      onTypingStop();
    }, 2000);
  }, [onTypingStart, onTypingStop]);

  useEffect(() => {
    onTypingStopRef.current = onTypingStop;
  }, [onTypingStop]);

  useEffect(() => {
    if (!emojiOpen) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (emojiPopoverRef.current?.contains(target) || emojiButtonRef.current?.contains(target)) {
        return;
      }
      setEmojiOpen(false);
    };
    const onEscape = (event) => {
      if (event.key === "Escape") setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [emojiOpen]);

  useEffect(() => {
    if (!emojiOpen || (emojiPickerLib && emojiData)) return;
    let mounted = true;
    Promise.all([
      import("@emoji-mart/react"),
      import("@emoji-mart/data")
    ]).then(([pickerLib, dataLib]) => {
      if (!mounted) return;
      setEmojiPickerLib(() => pickerLib.default);
      setEmojiData(dataLib.default);
    });
    return () => {
      mounted = false;
    };
  }, [emojiOpen, emojiPickerLib, emojiData]);

  useEffect(() => {
    if (!draftInjection?.text) return;
    setText(draftInjection.text);
    scheduleTyping();
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(draftInjection.text.length, draftInjection.text.length);
    }
  }, [draftInjection, scheduleTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        onTypingStopRef.current?.();
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch (_error) {
          // Ignore shutdown errors during unmount.
        }
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      recordingStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    };
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const voiceFiles = recordedVoice?.file ? [recordedVoice.file] : [];
    if (!text.trim() && !files.length && !voiceFiles.length) return;

    setSending(true);
    stopTyping();
    const combinedFiles = [...files, ...voiceFiles];
    const voiceMeta = recordedVoice?.file
      ? [{
        fileName: recordedVoice.file.name,
        duration: recordedVoice.duration || 0
      }]
      : [];

    Promise.resolve(onSend({ content: text, files: combinedFiles, voiceMeta }))
      .then(() => {
        setText("");
        setFiles([]);
        setRecordedVoice(null);
        setRecordingSeconds(0);
        recordingSecondsRef.current = 0;
        if (fileInputRef.current) fileInputRef.current.value = "";
      })
      .finally(() => setSending(false));
  };

  const onDrop = (event) => {
    event.preventDefault();
    const dropped = Array.from(event.dataTransfer.files || []).slice(0, 5);
    if (!dropped.length) return;
    setFiles(dropped);
  };

  const onEmojiSelect = (emoji) => {
    const nativeEmoji = emoji?.native || "";
    if (!nativeEmoji) return;
    const input = inputRef.current;
    if (!input) {
      setText((prev) => `${prev}${nativeEmoji}`);
      return;
    }
    const start = input.selectionStart ?? text.length;
    const end = input.selectionEnd ?? text.length;
    const nextText = `${text.slice(0, start)}${nativeEmoji}${text.slice(end)}`;
    setText(nextText);
    window.requestAnimationFrame(() => {
      const cursor = start + nativeEmoji.length;
      input.focus();
      input.setSelectionRange(cursor, cursor);
    });
  };

  const voiceMode = Boolean(isRecording || recordedVoice?.file);
  const voiceTimer = formatTimer(isRecording ? recordingSeconds : recordedVoice?.duration || 0);

  return (
    <form className={`message-form${voiceMode ? " voice-mode" : ""}`} onSubmit={submit}>
      {voiceMode ? (
        <div className="voice-recording-shell">
          <button type="button" className="voice-cancel-btn" onClick={cancelRecording} disabled={sending} aria-label="Cancel voice message">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <div className="voice-recording-track" role="status" aria-live="polite">
            <button
              type="button"
              className={`voice-stop-btn ${isRecording ? "live" : "ready"}`}
              onClick={() => {
                if (isRecording) {
                  stopRecorder();
                } else {
                  sendRecordedVoice().catch(() => undefined);
                }
              }}
              disabled={sending}
              aria-label={isRecording ? "Stop recording" : "Send recorded voice message"}
            >
              {isRecording ? <span className="voice-stop-square" /> : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <div className="voice-track-fill" />
            <span className="voice-track-time">{voiceTimer}</span>
          </div>

          <button type="button" className="voice-send-link" onClick={sendWhileRecording} disabled={sending}>
            Send
          </button>
        </div>
      ) : (
        <>
          <div className="message-input-shell" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
            <button
              ref={emojiButtonRef}
              type="button"
              className="input-icon-btn"
              aria-label="Insert emoji"
              onClick={() => setEmojiOpen((prev) => !prev)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>
            {emojiOpen ? (
              <div ref={emojiPopoverRef} className="emoji-picker-popover">
                {emojiPickerLib && emojiData ? React.createElement(emojiPickerLib, {
                  data: emojiData,
                  onEmojiSelect,
                  theme: "auto",
                  previewPosition: "none",
                  skinTonePosition: "search",
                  navPosition: "bottom",
                  searchPosition: "sticky",
                  perLine: 9,
                  maxFrequentRows: 2
                }) : <div className="emoji-picker-loading">Loading emojis...</div>}
              </div>
            ) : null}

            <button
              type="button"
              className="input-icon-btn"
              aria-label="Attach files"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21.44 11.05 12 20.5a5.5 5.5 0 0 1-7.78-7.78l10-10a3.5 3.5 0 0 1 4.95 4.95L8.5 18.5a1.5 1.5 0 0 1-2.12-2.12l9-9" />
              </svg>
            </button>

            <input
              ref={inputRef}
              type="text"
              placeholder="Type a message..."
              value={text}
              onChange={(event) => {
                const nextValue = event.target.value;
                setText(nextValue);
                if (nextValue.trim()) {
                  scheduleTyping();
                } else {
                  stopTyping();
                }
              }}
              maxLength={1000}
              className="msg-text-input"
            />
            <button
              type="button"
              className={`input-icon-btn mic-btn ${isRecording ? "recording" : ""}`}
              aria-label="Record voice message"
              onClick={startRecording}
              disabled={isRecording || sending}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
                <path d="M19 11a7 7 0 0 1-14 0" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="file-input-hidden"
              onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 5))}
            />
            {files.length || recordedVoice?.file ? (
              <small className="attach-hint">
                {files.length} file(s) ready
                {recordedVoice?.file ? ` + voice ${formatTimer(recordedVoice.duration || 0)}` : ""}
              </small>
            ) : null}
          </div>
          <button className="primary-btn send-btn" type="submit" disabled={sending} aria-label="Send message">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m22 2-7 20-4-9-9-4z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </>
      )}
      {recordingError ? <small className="attach-hint error-text">{recordingError}</small> : null}
    </form>
  );
}
