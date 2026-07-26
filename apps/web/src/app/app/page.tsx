import { redirect } from "next/navigation";

export default function CloserAppIndex() {
  redirect("/app/dashboard");
}
