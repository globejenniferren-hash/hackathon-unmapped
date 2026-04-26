import { createFileRoute, redirect } from "@tanstack/react-router";

// The Assessment hub menu has been replaced by an inline sub-banner.
// Landing on /readiness sends the user straight to the first sub-section.
export const Route = createFileRoute("/readiness/")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/readiness/gap", search });
  },
});
