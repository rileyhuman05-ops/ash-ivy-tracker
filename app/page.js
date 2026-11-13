import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Auth gate temporarily disabled for tonight — open the model directly. */
export default function HomePage() {
  redirect("/api/viewer");
}
