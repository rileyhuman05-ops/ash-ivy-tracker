import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Auth temporarily disabled — same as home. */
export default function ViewerPage() {
  redirect("/api/viewer");
}
