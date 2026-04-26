import { createFileRoute, redirect } from "@tanstack/react-router";

// The onboarding ("Hello") flow lives at /hello — kept in the codebase but
// hidden from the demo. Landing on / sends you straight to the Translate step.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/voice" });
  },
});
