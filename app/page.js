import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  COOKIE_NAME,
  credentialsConfigured,
  getConfiguredCredentials,
  verifySessionToken,
} from "../lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }) {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token && verifySessionToken(token)) {
    redirect("/viewer");
  }

  const params = await searchParams;
  const error = typeof params?.error === "string" ? params.error : null;
  const configured = credentialsConfigured();
  const source = getConfiguredCredentials().source;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "radial-gradient(1200px 600px at 20% 0%, #2a3540 0%, #14181d 55%, #0e1216 100%)",
        color: "#e6e9ee",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <section style={{ width: "min(420px, 100%)" }}>
        <p
          style={{
            margin: "0 0 8px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontSize: 12,
            color: "#9aa5b1",
          }}
        >
          Bayline Mesa
        </p>
        <h1 style={{ margin: "0 0 10px", fontSize: 28, fontWeight: 600 }}>
          Warehouse site model
        </h1>
        <p style={{ margin: "0 0 24px", color: "#b7c0ca", lineHeight: 1.5 }}>
          Sign in with a warehouse username and password to open the 3D site
          model. Accounts: <strong>Riley.Human</strong> or{" "}
          <strong>Nexstar2026</strong>. Credentials are checked on the server.
        </p>
        {!configured ? (
          <p
            style={{
              margin: "0 0 16px",
              padding: "12px 14px",
              borderRadius: 8,
              background: "rgba(192, 57, 43, 0.18)",
              border: "1px solid rgba(192, 57, 43, 0.45)",
              color: "#f2c1bb",
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            Server credentials are not configured yet. Set primary{" "}
            <code>WAREHOUSE_USERNAME</code> / <code>WAREHOUSE_PASSWORD</code>{" "}
            and optional second <code>WAREHOUSE_USERNAME_2</code> /{" "}
            <code>WAREHOUSE_PASSWORD_2</code> in Cursor Secrets, then republish.
          </p>
        ) : null}
        {source === "local-placeholder" ? (
          <p
            style={{
              margin: "0 0 16px",
              padding: "12px 14px",
              borderRadius: 8,
              background: "rgba(230, 126, 34, 0.16)",
              border: "1px solid rgba(230, 126, 34, 0.4)",
              color: "#f0d2b0",
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            Local smoke mode: use username <strong>preview</strong> / password{" "}
            <strong>preview</strong>. Live hosting requires real secrets.
          </p>
        ) : null}
        <LoginForm initialError={error} disabled={!configured} />
      </section>
    </main>
  );
}
