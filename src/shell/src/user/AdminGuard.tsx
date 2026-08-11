import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useCurrentUser } from "./CurrentUserProvider";

interface AdminGuardProps {
  children: ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { user } = useCurrentUser();

  if (!user || user.organization_role !== "admin") {
    return <Navigate to="/library" replace />;
  }

  return <>{children}</>;
}
