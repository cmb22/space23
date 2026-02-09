import { redirect } from "next/navigation";

export default async function Page() {
  // /teachers is now just an alias for the public landing page.
  redirect("/");
}