import type { Metadata } from "next";
import { AdminPanel } from "@/components/account/AdminPanel";

export const metadata: Metadata = { title: "Panou Admin", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminPanel />;
}
