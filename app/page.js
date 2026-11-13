import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * No warehouse username/password. Access is Cursor Private SSO only.
 * Redirects signed-in Private viewers to the model.
 */
export default function HomePage() {
  redirect("/api/viewer");
}
