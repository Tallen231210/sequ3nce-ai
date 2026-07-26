import { redirect } from "next/navigation";

/** Only one section is ported so far, so the app opens straight into it. */
export default function CloserAppIndex() {
  redirect("/app/numbers");
}
