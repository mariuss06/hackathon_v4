"use client";

import { usePathname } from "next/navigation";

/**
 * Scores are revealed only in the final step (Profil / analiză finală). Every earlier step
 * (date firmă, quiz cunoștințe, quiz investiție) shows neutral progress instead — during the
 * quizzes no points, sub-scores or provisional final score are shown.
 */
export function useHideScores() {
  const path = usePathname() ?? "";
  return !path.startsWith("/profil");
}
