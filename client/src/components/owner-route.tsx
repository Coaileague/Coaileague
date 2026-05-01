/**
 * @deprecated Use RBACRoute instead: <RBACRoute require="owner">...</RBACRoute>
 * This file is maintained for backward compatibility.
 */
import React from 'react';
import { RBACRoute } from "./rbac-route";

export function OwnerRoute({ children }: { children: React.ReactNode }) {
  return (
    <RBACRoute require="owner">
      {children}
    </RBACRoute>
  );
}
