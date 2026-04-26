import type { ReactNode } from "react";

export type DashboardShellProps = {
  sidebar: ReactNode;
  map: ReactNode;
  rightPanel: ReactNode;
};

/** Three-column workspace (top bar rendered separately by the page). */
export function DashboardShell({ sidebar, map, rightPanel }: DashboardShellProps) {
  return (
    <div className="dash-workspace">
      <aside className="dash-workspace__sidebar">{sidebar}</aside>
      <main className="dash-workspace__map">{map}</main>
      <aside className="dash-workspace__right">{rightPanel}</aside>
    </div>
  );
}
