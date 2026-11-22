import type { Metadata } from "next";
import { AuthForm } from "@/components/account/AuthForm";

export const metadata: Metadata = { title: "Creează cont" };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
