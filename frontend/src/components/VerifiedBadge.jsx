import React from "react";

export default function VerifiedBadge({ className = "", title = "Verified" }) {
  const cls = className ? `verified-badge ${className}` : "verified-badge";
  return (
    <span className={cls} title={title} aria-label={title}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M10.067.87a2.89 2.89 0 0 0-4.134 0l-.622.638-.89-.011A2.89 2.89 0 0 0 1.497 4.42l.01.89-.636.622a2.89 2.89 0 0 0 0 4.134l.637.622-.011.89a2.89 2.89 0 0 0 2.924 2.924l.89-.01.622.636a2.89 2.89 0 0 0 4.134 0l.622-.637.89.011a2.89 2.89 0 0 0 2.924-2.924l-.01-.89.636-.622a2.89 2.89 0 0 0 0-4.134l-.637-.622.011-.89A2.89 2.89 0 0 0 11.579 1.5l-.89.01-.622-.636Z"
          fill="currentColor"
        />
        <path d="M10.854 5.146a.5.5 0 0 1 0 .708L7.5 9.207 5.646 7.354a.5.5 0 1 1 .708-.708L7.5 7.793l2.646-2.647a.5.5 0 0 1 .708 0Z" fill="#fff" />
      </svg>
    </span>
  );
}
