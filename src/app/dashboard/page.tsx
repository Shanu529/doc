import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import Vault from "./vault";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const a = await requireUser(); if (!a) redirect("/login");
  const { data } = await a.sb.from("folders").select("id,name").order("name");
  return <Vault folders={data ?? []} email={a.user.email ?? ""} />;
}
