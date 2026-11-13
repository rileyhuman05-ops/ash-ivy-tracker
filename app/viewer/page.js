import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ViewerPage() {
  redirect("/api/viewer");
}
