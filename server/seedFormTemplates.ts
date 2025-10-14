// Industry-Specific Form Template Seed Data
// These templates are auto-activated based on workspace's businessCategory

export const systemFormTemplates = {
  // ============================================================================
  // SECURITY INDUSTRY FORMS
  // ============================================================================
  security: [
    {
      name: "Daily Activity Report (DAR)",
      description: "Standard security guard daily activity log with incident tracking",
      category: "security",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "shift_start", label: "Shift Start Time", type: "time", required: true },
        { name: "shift_end", label: "Shift End Time", type: "time", required: true },
        { name: "officer_name", label: "Officer Name", type: "text", required: true },
        { name: "location", label: "Location/Post", type: "text", required: true },
        { name: "weather", label: "Weather Conditions", type: "select", options: ["Clear", "Rain", "Snow", "Fog", "Wind"], required: false },
        { name: "activities", label: "Activities Performed", type: "textarea", required: true },
        { name: "incidents", label: "Incidents/Observations", type: "textarea", required: false },
        { name: "visitors", label: "Visitor Log", type: "textarea", required: false },
        { name: "vehicle_patrols", label: "Vehicle Patrols Conducted", type: "number", required: false },
        { name: "alarms", label: "Alarm Activations", type: "textarea", required: false },
        { name: "equipment_check", label: "Equipment Status", type: "select", options: ["All Functional", "Issues Noted"], required: true },
        { name: "notes", label: "Additional Notes", type: "textarea", required: false }
      ]
    },
    {
      name: "Incident Report",
      description: "Detailed incident documentation for security events",
      category: "security",
      fields: [
        { name: "incident_number", label: "Incident Number", type: "text", required: true },
        { name: "date", label: "Date of Incident", type: "date", required: true },
        { name: "time", label: "Time of Incident", type: "time", required: true },
        { name: "location", label: "Location", type: "text", required: true },
        { name: "incident_type", label: "Incident Type", type: "select", options: ["Theft", "Vandalism", "Trespassing", "Medical Emergency", "Fire", "Suspicious Activity", "Other"], required: true },
        { name: "description", label: "Incident Description", type: "textarea", required: true },
        { name: "persons_involved", label: "Persons Involved", type: "textarea", required: false },
        { name: "witnesses", label: "Witnesses", type: "textarea", required: false },
        { name: "police_notified", label: "Police Notified?", type: "select", options: ["Yes", "No"], required: true },
        { name: "police_report_number", label: "Police Report Number", type: "text", required: false },
        { name: "action_taken", label: "Action Taken", type: "textarea", required: true },
        { name: "supervisor_notified", label: "Supervisor Notified", type: "select", options: ["Yes", "No"], required: true }
      ]
    },
    {
      name: "Vehicle Log",
      description: "Security patrol vehicle inspection and usage log",
      category: "security",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "vehicle_id", label: "Vehicle ID/Number", type: "text", required: true },
        { name: "officer_name", label: "Officer Name", type: "text", required: true },
        { name: "odometer_start", label: "Starting Odometer", type: "number", required: true },
        { name: "odometer_end", label: "Ending Odometer", type: "number", required: true },
        { name: "fuel_level_start", label: "Starting Fuel Level", type: "select", options: ["Full", "3/4", "1/2", "1/4", "Empty"], required: true },
        { name: "fuel_level_end", label: "Ending Fuel Level", type: "select", options: ["Full", "3/4", "1/2", "1/4", "Empty"], required: true },
        { name: "vehicle_condition", label: "Vehicle Condition", type: "select", options: ["Excellent", "Good", "Fair", "Poor"], required: true },
        { name: "damages_noted", label: "Damages/Issues Noted", type: "textarea", required: false }
      ]
    }
  ],

  // ============================================================================
  // HEALTHCARE INDUSTRY FORMS
  // ============================================================================
  healthcare: [
    {
      name: "Patient Activity Log",
      description: "Daily patient care activity documentation",
      category: "healthcare",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "patient_id", label: "Patient ID", type: "text", required: true },
        { name: "caregiver_name", label: "Caregiver Name", type: "text", required: true },
        { name: "vital_signs", label: "Vital Signs", type: "textarea", required: true },
        { name: "medications", label: "Medications Administered", type: "textarea", required: true },
        { name: "meals", label: "Meals/Nutrition", type: "textarea", required: true },
        { name: "activities", label: "Activities Performed", type: "textarea", required: true },
        { name: "behavioral_notes", label: "Behavioral Observations", type: "textarea", required: false },
        { name: "incidents", label: "Incidents/Concerns", type: "textarea", required: false }
      ]
    },
    {
      name: "Incident Report (Healthcare)",
      description: "Healthcare incident and adverse event reporting",
      category: "healthcare",
      fields: [
        { name: "date", label: "Date of Incident", type: "date", required: true },
        { name: "time", label: "Time of Incident", type: "time", required: true },
        { name: "patient_id", label: "Patient ID", type: "text", required: true },
        { name: "incident_type", label: "Incident Type", type: "select", options: ["Fall", "Medication Error", "Equipment Failure", "Behavioral Incident", "Other"], required: true },
        { name: "description", label: "Description", type: "textarea", required: true },
        { name: "witnesses", label: "Witnesses", type: "textarea", required: false },
        { name: "physician_notified", label: "Physician Notified?", type: "select", options: ["Yes", "No"], required: true },
        { name: "family_notified", label: "Family Notified?", type: "select", options: ["Yes", "No"], required: true },
        { name: "action_taken", label: "Action Taken", type: "textarea", required: true }
      ]
    }
  ],

  // ============================================================================
  // CONSTRUCTION INDUSTRY FORMS
  // ============================================================================
  construction: [
    {
      name: "Safety Checklist",
      description: "Daily construction site safety inspection",
      category: "construction",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "inspector_name", label: "Inspector Name", type: "text", required: true },
        { name: "site_location", label: "Site Location", type: "text", required: true },
        { name: "ppe_compliance", label: "PPE Compliance", type: "select", options: ["Pass", "Fail"], required: true },
        { name: "scaffolding_condition", label: "Scaffolding Condition", type: "select", options: ["Good", "Needs Repair", "N/A"], required: false },
        { name: "equipment_safety", label: "Equipment Safety", type: "select", options: ["Pass", "Fail"], required: true },
        { name: "housekeeping", label: "Site Housekeeping", type: "select", options: ["Pass", "Fail"], required: true },
        { name: "hazards_noted", label: "Hazards Noted", type: "textarea", required: false },
        { name: "corrective_actions", label: "Corrective Actions Required", type: "textarea", required: false }
      ]
    },
    {
      name: "On-the-Job Training (OJT) Form",
      description: "Employee training documentation and competency assessment",
      category: "construction",
      fields: [
        { name: "date", label: "Training Date", type: "date", required: true },
        { name: "trainee_name", label: "Trainee Name", type: "text", required: true },
        { name: "trainer_name", label: "Trainer Name", type: "text", required: true },
        { name: "training_topic", label: "Training Topic", type: "text", required: true },
        { name: "skills_covered", label: "Skills Covered", type: "textarea", required: true },
        { name: "demonstration", label: "Trainee Demonstrated Competency?", type: "select", options: ["Yes", "Needs More Practice", "No"], required: true },
        { name: "safety_requirements", label: "Safety Requirements Covered", type: "textarea", required: true },
        { name: "next_steps", label: "Next Training Steps", type: "textarea", required: false },
        { name: "trainer_signature", label: "Trainer Approval", type: "signature", required: true }
      ]
    },
    {
      name: "Equipment Inspection Log",
      description: "Heavy equipment daily inspection checklist",
      category: "construction",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "equipment_type", label: "Equipment Type", type: "text", required: true },
        { name: "equipment_id", label: "Equipment ID/Number", type: "text", required: true },
        { name: "operator_name", label: "Operator Name", type: "text", required: true },
        { name: "hour_meter", label: "Hour Meter Reading", type: "number", required: true },
        { name: "fluid_levels", label: "Fluid Levels Check", type: "select", options: ["Pass", "Fail"], required: true },
        { name: "tire_tracks_condition", label: "Tires/Tracks Condition", type: "select", options: ["Pass", "Fail"], required: true },
        { name: "safety_devices", label: "Safety Devices Functional", type: "select", options: ["Pass", "Fail"], required: true },
        { name: "defects_noted", label: "Defects/Issues Noted", type: "textarea", required: false },
        { name: "equipment_status", label: "Equipment Status", type: "select", options: ["Safe to Operate", "Needs Repair", "Out of Service"], required: true }
      ]
    }
  ],

  // ============================================================================
  // CLEANING INDUSTRY FORMS
  // ============================================================================
  cleaning: [
    {
      name: "Cleaning Inspection Checklist",
      description: "Quality control checklist for cleaning services",
      category: "cleaning",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "location", label: "Location/Facility", type: "text", required: true },
        { name: "inspector_name", label: "Inspector Name", type: "text", required: true },
        { name: "restrooms", label: "Restrooms", type: "select", options: ["Pass", "Fail", "N/A"], required: true },
        { name: "floors", label: "Floors/Carpets", type: "select", options: ["Pass", "Fail", "N/A"], required: true },
        { name: "surfaces", label: "Surfaces/Counters", type: "select", options: ["Pass", "Fail", "N/A"], required: true },
        { name: "trash_removal", label: "Trash Removal", type: "select", options: ["Pass", "Fail", "N/A"], required: true },
        { name: "windows", label: "Windows", type: "select", options: ["Pass", "Fail", "N/A"], required: true },
        { name: "notes", label: "Additional Notes", type: "textarea", required: false }
      ]
    },
    {
      name: "Supply Inventory Log",
      description: "Cleaning supplies inventory tracking",
      category: "cleaning",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "location", label: "Location", type: "text", required: true },
        { name: "supplies_used", label: "Supplies Used", type: "textarea", required: true },
        { name: "supplies_restocked", label: "Supplies Restocked", type: "textarea", required: true },
        { name: "low_stock_items", label: "Low Stock Items", type: "textarea", required: false }
      ]
    }
  ],

  // ============================================================================
  // RETAIL INDUSTRY FORMS
  // ============================================================================
  retail: [
    {
      name: "Opening/Closing Shift Report",
      description: "Retail store opening and closing checklist",
      category: "retail",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "shift_type", label: "Shift Type", type: "select", options: ["Opening", "Closing"], required: true },
        { name: "manager_name", label: "Manager Name", type: "text", required: true },
        { name: "register_count", label: "Register Count", type: "number", required: true },
        { name: "discrepancies", label: "Discrepancies Noted", type: "textarea", required: false },
        { name: "inventory_check", label: "Inventory Spot Check", type: "textarea", required: false },
        { name: "store_condition", label: "Store Condition", type: "select", options: ["Excellent", "Good", "Needs Attention"], required: true },
        { name: "incidents", label: "Incidents/Issues", type: "textarea", required: false }
      ]
    }
  ],

  // ============================================================================
  // GENERAL/DEFAULT FORMS (All workspaces)
  // ============================================================================
  general: [
    {
      name: "Disciplinary Action Form",
      description: "Employee disciplinary action documentation",
      category: "general",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "employee_name", label: "Employee Name", type: "text", required: true },
        { name: "supervisor_name", label: "Supervisor Name", type: "text", required: true },
        { name: "violation_type", label: "Type of Violation", type: "select", options: ["Attendance", "Performance", "Conduct", "Safety", "Policy Violation", "Other"], required: true },
        { name: "description", label: "Description of Incident", type: "textarea", required: true },
        { name: "previous_warnings", label: "Previous Warnings", type: "textarea", required: false },
        { name: "action_taken", label: "Action Taken", type: "select", options: ["Verbal Warning", "Written Warning", "Suspension", "Termination"], required: true },
        { name: "improvement_plan", label: "Performance Improvement Plan", type: "textarea", required: false },
        { name: "employee_statement", label: "Employee Statement", type: "textarea", required: false },
        { name: "employee_signature", label: "Employee Acknowledgment", type: "signature", required: false },
        { name: "supervisor_signature", label: "Supervisor Signature", type: "signature", required: true }
      ]
    },
    {
      name: "General Incident Report",
      description: "General workplace incident documentation",
      category: "general",
      fields: [
        { name: "date", label: "Date of Incident", type: "date", required: true },
        { name: "time", label: "Time of Incident", type: "time", required: true },
        { name: "location", label: "Location", type: "text", required: true },
        { name: "incident_type", label: "Incident Type", type: "select", options: ["Injury", "Property Damage", "Safety Hazard", "Policy Violation", "Other"], required: true },
        { name: "description", label: "Description", type: "textarea", required: true },
        { name: "persons_involved", label: "Persons Involved", type: "textarea", required: false },
        { name: "witnesses", label: "Witnesses", type: "textarea", required: false },
        { name: "action_taken", label: "Action Taken", type: "textarea", required: true }
      ]
    }
  ]
};

// Helper to get templates for a specific business category
export function getTemplatesForCategory(category: string): any[] {
  // Always include general templates
  const templates = [...(systemFormTemplates.general || [])];
  
  // Add industry-specific templates
  if (category && category !== 'general' && systemFormTemplates[category as keyof typeof systemFormTemplates]) {
    templates.push(...systemFormTemplates[category as keyof typeof systemFormTemplates]);
  }
  
  return templates;
}

// Get all available categories with descriptions
export const businessCategories = [
  { value: 'general', label: 'General Business', description: 'Basic forms for any industry' },
  { value: 'security', label: 'Security Services', description: 'Guard services, surveillance - DAR, incident reports' },
  { value: 'healthcare', label: 'Healthcare', description: 'Patient care, medical facilities - activity logs, compliance forms' },
  { value: 'construction', label: 'Construction', description: 'Building, trade work - safety checklists, OJT, equipment logs' },
  { value: 'cleaning', label: 'Cleaning Services', description: 'Janitorial, maintenance - inspection checklists, supply logs' },
  { value: 'hospitality', label: 'Hospitality', description: 'Hotels, restaurants - service logs, maintenance reports' },
  { value: 'retail', label: 'Retail', description: 'Stores, shops - inventory logs, shift reports' },
  { value: 'transportation', label: 'Transportation', description: 'Logistics, delivery - vehicle logs, route reports' },
  { value: 'manufacturing', label: 'Manufacturing', description: 'Production facilities - production logs, quality control' },
  { value: 'education', label: 'Education', description: 'Schools, training - attendance, assessment forms' },
  { value: 'custom', label: 'Custom Industry', description: 'Fully customized forms configured by support team' }
];
