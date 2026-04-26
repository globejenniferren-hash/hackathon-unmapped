import { createFileRoute, redirect } from "@tanstack/react-router";

// The Assessment hub menu has been replaced by an inline sub-banner.
// Landing on /readiness now stops at passport before assessment sections.
export const Route = createFileRoute("/readiness/")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/readiness/passport", search });
  },
});
