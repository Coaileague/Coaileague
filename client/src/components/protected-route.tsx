/**
 * @deprecated Use RBACRoute instead: <RBACRoute require="authenticated">...</RBACRoute>
 * This file is maintained for backward compatibility.
 */
import React from 'react';
import { RBACRoute } from "./rbac-route";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <RBACRoute require="authenticated" showDeniedCard={false}>
      {children}
    </RBACRoute>
  );
}
