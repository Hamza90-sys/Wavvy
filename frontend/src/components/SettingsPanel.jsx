import React from "react";
import { useI18n } from "../context/I18nContext";

const ICONS = {
  profile: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  handle: "M16 8a6 6 0 1 0-2.1 4.6c.6.8 1.6 1.4 2.6 1.4a4 4 0 0 0 0-8h-1v4",
  status: "M9 10h.01M15 10h.01M9.5 14c.7.7 1.7 1 2.5 1s1.8-.3 2.5-1",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  mail: "M4 4h16v16H4z M4 8l8 5 8-5",
  wave: "M3 16c2 0 2-4 4-4s2 4 4 4 2-4 4-4 2 4 4 4",
  volume: "M11 5 6 9H3v6h3l5 4V5z M15 9.5a4 4 0 0 1 0 5",
  haptics: "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83",
  block: "M19 5 5 19M5 5l14 14",
  eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zm11 4a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  chart: "M3 3v18h18M7 13l3 3 4-6 3 4",
  alert: "M12 9v4M12 17h.01M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0z",
  folder: "M3 7h5l2 2h11v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z",
  compass: "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2m16 0h2M7.76 7.76 6 18l10.24-1.76L18 6 7.76 7.76z",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 0s-4 3-4 10 4 10 4 10m0-20s4 3 4 10-4 10-4 10M2 12h20",
  help: "M9.09 9a3 3 0 1 1 5.82 1c0 1.5-1.1 2.1-1.9 2.6-.7.4-1.1.9-1.1 1.4V15m0 3h.01",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6h.01M12 12v6",
  terms: "M6 4h9l3 3v13H6z M6 10h12M9 14h6",
  users: "M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M23 11h-6",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  chevron: "M9 18l6-6-6-6"
};

function Icon({ name }) {
  const path = ICONS[name];
  if (!path) return null;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path.split(" M").map((d, idx) => (
        <path key={idx} d={(idx === 0 ? "" : "M") + d} />
      ))}
    </svg>
  );
}

export default function SettingsPanel({
  settings = {},
  onUpdateSettings = () => {},
  onLogout = () => {},
  onEditProfile = () => {},
  onChangeUsername = () => {},
  onEditStatus = () => {},
  onOpenBlocked = () => {},
  onOpenVisibility = () => {},
  onOpenDataSharing = () => {},
  onReportProblem = () => {},
  onOpenMyRooms = () => {},
  onOpenDiscoverPrefs = () => {},
  onOpenHelp = () => {},
  onOpenAbout = () => {},
  onOpenTerms = () => {},
  onOpenLanguage = () => {},
  onOpenConnections = () => {}
}) {
  const { t } = useI18n();
  const {
    notifications = {},
    device = {},
    analytics = false,
    visibility = "friends",
    language = "en"
  } = settings;
  const LANGUAGE_LABELS = { en: "English", fr: "Français", es: "Español" };
  const mentions = notifications.mentions ?? true;
  const invites = notifications.invites ?? true;
  const waveAlerts = notifications.waveAlerts ?? false;
  const sounds = device.sounds ?? true;
  const haptics = device.haptics ?? true;

  const Section = ({ title, children }) => (
    <div className="settings-section">
      <p className="settings-section-title">{title}</p>
      <div className="settings-card">{children}</div>
    </div>
  );

  const Item = ({ icon, label, hint, trailing, onClick }) => (
    <button type="button" className="settings-item" onClick={onClick}>
      <span className="settings-left">
        <span className="settings-icon"><Icon name={icon} /></span>
        <span className="settings-text">
          <strong>{label}</strong>
          {hint ? <small>{hint}</small> : null}
        </span>
      </span>
      <span className="settings-trailing">
        {trailing || <Icon name="chevron" />}
      </span>
    </button>
  );

  const Toggle = ({ checked, onChange }) => (
    <label className="settings-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="settings-toggle-track">
        <span className="settings-toggle-thumb" />
      </span>
    </label>
  );

  return (
    <section className="settings-panel glass">
      <header className="settings-head">
        <p className="eyebrow">Settings</p>
        <h2>{t("settingsTitle", "Make Wavvy yours")}</h2>
        <p className="muted">{t("settingsSubtitle", "Account, preferences, privacy, and help.")}</p>
      </header>

      <div className="settings-grid">
        <Section title="Account & Profile">
          <Item icon="profile" label="Profile" hint="Name, photo, bio" onClick={onEditProfile} />
          <Item icon="handle" label="Username / Handle" onClick={onChangeUsername} />
          <Item icon="status" label="Status / Mood" hint="Share your wave vibe" onClick={onEditStatus} />
        </Section>

        <Section title="App Preferences">
          <Item
            icon="bell"
            label="Mentions"
            trailing={<Toggle checked={mentions} onChange={(value) => onUpdateSettings({ notifications: { mentions: value } })} />}
          />
          <Item
            icon="mail"
            label="Room invites"
            trailing={<Toggle checked={invites} onChange={(value) => onUpdateSettings({ notifications: { invites: value } })} />}
          />
          <Item
            icon="wave"
            label="Wave alerts"
            trailing={<Toggle checked={waveAlerts} onChange={(value) => onUpdateSettings({ notifications: { waveAlerts: value } })} />}
          />
          <Item icon="volume" label="Sounds" trailing={<Toggle checked={sounds} onChange={(value) => onUpdateSettings({ device: { sounds: value } })} />} />
          <Item icon="haptics" label="Haptics" trailing={<Toggle checked={haptics} onChange={(value) => onUpdateSettings({ device: { haptics: value } })} />} />
          <Item
            icon="globe"
            label="Language"
            hint={LANGUAGE_LABELS[language] || language}
            trailing={language.toUpperCase()}
            onClick={onOpenLanguage}
          />
        </Section>

        <Section title="Privacy & Safety">
          <Item icon="block" label="Blocked users" onClick={onOpenBlocked} />
          <Item
            icon="eye"
            label="Who can see me"
            hint={visibility === "friends" ? "Friends only" : visibility}
            trailing={visibility}
            onClick={() => onOpenVisibility(visibility)}
          />
          <Item icon="chart" label="Data sharing" trailing={<Toggle checked={analytics} onChange={(value) => onUpdateSettings({ analytics: value })} />} onClick={onOpenDataSharing} />
          <Item icon="alert" label="Report a problem" onClick={onReportProblem} />
        </Section>

        <Section title="Social & Community">
          <Item icon="folder" label="My rooms" onClick={onOpenMyRooms} />
          <Item icon="users" label="Following / Followers" onClick={onOpenConnections} />
          <Item icon="compass" label="Discover preferences" hint="Waves, people, topics" onClick={onOpenDiscoverPrefs} />
        </Section>

        <Section title="Help & Info">
          <Item icon="help" label="Help Center" onClick={onOpenHelp} />
          <Item icon="info" label="About Wavvy" onClick={onOpenAbout} />
          <Item icon="terms" label="Terms & Privacy" onClick={onOpenTerms} />
          <Item icon="logout" label="Log out" trailing={<Icon name="chevron" />} onClick={onLogout} />
        </Section>
      </div>
    </section>
  );
}
