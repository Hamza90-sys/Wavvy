import axios from "axios";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatInterface from "../components/ChatInterface";
import CallWindow from "../components/CallWindow";
import CreateRoomModal from "../components/CreateRoomModal";
import DiscoverDetailPanel from "../components/DiscoverDetailPanel";
import DiscoverPanel from "../components/DiscoverPanel";
import { LanguageModal } from "../components/SettingsModals";
import SettingsWorkspace from "../components/SettingsWorkspace";
import MobileChatApp from "../components/mobile/MobileChatApp";
import RoomDetailsPanel from "../components/RoomDetailsPanel";
import RoomSettingsModal from "../components/RoomSettingsModal";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/I18nContext";

const API_URL = process.env.REACT_APP_API_URL || "";
const TURN_URLS = (process.env.REACT_APP_TURN_URLS || "").split(",").map((entry) => entry.trim()).filter(Boolean);
const TURN_USERNAME = process.env.REACT_APP_TURN_USERNAME || "";
const TURN_CREDENTIAL = process.env.REACT_APP_TURN_CREDENTIAL || "";
const getIceServers = () => {
  const servers = [{ urls: "stun:stun.l.google.com:19302" }];
  if (TURN_URLS.length) {
    servers.push({
      urls: TURN_URLS,
      username: TURN_USERNAME,
      credential: TURN_CREDENTIAL
    });
  }
  return servers;
};
const defaultPreferences = {
  notifications: { mentions: true, invites: true, waveAlerts: false },
  device: { sounds: true, haptics: true },
  analytics: false,
  language: "en",
  visibility: "friends",
  discoverFilters: { waves: [], people: [], topics: [] }
};

const normalizePreferences = (prefs = {}) => ({
  ...defaultPreferences,
  ...prefs,
  notifications: { ...defaultPreferences.notifications, ...(prefs.notifications || {}) },
  device: { ...defaultPreferences.device, ...(prefs.device || {}) },
  discoverFilters: { ...defaultPreferences.discoverFilters, ...(prefs.discoverFilters || {}) }
});

const mergePreferences = (prev, patch) => normalizePreferences({
  ...prev,
  ...patch,
  notifications: { ...prev.notifications, ...(patch.notifications || {}) },
  device: { ...prev.device, ...(patch.device || {}) },
  discoverFilters: { ...prev.discoverFilters, ...(patch.discoverFilters || {}) }
});

export default function ChatPage() {
  const { token, user, logout, setUser } = useAuth();
  const { socket, connected } = useSocket();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useI18n();
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadByRoom, setUnreadByRoom] = useState({});
  const [roomUsers, setRoomUsers] = useState([]);
  const [roomMedia, setRoomMedia] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingRoomMedia, setLoadingRoomMedia] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [activePane, setActivePane] = useState("chat");
  const [userSettings, setUserSettings] = useState(() => {
    if (typeof window === "undefined") return defaultPreferences;
    try {
      const stored = JSON.parse(localStorage.getItem("wavvy_settings") || "{}");
      return normalizePreferences(stored);
    } catch {
      return defaultPreferences;
    }
  });
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= 920);
  const [callState, setCallState] = useState({
    connecting: false,
    inCall: false,
    callType: null,
    incoming: null,
    awaitingPeer: false
  });
  const [callControls, setCallControls] = useState({ micMuted: false, cameraOff: false, sharingScreen: false });
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [myRoomsData, setMyRoomsData] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [pendingFollowIds, setPendingFollowIds] = useState({});
  const [discoverPeople, setDiscoverPeople] = useState([]);
  const [discoverPeopleLoading, setDiscoverPeopleLoading] = useState(false);
  const [aboutInfo, setAboutInfo] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [typingUsers, setTypingUsers] = useState([]);
  const [discoverSelection, setDiscoverSelection] = useState(null);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const activeRoomIdRef = useRef(null);
  const latestDiscoverSearchRef = useRef("");
  const isCallOnlyMode = useMemo(() => new URLSearchParams(window.location.search).get("callOnly") === "1", []);
  const initialLaunchParams = (() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("callRoom");
    const callType = params.get("callType");
    return roomId && (callType === "audio" || callType === "video")
      ? { roomId, callType, launched: false }
      : null;
  })();
  const launchParamsRef = useRef(initialLaunchParams);
  const currentCallRef = useRef({
    roomId: null,
    targetUserId: null,
    callType: null
  });

  const api = useMemo(() => axios.create({ baseURL: API_URL, headers: { Authorization: `Bearer ${token}` } }), [token]);
  const mapRoomUsers = useCallback(
    (users) => (users || []).map((member) => ({
      id: member._id || member.id,
      username: member.username,
      displayName: member.displayName || member.username,
      avatarColor: member.avatarColor,
      avatarUrl: member.avatarUrl,
      status: member.status,
      presenceStatus: member.presenceStatus || (member.online ? "online" : "offline"),
      lastSeen: member.lastSeen || null,
      visibility: member.visibility,
      online: Boolean(member.online)
    })),
    []
  );
  const loadProfile = useCallback(async () => {
    const { data } = await api.get("/users/me");
    const prefs = normalizePreferences(data.user?.preferences);
    setUser(data.user);
    setUserSettings(prefs);
    setLanguage(prefs.language || "en");
    localStorage.setItem("wavvy_settings", JSON.stringify(prefs));
    localStorage.setItem("wavvy_lang", prefs.language || "en");
  }, [api, setLanguage, setUser]);

  const loadBlockedUsers = useCallback(async () => {
    const { data } = await api.get("/users/blocked");
    setBlockedUsers(data.blocked || []);
  }, [api]);

  const loadConnections = useCallback(async () => {
    const [{ data: followersRes }, { data: followingRes }] = await Promise.all([
      api.get("/users/followers"),
      api.get("/users/following")
    ]);
    setFollowers(followersRes.followers || []);
    setFollowing(followingRes.following || []);
  }, [api]);

  const searchDiscoverPeople = useCallback(
    async (term) => {
      const trimmed = (term || "").trim();
      latestDiscoverSearchRef.current = trimmed;
      if (trimmed.length < 2) {
        setDiscoverPeople([]);
        return;
      }
      setDiscoverPeopleLoading(true);
      try {
        const { data } = await api.get("/users/search", { params: { q: trimmed } });
        if (latestDiscoverSearchRef.current === trimmed) {
          setDiscoverPeople(data.users || []);
        }
      } catch (_error) {
        if (latestDiscoverSearchRef.current === trimmed) {
          setDiscoverPeople([]);
        }
      } finally {
        if (latestDiscoverSearchRef.current === trimmed) {
          setDiscoverPeopleLoading(false);
        }
      }
    },
    [api]
  );

  const loadMyRooms = useCallback(async () => {
    const { data } = await api.get("/users/rooms");
    setMyRoomsData(data.rooms || []);
  }, [api]);

  const loadAbout = useCallback(async () => {
    const { data } = await api.get("/users/about");
    setAboutInfo(data);
  }, [api]);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const { data } = await api.get("/notifications");
      setNotifications(data.notifications || []);
      setUnreadNotifications(data.unreadCount || 0);
    } finally {
      setNotificationsLoading(false);
    }
  }, [api]);

  const openNotifications = useCallback(async () => {
    if (unreadNotifications > 0) {
      await api.patch("/notifications/read-all");
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadNotifications(0);
      return;
    }
    if (!notifications.length) {
      await loadNotifications();
    }
  }, [api, loadNotifications, notifications.length, unreadNotifications]);

  useEffect(() => {
    const onResize = () => setIsMobileView(window.innerWidth <= 920);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("wavvy_settings", JSON.stringify(userSettings));
    }
  }, [userSettings]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__wavvyAnalyticsDisabled = !userSettings.analytics;
    }
  }, [userSettings.analytics]);

  useEffect(() => {
    if (!token) return;
    loadProfile().catch(() => undefined);
  }, [token, loadProfile]);

  useEffect(() => {
    if (!token) return;
    loadConnections().catch(() => undefined);
  }, [token, loadConnections]);

  useEffect(() => {
    activeRoomIdRef.current = activeRoom?._id || null;
  }, [activeRoom]);

  const stopLocalMedia = useCallback(() => {
    screenStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    screenStreamRef.current = null;
    localStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  const closePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    pendingCandidatesRef.current = [];
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const cleanupCall = useCallback(
    (notifyPeer = false) => {
      const { roomId, targetUserId } = currentCallRef.current;
      if (notifyPeer && socket && roomId && targetUserId) {
        socket.emit("call:end", { roomId, targetUserId });
      }
      closePeerConnection();
      stopLocalMedia();
      currentCallRef.current = { roomId: null, targetUserId: null, callType: null };
      setCallState({ connecting: false, inCall: false, callType: null, incoming: null, awaitingPeer: false });
      setCallControls({ micMuted: false, cameraOff: false, sharingScreen: false });
    },
    [closePeerConnection, socket, stopLocalMedia]
  );

  const updateSettings = useCallback(
    async (patch) => {
      const next = mergePreferences(userSettings, patch);
      setUserSettings(next);
      localStorage.setItem("wavvy_settings", JSON.stringify(next));
      localStorage.setItem("wavvy_lang", next.language || "en");
      setLanguage(next.language || "en");
      try {
        await api.patch("/users/me/preferences", {
          notifications: next.notifications,
          device: next.device,
          language: next.language,
          analytics: next.analytics,
          visibility: next.visibility,
          discoverFilters: next.discoverFilters
        });
      } catch (_error) {
        window.alert("Unable to save preferences. Please try again.");
      }
    },
    [api, setLanguage, userSettings]
  );

  const saveProfile = async ({ displayName, bio, avatarFile }) => {
    try {
      const formData = new FormData();
      if (displayName) formData.append("displayName", displayName);
      if (bio !== undefined) formData.append("bio", bio);
      if (avatarFile) formData.append("avatar", avatarFile);
      const { data } = await api.patch("/users/me/profile", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setUser(data.user);
      setRoomUsers((prev) => prev.map((u) => (u.id === data.user.id ? { ...u, displayName: data.user.displayName, avatarUrl: data.user.avatarUrl } : u)));
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to update profile";
      throw new Error(message);
    }
  };

  const saveUsername = async (username) => {
    try {
      const { data } = await api.patch("/users/me/username", { username });
      setUser(data.user);
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to update username";
      throw new Error(message);
    }
  };

  const saveStatus = async (payload) => {
    try {
      const { data } = await api.patch("/users/me/status", payload);
      setUser(data.user);
      setRoomUsers((prev) => prev.map((u) => (u.id === data.user.id ? { ...u, status: data.user.status } : u)));
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to update status";
      throw new Error(message);
    }
  };

  const handleUnblock = async (userId) => {
    await api.delete(`/users/blocked/${userId}`);
    await loadBlockedUsers();
  };

  const handleBlockUser = useCallback(
    async (userId) => {
      if (!userId) return;
      await api.post(`/users/blocked/${userId}`);
      await loadBlockedUsers();
    },
    [api, loadBlockedUsers]
  );

  const handleVisibilityChange = async (value) => {
    await updateSettings({ visibility: value });
  };

  const handleToggleAnalytics = async (enabled) => {
    await updateSettings({ analytics: enabled });
  };

  const handleReport = async ({ category, description }) => {
    await api.post("/users/report", { category, description });
    window.alert("Thanks for your report. We'll look into it.");
  };

  const handleUnfollow = async (userId) => {
    await api.delete(`/users/follow/${userId}`);
    setPendingFollowIds((prev) => {
      if (!prev[userId]) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    await loadConnections();
  };

  const handleFollowUser = async (userId) => {
    const { data } = await api.post(`/users/follow/${userId}`);
    if (data.alreadyFollowing) {
      await loadConnections();
      return;
    }
    if (data.following) {
      await loadConnections();
      return;
    }
    if (data.requested) {
      setPendingFollowIds((prev) => ({ ...prev, [userId]: true }));
      window.alert("Follow request sent.");
    }
  };

  const handleDiscoverSave = async (filters) => {
    await updateSettings({ discoverFilters: filters });
  };

  const handleLanguageSelect = async (lang) => {
    await updateSettings({ language: lang });
    setLanguageModalOpen(false);
  };

  const ensurePeerConnection = useCallback(
    (roomId, targetUserId) => {
      if (peerConnectionRef.current) {
        return peerConnectionRef.current;
      }

      const peerConnection = new RTCPeerConnection({
        iceServers: getIceServers()
      });

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate || !socket) return;
        socket.emit("call:ice-candidate", {
          roomId,
          targetUserId,
          candidate: event.candidate
        });
      };

      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      };

      peerConnection.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(peerConnection.connectionState)) {
          cleanupCall(false);
        }
      };

      peerConnectionRef.current = peerConnection;
      return peerConnection;
    },
    [cleanupCall, socket]
  );

  const getActiveOutboundVideoTrack = useCallback(() => {
    const screenTrack = screenStreamRef.current?.getVideoTracks?.()[0];
    if (screenTrack) return screenTrack;
    return localStreamRef.current?.getVideoTracks?.()[0] || null;
  }, []);

  const attachLocalTracksToPeerConnection = useCallback((peerConnection) => {
    const stream = localStreamRef.current;
    if (!peerConnection || !stream) return;

    const audioTrack = stream.getAudioTracks?.()[0];
    const videoTrack = getActiveOutboundVideoTrack();
    const senders = peerConnection.getSenders();
    const hasAudioSender = senders.some((sender) => sender.track?.kind === "audio");
    const hasVideoSender = senders.some((sender) => sender.track?.kind === "video");

    if (audioTrack && !hasAudioSender) {
      peerConnection.addTrack(audioTrack, stream);
    }
    if (videoTrack && !hasVideoSender) {
      peerConnection.addTrack(videoTrack, stream);
    }
  }, [getActiveOutboundVideoTrack]);

  const startLocalMedia = useCallback(async (callType) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === "video"
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  }, []);

  useEffect(() => () => cleanupCall(false), [cleanupCall]);

  const startCall = useCallback(
    async (roomId, callType) => {
      if (!socket) return;
      if (callState.inCall || callState.connecting) return;

      const target = roomUsers.find((roomUser) => roomUser.id !== user?.id);

      try {
        setCallState({ connecting: true, inCall: false, callType, incoming: null, awaitingPeer: !target });
        setCallControls({ micMuted: false, cameraOff: callType !== "video", sharingScreen: false });
        currentCallRef.current = { roomId, targetUserId: target?.id || null, callType };

        await startLocalMedia(callType);
        if (target) {
          const peerConnection = ensurePeerConnection(roomId, target.id);
          attachLocalTracksToPeerConnection(peerConnection);
          socket.emit("call:invite", {
            roomId,
            targetUserId: target.id,
            callType
          });
        }
      } catch (error) {
        cleanupCall(false);
        window.alert("Unable to start call. Please allow microphone/camera access.");
      }
    },
    [socket, callState.inCall, callState.connecting, roomUsers, user, startLocalMedia, ensurePeerConnection, attachLocalTracksToPeerConnection, cleanupCall]
  );

  const loadRooms = useCallback(async () => {
    const { data } = await api.get("/chatrooms");
    const nextRooms = data.rooms || [];
    setRooms(nextRooms);
    setActiveRoom((prev) => {
      if (!prev) return prev;
      return nextRooms.find((room) => room._id === prev._id) || null;
    });
  }, [api]);

  const loadMessages = async (roomId) => {
    const { data } = await api.get(`/messages/${roomId}`);
    setMessages(data.messages || []);
  };

  const handleAcceptNotification = useCallback(
    async (notificationId) => {
      const { data } = await api.post(`/notifications/${notificationId}/accept`);
      const acceptedType = data.notification?.type;
      if (acceptedType === "FOLLOW_REQUEST") {
        setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
      } else {
        setNotifications((prev) =>
          prev.map((item) => (item.id === notificationId ? { ...item, ...(data.notification || {}), isRead: true } : item))
        );
      }
      setUnreadNotifications((prev) => Math.max(0, prev - 1));
      if (acceptedType === "JOIN_ROOM_REQUEST") {
        await loadRooms();
      }
      if (acceptedType === "FOLLOW_REQUEST") {
        await loadConnections();
      }
    },
    [api, loadConnections, loadRooms]
  );

  const handleDeclineNotification = useCallback(
    async (notificationId) => {
      const { data } = await api.post(`/notifications/${notificationId}/decline`);
      setNotifications((prev) =>
        prev.map((item) => (item.id === notificationId ? { ...item, ...(data.notification || {}), isRead: true } : item))
      );
      setUnreadNotifications((prev) => Math.max(0, prev - 1));
    },
    [api]
  );

  useEffect(() => {
    loadRooms().catch(() => undefined);
  }, [loadRooms]);

  useEffect(() => {
    if (!token) return;
    loadNotifications().catch(() => undefined);
  }, [token, loadNotifications]);

  useEffect(() => {
    const launch = launchParamsRef.current;
    if (!launch || launch.launched || !rooms.length) return;
    const room = rooms.find((r) => r._id === launch.roomId);
    if (!room) return;
    setActiveRoom(room);
  }, [rooms]);

  useEffect(() => {
    const launch = launchParamsRef.current;
    if (!launch || launch.launched || !activeRoom || activeRoom._id !== launch.roomId) return;
    launchParamsRef.current = { ...launch, launched: true };
    startCall(activeRoom._id, launch.callType);
  }, [activeRoom, startCall]);

  useEffect(() => {
    if (!isCallOnlyMode || !activeRoom?._id) return;
    setRoomUsers(mapRoomUsers(activeRoom.members || []));
    loadMessages(activeRoom._id).catch(() => undefined);
    socket?.emit("joinRoom", { roomId: activeRoom._id });
  }, [isCallOnlyMode, activeRoom, socket, mapRoomUsers]);

  useEffect(() => {
    if (!socket || !callState.connecting || callState.inCall) return;
    if (!currentCallRef.current.roomId || currentCallRef.current.targetUserId) return;

    const target = roomUsers.find((roomUser) => roomUser.id !== user?.id);
    if (!target) return;

    const { roomId, callType } = currentCallRef.current;
    currentCallRef.current = { roomId, targetUserId: target.id, callType };

    const stream = localStreamRef.current;
    if (stream) {
      const peerConnection = ensurePeerConnection(roomId, target.id);
      attachLocalTracksToPeerConnection(peerConnection);
    }

    socket.emit("call:invite", {
      roomId,
      targetUserId: target.id,
      callType
    });
    setCallState((prev) => ({ ...prev, awaitingPeer: false }));
  }, [socket, callState.connecting, callState.inCall, roomUsers, user, ensurePeerConnection, attachLocalTracksToPeerConnection]);

  useEffect(() => {
    if (isCallOnlyMode) return;
    if (activeRoom || !rooms.length) return;
    const roomToOpen = rooms.find((room) => room.members?.some((member) => (member._id || member.id) === user?.id));
    if (!roomToOpen) return;
    selectRoom(roomToOpen).catch(() => undefined);
  }, [rooms, activeRoom, user, isCallOnlyMode]);

  useEffect(() => {
    if (!socket) return;

    const onNewMessage = (message) => {
      if (message.room === activeRoom?._id) {
        setMessages((prev) => [...prev, message]);
        return;
      }
      setUnreadByRoom((prev) => ({ ...prev, [message.room]: (prev[message.room] || 0) + 1 }));
    };

    const onSystemMessage = (message) => {
      if (message.roomId !== activeRoom?._id) return;
      setMessages((prev) => [...prev, { ...message, system: true }]);
    };

    const onRoomUsers = ({ roomId, users }) => {
      if (roomId !== activeRoom?._id) return;
      setRoomUsers(mapRoomUsers(users));
    };

    const onTypingStart = ({ roomId, userId, username }) => {
      if (roomId !== activeRoomIdRef.current || userId === user?.id) return;
      setTypingUsers((prev) => {
        if (prev.some((entry) => entry.userId === userId)) return prev;
        return [...prev, { userId, username }];
      });
    };

    const onTypingStop = ({ roomId, userId }) => {
      if (roomId !== activeRoomIdRef.current) return;
      setTypingUsers((prev) => prev.filter((entry) => entry.userId !== userId));
    };

    const onPresenceUpdate = ({ userId, presenceStatus, lastSeen }) => {
      setRoomUsers((prev) =>
        prev.map((member) =>
          member.id === userId
            ? {
                ...member,
                presenceStatus,
                lastSeen: lastSeen || null,
                online: presenceStatus === "online"
              }
            : member
        )
      );
      if (user?.id === userId) {
        setUser((prev) => (prev ? { ...prev, presenceStatus, lastSeen: lastSeen || null } : prev));
      }
    };

    const onMessageReactionUpdated = ({ roomId, messageId, reactions }) => {
      if (roomId !== activeRoom?._id) return;
      setMessages((prev) => prev.map((message) => (message._id === messageId ? { ...message, reactions } : message)));
    };

    const onMessageDeleted = ({ roomId, messageId }) => {
      if (roomId !== activeRoom?._id) return;
      setMessages((prev) => prev.filter((message) => message._id !== messageId));
    };

    const onMessageEdited = ({ roomId, messageId, message: updatedMessage }) => {
      if (roomId !== activeRoom?._id) return;
      setMessages((prev) => prev.map((msg) =>
        msg._id === messageId ? { ...msg, content: updatedMessage.content, isEdited: true } : msg
      ));
    };

    const onCallInvite = ({ roomId, callType, from }) => {
      if (roomId !== activeRoomIdRef.current) return;
      setCallState((prev) => {
        if (prev.inCall || prev.connecting) return prev;
        return {
          ...prev,
          incoming: {
            roomId,
            callType,
            fromUserId: from.id,
            fromName: from.username
          }
        };
      });
    };

    const onCallAccepted = async ({ roomId, fromUserId }) => {
      const current = currentCallRef.current;
      if (!peerConnectionRef.current || current.targetUserId !== fromUserId || current.roomId !== roomId) return;

      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      socket.emit("call:offer", {
        roomId,
        targetUserId: fromUserId,
        offer,
        callType: current.callType
      });
    };

    const onCallRejected = ({ roomId, fromUserId }) => {
      const current = currentCallRef.current;
      if (current.targetUserId !== fromUserId || current.roomId !== roomId) return;
      cleanupCall(false);
      window.alert("Call was rejected.");
    };

    const onCallOffer = async ({ roomId, offer, fromUserId, callType }) => {
      if (roomId !== activeRoomIdRef.current) return;
      const current = currentCallRef.current;
      if (current.targetUserId !== fromUserId || current.roomId !== roomId) return;

      const effectiveCallType = current.callType || callType;
      setCallState((prev) => ({ ...prev, connecting: true, callType: effectiveCallType, incoming: null, awaitingPeer: false }));

      localStreamRef.current || (await startLocalMedia(effectiveCallType));
      const peerConnection = ensurePeerConnection(roomId, fromUserId);
      attachLocalTracksToPeerConnection(peerConnection);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      while (pendingCandidatesRef.current.length) {
        const candidate = pendingCandidatesRef.current.shift();
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("call:answer", {
        roomId,
        targetUserId: fromUserId,
        answer
      });
      setCallState((prev) => ({ ...prev, connecting: false, inCall: true, callType: effectiveCallType, awaitingPeer: false }));
    };

    const onCallAnswer = async ({ roomId, answer, fromUserId }) => {
      const current = currentCallRef.current;
      if (!peerConnectionRef.current || current.targetUserId !== fromUserId || current.roomId !== roomId) return;

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      while (pendingCandidatesRef.current.length) {
        const candidate = pendingCandidatesRef.current.shift();
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
      setCallState((prev) => ({ ...prev, connecting: false, inCall: true, awaitingPeer: false }));
    };

    const onCallIceCandidate = async ({ roomId, candidate, fromUserId }) => {
      const current = currentCallRef.current;
      if (!peerConnectionRef.current || current.targetUserId !== fromUserId || current.roomId !== roomId) return;

      if (peerConnectionRef.current.remoteDescription) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        return;
      }
      pendingCandidatesRef.current.push(candidate);
    };

    const onCallEnded = ({ roomId, fromUserId }) => {
      const current = currentCallRef.current;
      if (current.targetUserId !== fromUserId || current.roomId !== roomId) return;
      cleanupCall(false);
    };

    const onUserUpdated = (payload) => {
      setRoomUsers((prev) =>
        prev.map((member) =>
          member.id === payload.userId
            ? {
                ...member,
                ...(payload.profile || {}),
                status: payload.status || payload.profile?.status || member.status,
                visibility: payload.preferences?.visibility || member.visibility,
                presenceStatus: payload.presenceStatus || member.presenceStatus,
                lastSeen: payload.lastSeen || member.lastSeen,
                online: (payload.presenceStatus || member.presenceStatus) === "online"
              }
            : member
        )
      );
      if (user?.id === payload.userId) {
        setUser((prev) => ({
          ...prev,
          ...(payload.profile || {}),
          status: payload.status || payload.profile?.status || prev?.status,
          preferences: payload.preferences || prev?.preferences,
          presenceStatus: payload.presenceStatus || prev?.presenceStatus,
          lastSeen: payload.lastSeen || prev?.lastSeen
        }));
      }
    };

    const onNotificationNew = (payload) => {
      setNotifications((prev) => [payload, ...prev.filter((entry) => entry.id !== payload.id)]);
      setUnreadNotifications((prev) => prev + (payload.isRead ? 0 : 1));
      if (payload.type === "JOIN_ROOM_ACCEPTED") {
        loadRooms().catch(() => undefined);
      }
      if (payload.type === "FOLLOW_ACCEPTED" || payload.type === "NEW_FOLLOWER") {
        loadConnections().catch(() => undefined);
      }
      if (payload.type === "FOLLOW_ACCEPTED") {
        setPendingFollowIds((prev) => {
          const senderId = payload.senderId;
          if (!senderId || !prev[senderId]) return prev;
          const next = { ...prev };
          delete next[senderId];
          return next;
        });
      }
    };

    socket.on("newMessage", onNewMessage);
    socket.on("systemMessage", onSystemMessage);
    socket.on("roomUsers", onRoomUsers);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("presence:update", onPresenceUpdate);
    socket.on("messageReactionUpdated", onMessageReactionUpdated);
    socket.on("messageDeleted", onMessageDeleted);
    socket.on("messageEdited", onMessageEdited);
    socket.on("call:invite", onCallInvite);
    socket.on("call:accepted", onCallAccepted);
    socket.on("call:rejected", onCallRejected);
    socket.on("call:offer", onCallOffer);
    socket.on("call:answer", onCallAnswer);
    socket.on("call:ice-candidate", onCallIceCandidate);
    socket.on("call:ended", onCallEnded);
    socket.on("user:updated", onUserUpdated);
    socket.on("notification:new", onNotificationNew);
    return () => {
      socket.off("newMessage", onNewMessage);
      socket.off("systemMessage", onSystemMessage);
      socket.off("roomUsers", onRoomUsers);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("messageReactionUpdated", onMessageReactionUpdated);
      socket.off("messageDeleted", onMessageDeleted);
      socket.off("messageEdited", onMessageEdited);
      socket.off("call:invite", onCallInvite);
      socket.off("call:accepted", onCallAccepted);
      socket.off("call:rejected", onCallRejected);
      socket.off("call:offer", onCallOffer);
      socket.off("call:answer", onCallAnswer);
      socket.off("call:ice-candidate", onCallIceCandidate);
      socket.off("call:ended", onCallEnded);
      socket.off("user:updated", onUserUpdated);
      socket.off("notification:new", onNotificationNew);
    };
  }, [socket, activeRoom, cleanupCall, ensurePeerConnection, startLocalMedia, attachLocalTracksToPeerConnection, mapRoomUsers, user, setUser, loadRooms, loadConnections]);

  const selectRoom = async (room) => {
    const hasMembers = Array.isArray(room.members);
    const isMember = hasMembers
      ? room.members?.some((member) => (member._id || member.id) === user?.id)
      : (room.isMember ?? true);
    if (!isMember) return;
    setActiveRoom(room);
    setActivePane("chat");
    setTypingUsers([]);
    setMessages([]);
    loadMessages(room._id);
    setRoomUsers(mapRoomUsers(room.members || []));
    setRoomMedia([]);
    setUnreadByRoom((prev) => ({ ...prev, [room._id]: 0 }));
    socket?.emit("joinRoom", { roomId: room._id });
  };

  const startChatWithUser = useCallback(
    async (userId) => {
      if (!userId) return;
      const { data } = await api.post(`/chatrooms/direct/${userId}`);
      const room = data.room;
      if (!room) return;
      setRooms((prev) => (prev.some((entry) => entry._id === room._id) ? prev : [room, ...prev]));
      await selectRoom(room);
      setActivePane("chat");
    },
    [api, selectRoom]
  );

  const openRoomFromDiscover = async (roomId) => {
    const room = rooms.find((entry) => entry._id === roomId);
    if (!room) return;
    await selectRoom(room);
    setActivePane("chat");
  };

  const createRoom = async (payload) => {
    await api.post("/chatrooms", payload);
    await loadRooms();
  };

  const joinRoom = async (roomId) => {
    const { data } = await api.post(`/chatrooms/${roomId}/join`);
    if (data.requested) {
      window.alert(data.message || "Join request sent.");
      return;
    }
    await loadRooms();
    await selectRoom(data.room);
  };

  const leaveRoom = async (roomId) => {
    if (currentCallRef.current.roomId === roomId && (callState.inCall || callState.connecting)) {
      cleanupCall(true);
    }
    socket?.emit("typing:stop", { roomId });
    await api.post(`/chatrooms/${roomId}/leave`);
    socket?.emit("leaveRoom", { roomId });
    await loadRooms();
    if (activeRoom?._id === roomId) {
      setActiveRoom(null);
      setMessages([]);
      setRoomUsers([]);
      setTypingUsers([]);
      setRoomMedia([]);
      setSettingsOpen(false);
    }
  };

  const sendMessage = async ({ content, files, voiceMeta = [] }) => {
    if (!activeRoom) return;

    let attachments = [];
    if (files?.length) {
      const formData = new FormData();
      formData.append("roomId", activeRoom._id);
      files.forEach((file) => formData.append("files", file));
      if (voiceMeta?.length) {
        formData.append("attachmentMeta", JSON.stringify(voiceMeta));
      }
      const { data } = await api.post("/messages/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      attachments = data.attachments || [];
    }

    socket?.emit("typing:stop", { roomId: activeRoom._id });
    socket?.emit("sendMessage", { roomId: activeRoom._id, content, attachments });
  };

  const startTyping = () => {
    if (!activeRoom?._id) return;
    socket?.emit("typing:start", { roomId: activeRoom._id });
  };

  const stopTyping = () => {
    if (!activeRoom?._id) return;
    socket?.emit("typing:stop", { roomId: activeRoom._id });
  };

  const toggleReaction = (messageId, emoji) => {
    if (!activeRoom) return;
    socket?.emit("toggleReaction", { roomId: activeRoom._id, messageId, emoji }, (result) => {
      if (!result?.ok) {
        window.alert(result?.message || "Unable to react to message.");
        return;
      }
      setMessages((prev) =>
        prev.map((message) => (message._id === messageId ? { ...message, reactions: result.reactions || [] } : message))
      );
    });
  };

  const deleteMessage = (messageId) => {
    if (!activeRoom || !messageId) return;
    socket?.emit("deleteMessage", { roomId: activeRoom._id, messageId }, (result) => {
      if (!result?.ok) {
        window.alert(result?.message || "Unable to delete this message.");
        return;
      }
      setMessages((prev) => prev.filter((message) => message._id !== messageId));
    });
  };

  const editMessage = (messageId, newContent) => {
    if (!activeRoom || !messageId) return;
    socket?.emit("editMessage", { roomId: activeRoom._id, messageId, newContent }, (result) => {
      if (!result?.ok) {
        window.alert(result?.message || "Unable to edit this message.");
        return;
      }
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId ? { ...msg, content: result.message.content, isEdited: true } : msg
        )
      );
    });
  };

  const deleteRoom = async (roomId) => {
    await api.delete(`/chatrooms/${roomId}`);
    if (activeRoom?._id === roomId) {
      setActiveRoom(null);
      setMessages([]);
      setRoomUsers([]);
      setRoomMedia([]);
      setSettingsOpen(false);
    }
    await loadRooms();
  };

  const kickMember = async (roomId, userId) => {
    const { data } = await api.post(`/chatrooms/${roomId}/kick/${userId}`);
    await loadRooms();
    if (activeRoom?._id === roomId) {
      setActiveRoom(data.room);
      setRoomUsers(mapRoomUsers(data.room?.members || []));
      await loadMessages(roomId);
    }
  };

  const saveRoomSettings = async (roomId, payload) => {
    const { data } = await api.patch(`/chatrooms/${roomId}`, payload);
    setActiveRoom(data.room);
    await loadRooms();
  };

  const uploadRoomAvatar = async (roomId, file) => {
    const formData = new FormData();
    formData.append("avatar", file);
    const { data } = await api.post(`/chatrooms/${roomId}/avatar`, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    setActiveRoom(data.room);
    await loadRooms();
  };

  const loadRoomMedia = useCallback(
    async (roomId) => {
      if (!roomId) return;
      setLoadingRoomMedia(true);
      try {
        const { data } = await api.get(`/chatrooms/${roomId}/media`);
        setRoomMedia(data.images || []);
      } catch (_error) {
        setRoomMedia([]);
      } finally {
        setLoadingRoomMedia(false);
      }
    },
    [api]
  );

  const openRoomSettings = async () => {
    if (!activeRoom) return;
    setSettingsOpen(true);
    await loadRoomMedia(activeRoom._id);
  };

  const acceptIncomingCall = async () => {
    const incoming = callState.incoming;
    if (!incoming || !socket) return;

    try {
      currentCallRef.current = {
        roomId: incoming.roomId,
        targetUserId: incoming.fromUserId,
        callType: incoming.callType
      };
      setCallState((prev) => ({ ...prev, connecting: true, callType: incoming.callType, incoming: null, awaitingPeer: false }));
      setCallControls({ micMuted: false, cameraOff: incoming.callType !== "video", sharingScreen: false });
      await startLocalMedia(incoming.callType);
      socket.emit("call:accept", {
        roomId: incoming.roomId,
        targetUserId: incoming.fromUserId,
        callType: incoming.callType
      });
    } catch (error) {
      cleanupCall(false);
      window.alert("Unable to accept call. Please allow microphone/camera access.");
    }
  };

  const rejectIncomingCall = () => {
    const incoming = callState.incoming;
    if (!incoming || !socket) return;

    socket.emit("call:reject", {
      roomId: incoming.roomId,
      targetUserId: incoming.fromUserId
    });
    setCallState((prev) => ({ ...prev, incoming: null }));
  };

  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks?.()[0];
    if (!audioTrack) return;
    const nextEnabled = !audioTrack.enabled;
    audioTrack.enabled = nextEnabled;
    setCallControls((prev) => ({ ...prev, micMuted: !nextEnabled }));
  };

  const toggleCamera = () => {
    if (callState.callType !== "video") return;
    if (callControls.sharingScreen) return;
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks?.()[0];
    if (!videoTrack) return;
    const nextEnabled = !videoTrack.enabled;
    videoTrack.enabled = nextEnabled;
    setCallControls((prev) => ({ ...prev, cameraOff: !nextEnabled }));
  };

  const toggleScreenShare = useCallback(async () => {
    if (callState.callType !== "video") return;
    const localStream = localStreamRef.current;
    if (!localStream) return;

    const peerConnection = peerConnectionRef.current;
    const videoSender = peerConnection
      ?.getSenders()
      .find((sender) => sender.track?.kind === "video");

    const stopSharing = async () => {
      const cameraTrack = localStream.getVideoTracks?.()[0];
      if (!cameraTrack) {
        screenStreamRef.current?.getTracks?.().forEach((track) => track.stop());
        screenStreamRef.current = null;
        setCallControls((prev) => ({ ...prev, sharingScreen: false }));
        return;
      }
      if (videoSender) {
        await videoSender.replaceTrack(cameraTrack);
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
      screenStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setCallControls((prev) => ({ ...prev, sharingScreen: false, cameraOff: !cameraTrack.enabled }));
    };

    if (callControls.sharingScreen) {
      await stopSharing();
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false
      });
      const screenTrack = screenStream.getVideoTracks?.()[0];
      if (!screenTrack) {
        screenStream.getTracks().forEach((track) => track.stop());
        return;
      }

      screenTrack.onended = () => {
        stopSharing().catch(() => undefined);
      };

      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      }
      screenStreamRef.current = screenStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }
      setCallControls((prev) => ({ ...prev, sharingScreen: true, cameraOff: false }));
    } catch (_error) {
      window.alert("Unable to start screen share.");
    }
  }, [callState.callType, callControls.sharingScreen]);

  const callParticipants = useMemo(() => {
    if (roomUsers?.length) return roomUsers;
    const members = activeRoom?.members || [];
    return members.map((member) => ({
      id: member._id || member.id,
      username: member.username,
      displayName: member.displayName || member.username,
      online: Boolean(member.online)
    }));
  }, [roomUsers, activeRoom]);

  if (isCallOnlyMode) {
    return (
      <CallWindow
        activeRoom={activeRoom}
        socketConnected={connected}
        callState={{
          ...callState,
          onAcceptIncoming: acceptIncomingCall,
          onRejectIncoming: rejectIncomingCall
        }}
        callControls={callControls}
        participants={callParticipants}
        messages={messages}
        currentUser={user}
        onSendChat={async (content) => {
          await sendMessage({ content, files: [] });
        }}
        onAcceptIncoming={acceptIncomingCall}
        onRejectIncoming={rejectIncomingCall}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onEndCall={() => cleanupCall(true)}
        onCloseWindow={() => {
          cleanupCall(true);
          window.close();
        }}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
      />
    );
  }

  if (isMobileView) {
    return (
      <>
        <MobileChatApp
          user={user}
          connected={connected}
          rooms={rooms}
          activeRoom={activeRoom}
          unreadByRoom={unreadByRoom}
          messages={messages}
          roomUsers={roomUsers}
          roomMedia={roomMedia}
          loadingRoomMedia={loadingRoomMedia}
          theme={theme}
          onThemeChange={setTheme}
          onSelectRoom={selectRoom}
          onCreateRoom={() => setCreateOpen(true)}
          onJoinRoom={joinRoom}
          onSendMessage={sendMessage}
          onToggleReaction={toggleReaction}
          onDeleteMessage={deleteMessage}
          onEditMessage={editMessage}
          onLeaveRoom={leaveRoom}
          onDeleteRoom={deleteRoom}
          onOpenRoomInfo={() => (activeRoom ? loadRoomMedia(activeRoom._id) : Promise.resolve())}
          onLogout={logout}
        />
        <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createRoom} />
      </>
    );
  }

  return (
    <main className={`chat-shell ${activePane === "discover" ? "mode-discover" : ""}`}>
      <Sidebar
        user={user}
        rooms={rooms}
        activeRoom={activeRoom}
        onSelectRoom={selectRoom}
        onCreateRoomOpen={() => setCreateOpen(true)}
        onJoinRoom={joinRoom}
        onLeaveRoom={leaveRoom}
        onDeleteRoom={deleteRoom}
        onLogout={logout}
        theme={theme}
        onThemeChange={setTheme}
        connected={connected}
        notifications={notifications}
        unreadNotifications={unreadNotifications}
        notificationsLoading={notificationsLoading}
        onNotificationsOpen={openNotifications}
        onAcceptNotification={handleAcceptNotification}
        onDeclineNotification={handleDeclineNotification}
        onStartChatNotification={startChatWithUser}
        activePane={activePane}
        onPaneChange={setActivePane}
      />
      {activePane === "discover" ? (
        discoverSelection ? (
          <DiscoverDetailPanel
            token={token}
            selection={discoverSelection}
            rooms={rooms}
            following={following}
            pendingFollowIds={pendingFollowIds}
            onBack={() => setDiscoverSelection(null)}
            onFollowUser={handleFollowUser}
            onUnfollowUser={handleUnfollow}
            onStartChatUser={startChatWithUser}
            onOpenRoomChat={openRoomFromDiscover}
            onJoinRoom={joinRoom}
          />
        ) : (
          <DiscoverPanel
            user={user}
            rooms={rooms}
            following={following}
            pendingFollowIds={pendingFollowIds}
            onFollowUser={handleFollowUser}
            onStartChatUser={startChatWithUser}
            onOpenUser={(id) => setDiscoverSelection({ type: "user", id })}
            onOpenRoom={(id) => setDiscoverSelection({ type: "room", id })}
            onSearchPeople={searchDiscoverPeople}
            searchPeopleResults={discoverPeople}
            searchPeopleLoading={discoverPeopleLoading}
            filters={userSettings.discoverFilters}
          />
        )
      ) : activePane === "settings" ? (
        <SettingsWorkspace
          settings={userSettings}
          user={user}
          blockedUsers={blockedUsers}
          myRoomsData={myRoomsData}
          followers={followers}
          following={following}
          aboutInfo={aboutInfo}
          onUpdateSettings={updateSettings}
          onLogout={logout}
          onLoadBlockedUsers={() => loadBlockedUsers()}
          onLoadMyRooms={() => loadMyRooms()}
          onLoadConnections={() => loadConnections()}
          onLoadAbout={() => loadAbout()}
          onSaveProfile={saveProfile}
          onSaveUsername={saveUsername}
          onSaveStatus={saveStatus}
          onUnblock={handleUnblock}
          onVisibilityChange={handleVisibilityChange}
          onToggleAnalytics={handleToggleAnalytics}
          onReport={handleReport}
          onUnfollow={handleUnfollow}
          onDiscoverSave={handleDiscoverSave}
          onOpenHelp={() => window.open("/faq.html", "_blank", "noopener")}
          onOpenTerms={() => window.open(process.env.REACT_APP_TERMS_URL || "https://wavvy.app/terms", "_blank", "noopener")}
          onOpenLanguage={() => setLanguageModalOpen(true)}
          onSelectRoom={selectRoom}
          onExitSettings={() => setActivePane("chat")}
        />
      ) : (
        <>
          <ChatInterface
            activeRoom={activeRoom}
            messages={messages}
            roomUsers={roomUsers}
            typingUsers={typingUsers}
            currentUser={user}
            onSendMessage={sendMessage}
            onTypingStart={startTyping}
            onTypingStop={stopTyping}
            onToggleReaction={toggleReaction}
            onDeleteMessage={deleteMessage}
            onEditMessage={editMessage}
            onLeaveRoom={leaveRoom}
            onOpenRoomSettings={openRoomSettings}
            onStartAudioCall={(roomId) => startCall(roomId, "audio")}
            onStartVideoCall={(roomId) => startCall(roomId, "video")}
            onEndCall={() => cleanupCall(true)}
            onToggleMic={toggleMic}
            onToggleCamera={toggleCamera}
            callState={{
              ...callState,
              onAcceptIncoming: acceptIncomingCall,
              onRejectIncoming: rejectIncomingCall
            }}
            callControls={callControls}
            localVideoRef={localVideoRef}
            remoteVideoRef={remoteVideoRef}
          />
          <RoomDetailsPanel
            activeRoom={activeRoom}
            roomUsers={roomUsers}
            currentUser={user}
            onKickMember={kickMember}
            mediaItems={roomMedia}
            loadingMedia={loadingRoomMedia}
            onLoadMedia={loadRoomMedia}
            blockedUsers={blockedUsers}
            onBlockUser={handleBlockUser}
          />
        </>
      )}
      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createRoom} />
      <RoomSettingsModal
        open={settingsOpen}
        activeRoom={activeRoom}
        roomUsers={roomUsers}
        currentUser={user}
        mediaItems={roomMedia}
        loadingMedia={loadingRoomMedia}
        onClose={() => setSettingsOpen(false)}
        onSaveRoom={saveRoomSettings}
        onUploadAvatar={uploadRoomAvatar}
        onDeleteRoom={deleteRoom}
        onKickMember={kickMember}
      />
      <LanguageModal
        open={languageModalOpen}
        onClose={() => setLanguageModalOpen(false)}
        value={userSettings.language || language}
        onSelect={handleLanguageSelect}
      />
    </main>
  );
}
