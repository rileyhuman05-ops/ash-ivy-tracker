"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ initialError, disabled }) {
  const router = useRouter();
  const [username, setUsername] = useState("Riley.Human");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(initialError || "");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth-status", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    if (disabled) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username,
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status) setStatus(data.status);
      if (!res.ok) {
        setError(data.error || "Invalid username or password");
        setPending(false);
        return;
      }
      router.replace("/viewer");
      router.refresh();
    } catch {
      setError("Network error — try again");
      setPending(false);
    }
  }

  const field = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid #3a4552",
    background: "#1b2229",
    color: "#e6e9ee",
    fontSize: 16,
    outline: "none",
  };

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      {status ? (
        <p
          style={{
            margin: 0,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(61, 111, 143, 0.18)",
            border: "1px solid #3a4552",
            color: "#b7c0ca",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          Server secrets:{" "}
          {status.configured ? "loaded" : "missing"} · accounts:{" "}
          {status.userCount ?? "?"} · Riley.Human slot:{" "}
          {status.usernameMatchesExpected ? "yes" : "no"} · Nexstar2026 slot:{" "}
          {status.secondUsernameConfigured || status.secondSlotComplete
            ? "yes"
            : status.secondSlotPartial
              ? "incomplete"
              : "no"}
          {status.usernameHasBom || status.passwordHasBom
            ? " · BOM detected in a secret"
            : ""}
          {status.usernameHadWrappingQuotes || status.passwordHadWrappingQuotes
            ? " · quotes detected around a secret"
            : ""}
        </p>
      ) : null}
      <p style={{ margin: 0, fontSize: 12, color: "#9aa5b1", lineHeight: 1.4 }}>
        Usernames: <strong>Riley.Human</strong> or <strong>Nexstar2026</strong>
      </p>
      <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#9aa5b1" }}>
        Username
        <input
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Riley.Human or Nexstar2026"
          style={field}
          disabled={disabled || pending}
          required
        />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#9aa5b1" }}>
        Password
        <span style={{ position: "relative", display: "block" }}>
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...field, paddingRight: 72 }}
            disabled={disabled || pending}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={disabled || pending}
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              border: "none",
              background: "transparent",
              color: "#9aa5b1",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              padding: "4px 6px",
            }}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </span>
      </label>
      {error ? (
        <p style={{ margin: 0, color: "#f2c1bb", fontSize: 14 }}>{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={disabled || pending}
        style={{
          marginTop: 4,
          padding: "12px 16px",
          borderRadius: 8,
          border: "1px solid #4a5a6a",
          background: disabled || pending ? "#2a323c" : "#3d6f8f",
          color: "#e6e9ee",
          fontSize: 15,
          fontWeight: 600,
          cursor: disabled || pending ? "not-allowed" : "pointer",
        }}
      >
        {pending ? "Signing in…" : "Open warehouse model"}
      </button>
    </form>
  );
}
