/**
 * @deprecated Use RBACRoute instead: <RBACRoute require="leader">...</RBACRoute>
 * This file is maintained for backward compatibility.
 */
import React from 'react';
import { RBACRoute } from "./rbac-route";

export function LeaderRoute({ children }: { children: React.ReactNode }) {
  return (
    <RBACRoute require="leader">
      {children}
    </RBACRoute>
  );
}
