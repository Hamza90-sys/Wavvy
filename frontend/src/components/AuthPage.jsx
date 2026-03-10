import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";

export default function AuthPage() {
  const navigate = useNavigate();
  const { mode } = useParams();
  const [error, setError] = useState("");
  const safeMode = useMemo(() => (mode === "register" ? "register" : "login"), [mode]);

  useEffect(() => {
    if (mode !== "login" && mode !== "register") {
      navigate("/auth/login", { replace: true });
    }
  }, [mode, navigate]);

  // Force login page to use the cobalt theme regardless of user selection elsewhere.
  useEffect(() => {
    const prevTheme = document.body.getAttribute("data-theme");
    document.body.setAttribute("data-theme", "cobalt");
    return () => {
      if (prevTheme) document.body.setAttribute("data-theme", prevTheme);
      else document.body.removeAttribute("data-theme");
    };
  }, []);

  return (
    <div className="auth-shell">
      <div className="auth-media" aria-hidden="true">
        <video
          className="auth-background-video"
          autoPlay
          muted
          loop
          playsInline
        >
          <source src="/backgroundvideo.mp4" type="video/mp4" />
        </video>
        <div className="auth-media-overlay" />
      </div>
      <div className="auth-card glass">
        <div className="brand-block">
          <img src="/wavvy-wordmark.png" alt="Wavvy" className="brand-wordmark" />
          <p>Realtime conversations that actually flow.</p>
        </div>
        {safeMode === "login" ? <LoginForm setError={setError} /> : <RegisterForm setError={setError} />}
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </div>
  );
}
