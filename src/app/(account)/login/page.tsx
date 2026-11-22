import type { Metadata } from "next";
import { AuthForm } from "@/components/account/AuthForm";

export const metadata: Metadata = { title: "Autentificare" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
