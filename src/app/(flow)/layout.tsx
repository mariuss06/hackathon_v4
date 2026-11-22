import { AssessmentProvider } from "@/components/AssessmentProvider";
import { Shell } from "@/components/Shell";

/** Shared across the 4 steps, so state survives navigation between them. */
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <AssessmentProvider>
      <Shell>{children}</Shell>
    </AssessmentProvider>
  );
}
