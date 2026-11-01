import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import Timeline from "./timeline";
export const dynamic = "force-dynamic";
export default async function Page() {
  const a = await requireUser(); if (!a) redirect("/login");
  const { data } = await a.sb.from("documents").select("id,title,doc_type,doc_date,created_at,metadata_status,processing_status").in("doc_type", ["lab_report", "prescription", "discharge_summary", "medical_other"]).is("deleted_at", null);
  return <Timeline docs={data ?? []} />;
}
