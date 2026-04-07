export type PositionCategory =
  | 'chiefs'
  | 'admin_command'
  | 'field_supervisors'
  | 'admin_staff'
  | 'case_managers'
  | 'dispatchers'
  | 'armed'
  | 'unarmed';

export type ArmedStatus = 'armed' | 'unarmed' | 'varies' | 'n/a';

export interface FeaturePermissions {
  edit_org_settings: boolean;
  manage_billing: boolean;
  add_remove_users: boolean;
  edit_all_schedules: boolean;
  edit_own_schedule: boolean;
  view_all_reports: boolean;
  submit_reports: boolean;
  cad_full_access: boolean;
  cad_view_only: boolean;
  edit_clients: boolean;
  view_clients: boolean;
  payroll_access: boolean;
  qb_integration: boolean;
  view_own_pay: boolean;
  dockchat_admin: boolean;
  trinity_full_access: boolean;
  manage_employees: boolean;
  view_analytics: boolean;
  manage_compliance: boolean;
  manage_equipment: boolean;
  manage_guard_tours: boolean;
}

export interface PositionDefinition {
  id: string;
  label: string;
  authorityLevel: number;
  category: PositionCategory;
  color: string;
  armedStatus: ArmedStatus;
  workspaceRole: string;
  permissions: FeaturePermissions;
}

export interface CategoryDefinition {
  id: PositionCategory;
  label: string;
  color: string;
  borderStyle: 'border' | 'fill';
  authorityRange: [number, number];
}

const FULL_PERMISSIONS: FeaturePermissions = {
  edit_org_settings: true,
  manage_billing: true,
  add_remove_users: true,
  edit_all_schedules: true,
  edit_own_schedule: true,
  view_all_reports: true,
  submit_reports: true,
  cad_full_access: true,
  cad_view_only: true,
  edit_clients: true,
  view_clients: true,
  payroll_access: true,
  qb_integration: true,
  view_own_pay: true,
  dockchat_admin: true,
  trinity_full_access: true,
  manage_employees: true,
  view_analytics: true,
  manage_compliance: true,
  manage_equipment: true,
  manage_guard_tours: true,
};

function p(overrides: Partial<FeaturePermissions>): FeaturePermissions {
  return {
    edit_org_settings: false,
    manage_billing: false,
    add_remove_users: false,
    edit_all_schedules: false,
    edit_own_schedule: false,
    view_all_reports: false,
    submit_reports: false,
    cad_full_access: false,
    cad_view_only: false,
    edit_clients: false,
    view_clients: false,
    payroll_access: false,
    qb_integration: false,
    view_own_pay: true,
    dockchat_admin: false,
    trinity_full_access: false,
    manage_employees: false,
    view_analytics: false,
    manage_compliance: false,
    manage_equipment: false,
    manage_guard_tours: false,
    ...overrides,
  };
}

export const POSITION_CATEGORIES: CategoryDefinition[] = [
  { id: 'chiefs', label: 'Executive Leadership', color: '#FF8C00', borderStyle: 'border', authorityRange: [1, 3] },
  { id: 'admin_command', label: 'Administrative Command', color: '#8B5CF6', borderStyle: 'border', authorityRange: [4, 6] },
  { id: 'field_supervisors', label: 'Field Supervisors', color: '#3B82F6', borderStyle: 'border', authorityRange: [7, 8] },
  { id: 'admin_staff', label: 'Administrative Staff', color: '#6B7280', borderStyle: 'border', authorityRange: [7, 8] },
  { id: 'case_managers', label: 'Case Managers', color: '#F59E0B', borderStyle: 'border', authorityRange: [7, 8] },
  { id: 'dispatchers', label: 'Dispatchers', color: '#06B6D4', borderStyle: 'border', authorityRange: [9, 9] },
  { id: 'armed', label: 'Armed Staff', color: '#DC2626', borderStyle: 'fill', authorityRange: [10, 10] },
  { id: 'unarmed', label: 'Unarmed Staff', color: '#92400E', borderStyle: 'fill', authorityRange: [10, 10] },
];

export const POSITION_REGISTRY: PositionDefinition[] = [
  {
    id: 'chief_of_operations',
    label: 'Chief of Operations',
    authorityLevel: 1,
    category: 'chiefs',
    color: '#FF8C00',
    armedStatus: 'n/a',
    workspaceRole: 'org_owner',
    permissions: FULL_PERMISSIONS,
  },
  {
    id: 'assistant_chief',
    label: 'Assistant Chief',
    authorityLevel: 2,
    category: 'chiefs',
    color: '#FF8C00',
    armedStatus: 'n/a',
    workspaceRole: 'co_owner',
    permissions: { ...FULL_PERMISSIONS, edit_org_settings: true },
  },
  {
    id: 'deputy_chief',
    label: 'Deputy Chief',
    authorityLevel: 3,
    category: 'chiefs',
    color: '#FF8C00',
    armedStatus: 'n/a',
    workspaceRole: 'co_owner',
    permissions: { ...FULL_PERMISSIONS, edit_org_settings: true },
  },
  {
    id: 'captain',
    label: 'Captain',
    authorityLevel: 4,
    category: 'admin_command',
    color: '#8B5CF6',
    armedStatus: 'n/a',
    workspaceRole: 'manager',
    permissions: p({
      add_remove_users: true,
      edit_all_schedules: true,
      edit_own_schedule: true,
      view_all_reports: true,
      submit_reports: true,
      cad_full_access: true,
      cad_view_only: true,
      edit_clients: true,
      view_clients: true,
      dockchat_admin: true,
      manage_employees: true,
      view_analytics: true,
      manage_compliance: true,
      manage_equipment: true,
      manage_guard_tours: true,
    }),
  },
  {
    id: 'commander',
    label: 'Commander',
    authorityLevel: 5,
    category: 'admin_command',
    color: '#8B5CF6',
    armedStatus: 'n/a',
    workspaceRole: 'manager',
    permissions: p({
      add_remove_users: true,
      edit_all_schedules: true,
      edit_own_schedule: true,
      view_all_reports: true,
      submit_reports: true,
      cad_full_access: true,
      cad_view_only: true,
      edit_clients: true,
      view_clients: true,
      manage_employees: true,
      view_analytics: true,
      manage_compliance: true,
      manage_equipment: true,
      manage_guard_tours: true,
    }),
  },
  {
    id: 'lieutenant',
    label: 'Lieutenant',
    authorityLevel: 6,
    category: 'admin_command',
    color: '#8B5CF6',
    armedStatus: 'n/a',
    workspaceRole: 'manager',
    permissions: p({
      edit_all_schedules: true,
      edit_own_schedule: true,
      view_all_reports: true,
      submit_reports: true,
      cad_full_access: true,
      cad_view_only: true,
      view_clients: true,
      manage_employees: true,
      view_analytics: true,
      manage_equipment: true,
      manage_guard_tours: true,
    }),
  },
  {
    id: 'sergeant',
    label: 'Sergeant',
    authorityLevel: 7,
    category: 'field_supervisors',
    color: '#3B82F6',
    armedStatus: 'varies',
    workspaceRole: 'supervisor',
    permissions: p({
      edit_own_schedule: true,
      view_all_reports: true,
      submit_reports: true,
      cad_view_only: true,
      view_clients: true,
      manage_guard_tours: true,
    }),
  },
  {
    id: 'corporal',
    label: 'Corporal',
    authorityLevel: 8,
    category: 'field_supervisors',
    color: '#3B82F6',
    armedStatus: 'varies',
    workspaceRole: 'supervisor',
    permissions: p({
      edit_own_schedule: true,
      view_all_reports: true,
      submit_reports: true,
      cad_view_only: true,
      view_clients: true,
    }),
  },
  {
    id: 'field_training_officer',
    label: 'Field Training Officer',
    authorityLevel: 8,
    category: 'field_supervisors',
    color: '#3B82F6',
    armedStatus: 'varies',
    workspaceRole: 'supervisor',
    permissions: p({
      edit_own_schedule: true,
      view_all_reports: true,
      submit_reports: true,
      cad_view_only: true,
      view_clients: true,
    }),
  },
  {
    id: 'tech_officer',
    label: 'Tech Officer',
    authorityLevel: 7,
    category: 'admin_staff',
    color: '#6B7280',
    armedStatus: 'n/a',
    workspaceRole: 'staff',
    permissions: p({
      edit_own_schedule: true,
      submit_reports: true,
      cad_view_only: true,
      view_clients: true,
      view_analytics: true,
    }),
  },
  {
    id: 'fleet_officer',
    label: 'Fleet Officer',
    authorityLevel: 7,
    category: 'admin_staff',
    color: '#6B7280',
    armedStatus: 'n/a',
    workspaceRole: 'staff',
    permissions: p({
      edit_own_schedule: true,
      submit_reports: true,
      view_clients: true,
      manage_equipment: true,
    }),
  },
  {
    id: 'records_officer',
    label: 'Records Officer',
    authorityLevel: 7,
    category: 'admin_staff',
    color: '#6B7280',
    armedStatus: 'n/a',
    workspaceRole: 'staff',
    permissions: p({
      submit_reports: true,
      view_all_reports: true,
      view_clients: true,
      manage_compliance: true,
    }),
  },
  {
    id: 'hr_personnel',
    label: 'HR Personnel',
    authorityLevel: 7,
    category: 'admin_staff',
    color: '#6B7280',
    armedStatus: 'n/a',
    workspaceRole: 'staff',
    permissions: p({
      submit_reports: true,
      view_all_reports: true,
      view_clients: true,
      manage_employees: true,
      manage_compliance: true,
    }),
  },
  {
    id: 'ap_ar',
    label: 'AP/AR Specialist',
    authorityLevel: 7,
    category: 'admin_staff',
    color: '#6B7280',
    armedStatus: 'n/a',
    workspaceRole: 'staff',
    permissions: p({
      submit_reports: true,
      view_clients: true,
      payroll_access: true,
    }),
  },
  {
    id: 'admin_assistant',
    label: 'Administrative Assistant',
    authorityLevel: 8,
    category: 'admin_staff',
    color: '#6B7280',
    armedStatus: 'n/a',
    workspaceRole: 'staff',
    permissions: p({
      edit_own_schedule: true,
      submit_reports: true,
      view_clients: true,
    }),
  },
  {
    id: 'sales_marketing',
    label: 'Sales/Marketing Staff',
    authorityLevel: 8,
    category: 'admin_staff',
    color: '#6B7280',
    armedStatus: 'n/a',
    workspaceRole: 'staff',
    permissions: p({
      submit_reports: true,
      view_clients: true,
      edit_clients: true,
    }),
  },
  {
    id: 'case_manager',
    label: 'Case Manager',
    authorityLevel: 7,
    category: 'case_managers',
    color: '#F59E0B',
    armedStatus: 'n/a',
    workspaceRole: 'staff',
    permissions: p({
      submit_reports: true,
      view_all_reports: true,
      view_clients: true,
      edit_clients: true,
    }),
  },
  {
    id: 'dispatcher',
    label: 'Dispatcher',
    authorityLevel: 9,
    category: 'dispatchers',
    color: '#06B6D4',
    armedStatus: 'n/a',
    workspaceRole: 'staff',
    permissions: p({
      submit_reports: true,
      cad_full_access: true,
      cad_view_only: true,
      view_clients: true,
      view_all_reports: true,
    }),
  },
  {
    id: 'patrol_armed',
    label: 'Patrol Officer (Armed)',
    authorityLevel: 10,
    category: 'armed',
    color: '#DC2626',
    armedStatus: 'armed',
    workspaceRole: 'employee',
    permissions: p({
      submit_reports: true,
      cad_view_only: true,
      view_clients: true,
    }),
  },
  {
    id: 'staff_armed',
    label: 'Staff (Armed)',
    authorityLevel: 10,
    category: 'armed',
    color: '#DC2626',
    armedStatus: 'armed',
    workspaceRole: 'employee',
    permissions: p({
      submit_reports: true,
      cad_view_only: true,
      view_clients: true,
    }),
  },
  {
    id: 'patrol_unarmed',
    label: 'Patrol Officer (Unarmed)',
    authorityLevel: 10,
    category: 'unarmed',
    color: '#92400E',
    armedStatus: 'unarmed',
    workspaceRole: 'employee',
    permissions: p({
      submit_reports: true,
      cad_view_only: true,
      view_clients: true,
    }),
  },
  {
    id: 'staff_unarmed',
    label: 'Staff (Unarmed)',
    authorityLevel: 10,
    category: 'unarmed',
    color: '#92400E',
    armedStatus: 'unarmed',
    workspaceRole: 'employee',
    permissions: p({
      submit_reports: true,
      cad_view_only: true,
      view_clients: true,
    }),
  },
];

const positionMap = new Map(POSITION_REGISTRY.map(pos => [pos.id, pos]));
const categoryMap = new Map(POSITION_CATEGORIES.map(cat => [cat.id, cat]));

export function getPositionById(positionId: string): PositionDefinition | undefined {
  return positionMap.get(positionId);
}

export function getPositionByTitle(title: string): PositionDefinition | undefined {
  if (!title) return undefined;
  const lower = title.toLowerCase().trim();
  const byId = positionMap.get(lower.replace(/\s+/g, '_'));
  if (byId) return byId;
  return POSITION_REGISTRY.find(pos =>
    pos.label.toLowerCase() === lower ||
    pos.id === lower ||
    pos.label.toLowerCase().includes(lower) ||
    lower.includes(pos.label.toLowerCase())
  );
}

export function inferPositionFromTitle(title: string): PositionDefinition | undefined {
  if (!title) return undefined;
  const lower = title.toLowerCase().trim();

  const exactMatch = getPositionByTitle(title);
  if (exactMatch) return exactMatch;

  const keywords: [RegExp, string][] = [
    [/\b(chief\s+of\s+op|coo(?!\w)|chief\s+operations)\b/i, 'chief_of_operations'],
    [/\b(assistant\s+chief|asst\.?\s+chief)\b/i, 'assistant_chief'],
    [/\b(deputy\s+chief)\b/i, 'deputy_chief'],
    [/\bcaptain\b/i, 'captain'],
    [/\bcommander\b/i, 'commander'],
    [/\blieutenant\b/i, 'lieutenant'],
    [/\bsergeant\b|\bsgt\b/i, 'sergeant'],
    [/\bcorporal\b|\bcpl\b/i, 'corporal'],
    [/\b(fto|field\s+training)\b/i, 'field_training_officer'],
    [/\btech\s+officer\b/i, 'tech_officer'],
    [/\bfleet\s+officer\b/i, 'fleet_officer'],
    [/\brecords?\s+officer\b/i, 'records_officer'],
    [/\b(hr|human\s+resources)\b/i, 'hr_personnel'],
    [/\b(ap\/?ar|accounts?\s+(payable|receivable))\b/i, 'ap_ar'],
    [/\badmin(istrative)?\s+assist/i, 'admin_assistant'],
    [/\b(sales|marketing)\b/i, 'sales_marketing'],
    [/\bcase\s+manager\b/i, 'case_manager'],
    [/\bdispatch/i, 'dispatcher'],
    [/\b(armed.*patrol|patrol.*armed)\b/i, 'patrol_armed'],
    [/\b(armed.*staff|staff.*armed|armed.*guard|guard.*armed|armed.*officer)\b/i, 'staff_armed'],
    [/\b(unarmed.*patrol|patrol.*unarmed)\b/i, 'patrol_unarmed'],
    [/\b(patrol|officer)\b/i, 'patrol_unarmed'],
    [/\b(unarmed|guard|security\s+officer|security\s+guard)\b/i, 'staff_unarmed'],
  ];

  for (const [regex, posId] of keywords) {
    if (regex.test(lower)) {
      return positionMap.get(posId);
    }
  }

  return undefined;
}

export function getAuthorityLevel(positionId: string): number {
  const pos = positionMap.get(positionId);
  return pos ? pos.authorityLevel : 10;
}

export function getPositionColor(positionId: string): string {
  const pos = positionMap.get(positionId);
  return pos ? pos.color : '#6B7280';
}

export function getCategoryForPosition(positionId: string): CategoryDefinition | undefined {
  const pos = positionMap.get(positionId);
  if (!pos) return undefined;
  return categoryMap.get(pos.category);
}

export function canEditTarget(editorPositionId: string, targetPositionId: string): boolean {
  const editor = positionMap.get(editorPositionId);
  const target = positionMap.get(targetPositionId);
  if (!editor || !target) return false;
  return editor.authorityLevel < target.authorityLevel;
}

export function canPromoteTo(editorPositionId: string, targetNewPositionId: string): boolean {
  const editor = positionMap.get(editorPositionId);
  const newPos = positionMap.get(targetNewPositionId);
  if (!editor || !newPos) return false;
  return editor.authorityLevel < newPos.authorityLevel;
}

export function getFeaturePermissions(positionId: string): FeaturePermissions {
  const pos = positionMap.get(positionId);
  if (!pos) {
    return p({});
  }
  return pos.permissions;
}

export function getPositionsBelow(authorityLevel: number): PositionDefinition[] {
  return POSITION_REGISTRY.filter(pos => pos.authorityLevel > authorityLevel);
}

export function getPositionsAbove(authorityLevel: number): PositionDefinition[] {
  return POSITION_REGISTRY.filter(pos => pos.authorityLevel < authorityLevel);
}

export function getPositionsByCategory(category: PositionCategory): PositionDefinition[] {
  return POSITION_REGISTRY.filter(pos => pos.category === category);
}

export function isArmed(positionId: string): boolean {
  const pos = positionMap.get(positionId);
  return pos?.armedStatus === 'armed';
}

export function getWorkspaceRoleForPosition(positionId: string): string {
  const pos = positionMap.get(positionId);
  return pos?.workspaceRole || 'employee';
}

export function mapAuthorityToWorkspaceLevel(authorityLevel: number): number {
  if (authorityLevel <= 1) return 6;
  if (authorityLevel <= 3) return 5;
  if (authorityLevel <= 6) return 4;
  if (authorityLevel <= 8) return 3;
  if (authorityLevel === 9) return 2;
  return 2;
}
