import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySessionToken } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function ViewerPage() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) {
    redirect("/?error=" + encodeURIComponent("Please sign in"));
  }

  return (
    <main style={{ margin: 0, height: "100vh", overflow: "hidden" }}>
      <iframe
        title="Bayline warehouse site model"
        src="/api/viewer"
        style={{
          border: 0,
          width: "100%",
          height: "100%",
          display: "block",
          background: "#14181d",
        }}
      />
    </main>
  );
}
