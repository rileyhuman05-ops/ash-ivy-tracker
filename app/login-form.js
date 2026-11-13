"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ initialError, disabled }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError || "");
  const [pending, setPending] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (disabled) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Sign-in failed");
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
      <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#9aa5b1" }}>
        Username
        <input
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={field}
          disabled={disabled || pending}
          required
        />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#9aa5b1" }}>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={field}
          disabled={disabled || pending}
          required
        />
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
