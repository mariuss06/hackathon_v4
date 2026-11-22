import { redirect } from "next/navigation";

/**
 * The old "Analiză e-Factura" step no longer exists as a page: the analysis runs automatically
 * between the two quizzes and is shown inside the final report (/profil).
 */
export default function Page() {
  redirect("/onboarding");
}
