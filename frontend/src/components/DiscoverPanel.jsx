import React, { useEffect, useMemo, useState } from "react";
import VerifiedBadge from "./VerifiedBadge";
import { isVerifiedUser } from "../constants/verifiedUsers";

const API_URL = process.env.REACT_APP_API_URL || "";
const API_BASE = API_URL.replace(/\/api\/?$/, "");

const getInitials = (text = "") => text.trim().slice(0, 2).toUpperCase() || "??";
const toAttachmentUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};

export default function DiscoverPanel({
  user,
  rooms,
  following = [],
  pendingFollowIds = {},
  onFollowUser = () => {},
  onStartChatUser = () => {},
  onOpenUser = () => {},
  onOpenRoom = () => {},
  onSearchPeople = null,
  searchPeopleResults = [],
  searchPeopleLoading = false,
  filters = { waves: [], people: [], topics: [] }
}) {
  const [query, setQuery] = useState("");
  const normalizedFilters = useMemo(
    () => ({
      waves: filters?.waves || [],
      people: filters?.people || [],
      topics: filters?.topics || []
    }),
    [filters?.waves, filters?.people, filters?.topics]
  );

  useEffect(() => {
    if (!onSearchPeople) return;
    const term = query.trim();
    if (term.length < 2) {
      onSearchPeople("");
      return;
    }
    const handle = setTimeout(() => onSearchPeople(term), 260);
    return () => clearTimeout(handle);
  }, [onSearchPeople, query]);

  const { roomResults, peopleResults } = useMemo(() => {
    const term = query.trim().toLowerCase();
    const match = (value) => !term || value.toLowerCase().includes(term);
    const matchAny = (list, text) => list.length === 0 || list.some((entry) => text.toLowerCase().includes(entry.toLowerCase()));

    const roomResults = rooms.filter(
      (room) => {
        if (room?.isPrivate || (room?.name || "").toLowerCase().startsWith("dm-")) {
          return false;
        }
        const name = room.name || "";
        const text = `${name} ${room.description || ""}`;
        const matchesQuery = match(name);
        const matchesWaves = matchAny(normalizedFilters.waves, text);
        const matchesTopics = matchAny(normalizedFilters.topics, text);
        return matchesQuery && matchesWaves && matchesTopics;
      }
    );

    const peopleMap = new Map();
    rooms.forEach((room) => {
      (room.members || []).forEach((member) => {
        if (!member || member._id === user?.id) return;
        const memberId = member._id || member.id;
        if (!memberId) return;
        const existing = peopleMap.get(memberId) || { ...member, rooms: [] };
        existing.rooms.push(room);
        peopleMap.set(memberId, existing);
      });
    });

    (searchPeopleResults || []).forEach((person) => {
      const personId = person._id || person.id || person.userId;
      if (!personId || personId === user?.id) return;
      if (!peopleMap.has(personId)) {
        peopleMap.set(personId, { ...person, _id: personId, rooms: [] });
      }
    });

    const peopleResults = Array.from(peopleMap.values()).filter((person) => {
      const personText = `${person.username || ""} ${person.displayName || ""}`.trim();
      if (!personText) return false;
      return match(personText) && matchAny(normalizedFilters.people, personText);
    });

    return { roomResults, peopleResults };
  }, [rooms, query, user, normalizedFilters, searchPeopleResults]);

  const results = useMemo(() => {
    const roomItems = roomResults.map((room) => {
      const isMember = room.members?.some((member) => (member._id || member.id) === user?.id);
      return {
        id: room._id,
        type: "Room",
        name: room.name,
        description: room.description,
        avatarUrl: toAttachmentUrl(room.avatarUrl),
        initials: getInitials(room.name),
        isMember,
        room
      };
    });

    const peopleItems = peopleResults.map((person) => ({
      id: person._id || person.id,
      type: "User",
      name: person.displayName || person.username,
      avatarUrl: toAttachmentUrl(person.avatarUrl),
      avatarColor: person.avatarColor,
      initials: getInitials(person.displayName || person.username),
      person
    }));

    return [...roomItems, ...peopleItems];
  }, [peopleResults, roomResults, user]);

  const followingIds = useMemo(
    () => new Set((following || []).map((entry) => entry.id || entry._id)),
    [following]
  );

  const showResults = query.trim().length > 0;

  const handleSelectResult = (item) => {
    if (item.type === "Room" && item.id) {
      onOpenRoom(item.id);
    }
    if (item.type === "User" && item.id) {
      onOpenUser(item.id);
    }
  };

  return (
    <section className="discover-panel">
      <div className="discover-hero glass">
        <header className="discover-head centered">
          <p className="eyebrow">Discover</p>
          <h1 className="discover-title">Wavvy World</h1>
          <p className="discover-subtitle">Find Your Wave</p>
        </header>
        <div className="discover-search">
          <span className="search-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
              <line x1="16.4142" y1="16" x2="21" y2="20.5858" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search rooms, people, or topics"
            aria-label="Search rooms, people, or topics"
          />
        </div>
      </div>

      {showResults ? (
        results.length ? (
          <div className="discover-results-card glass">
            <div className="discover-results-grid">
              {results.map((item) => {
                const avatarStyle = item.avatarColor ? { backgroundColor: item.avatarColor } : undefined;
                if (item.type === "User") {
                  const isFollowing = followingIds.has(item.id);
                  const isRequested = Boolean(pendingFollowIds[item.id]);
                  return (
                    <article key={`${item.type}-${item.id}`} className="discover-chip discover-chip-user">
                      <button
                        type="button"
                        className="discover-chip-main"
                        onClick={() => handleSelectResult(item)}
                      >
                        <span className={`discover-chip-avatar ${item.avatarUrl ? "" : "fallback"}`} style={avatarStyle}>
                          {item.avatarUrl ? (
                            <img src={item.avatarUrl} alt={item.name} />
                          ) : (
                            <span>{item.initials}</span>
                          )}
                        </span>
                        <span className="discover-chip-name name-with-badge">
                          {item.name}
                          {isVerifiedUser(item.person) ? <VerifiedBadge /> : null}
                        </span>
                        <span className="discover-chip-label">{item.type}</span>
                      </button>
                      <button
                        type="button"
                        className={isFollowing ? "ghost-btn" : "primary-btn"}
                        disabled={isRequested}
                        onClick={() => {
                          if (isFollowing) {
                            onStartChatUser(item.id);
                            return;
                          }
                          onFollowUser(item.id);
                        }}
                      >
                        {isFollowing ? "Chat" : isRequested ? "Requested" : "Follow"}
                      </button>
                    </article>
                  );
                }
                return (
                  <button
                    type="button"
                    key={`${item.type}-${item.id}`}
                    className="discover-chip"
                    onClick={() => handleSelectResult(item)}
                  >
                    <span className={`discover-chip-avatar ${item.avatarUrl ? "" : "fallback"}`} style={avatarStyle}>
                      {item.avatarUrl ? (
                        <img src={item.avatarUrl} alt={item.name} />
                      ) : (
                        <span>{item.initials}</span>
                      )}
                    </span>
                    <span className="discover-chip-name name-with-badge">
                      {item.name}
                      {item.type === "User" && isVerifiedUser(item.person) ? <VerifiedBadge /> : null}
                    </span>
                    <span className="discover-chip-label">{item.type}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="muted centered">No matches yet. Try another term.</p>
        )
      ) : null}
    </section>
  );
}
