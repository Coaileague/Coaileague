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
      requiresPhotos: true,
      minPhotos: 1,
      maxPhotos: 5,
      photoInstructions: "Photos must be clear, well-lighted, and timestamped. Include site overview and any notable incidents or conditions.",
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
      requiresPhotos: true,
      minPhotos: 2,
      maxPhotos: 10,
      photoInstructions: "CRITICAL: Photos required for evidence and transparency. Must be clear, well-lighted, showing full scene from multiple angles. Include all damage, persons involved (if safe), and relevant evidence.",
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
    },
    {
      name: "Guard Post Orders",
      description: "Site-specific instructions and protocols for security officers",
      category: "security",
      fields: [
        { name: "date", label: "Effective Date", type: "date", required: true },
        { name: "site_name", label: "Site/Property Name", type: "text", required: true },
        { name: "site_address", label: "Site Address", type: "text", required: true },
        { name: "post_number", label: "Post Number/Name", type: "text", required: true },
        { name: "shift", label: "Shift", type: "select", options: ["Day", "Swing", "Night", "24-Hour"], required: true },
        { name: "uniform_requirements", label: "Uniform Requirements", type: "textarea", required: true },
        { name: "access_points", label: "Access Points & Entry Procedures", type: "textarea", required: true },
        { name: "patrol_route", label: "Patrol Route Description", type: "textarea", required: true },
        { name: "emergency_contacts", label: "Emergency Contacts", type: "textarea", required: true },
        { name: "client_instructions", label: "Client-Specific Instructions", type: "textarea", required: true },
        { name: "prohibited_items", label: "Prohibited Items/Activities", type: "textarea", required: false },
        { name: "alarm_procedures", label: "Alarm Response Procedures", type: "textarea", required: true },
        { name: "fire_evacuation", label: "Fire/Evacuation Procedures", type: "textarea", required: true },
        { name: "special_instructions", label: "Special Instructions", type: "textarea", required: false },
        { name: "acknowledged_by", label: "Officer Acknowledgment", type: "signature", required: true }
      ]
    },
    {
      name: "Patrol Log",
      description: "Checkpoint-based patrol documentation with timestamps",
      category: "security",
      requiresPhotos: true,
      minPhotos: 1,
      maxPhotos: 8,
      photoInstructions: "Photo each checkpoint visited. Include timestamps and any anomalies discovered during patrol.",
      fields: [
        { name: "date", label: "Patrol Date", type: "date", required: true },
        { name: "officer_name", label: "Officer Name", type: "text", required: true },
        { name: "patrol_start", label: "Patrol Start Time", type: "time", required: true },
        { name: "patrol_end", label: "Patrol End Time", type: "time", required: true },
        { name: "patrol_type", label: "Patrol Type", type: "select", options: ["Foot Patrol", "Vehicle Patrol", "Bike Patrol", "Interior Patrol", "Perimeter Patrol"], required: true },
        { name: "checkpoint_1", label: "Checkpoint 1 - Location & Time", type: "text", required: true },
        { name: "checkpoint_2", label: "Checkpoint 2 - Location & Time", type: "text", required: false },
        { name: "checkpoint_3", label: "Checkpoint 3 - Location & Time", type: "text", required: false },
        { name: "checkpoint_4", label: "Checkpoint 4 - Location & Time", type: "text", required: false },
        { name: "checkpoint_5", label: "Checkpoint 5 - Location & Time", type: "text", required: false },
        { name: "doors_windows_secure", label: "All Doors/Windows Secure?", type: "select", options: ["Yes", "No - Details Below"], required: true },
        { name: "lights_functioning", label: "All Lights Functioning?", type: "select", options: ["Yes", "No - Details Below"], required: true },
        { name: "suspicious_activity", label: "Suspicious Activity Observed", type: "textarea", required: false },
        { name: "maintenance_issues", label: "Maintenance Issues Noted", type: "textarea", required: false },
        { name: "notes", label: "Additional Notes", type: "textarea", required: false }
      ]
    },
    {
      name: "Visitor Log",
      description: "Sign-in/out tracking for visitors and contractors",
      category: "security",
      requiresPhotos: true,
      minPhotos: 0,
      maxPhotos: 3,
      photoInstructions: "Photo visitor ID badge if required by site policy. Ensure photo is clear and legible.",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "officer_name", label: "Officer on Duty", type: "text", required: true },
        { name: "visitor_name", label: "Visitor Name", type: "text", required: true },
        { name: "visitor_company", label: "Visitor Company/Organization", type: "text", required: false },
        { name: "visitor_type", label: "Visitor Type", type: "select", options: ["Guest", "Contractor", "Vendor", "Delivery", "Inspector", "Emergency Services", "Other"], required: true },
        { name: "id_type", label: "ID Type Presented", type: "select", options: ["Driver License", "State ID", "Passport", "Company Badge", "Military ID", "None"], required: true },
        { name: "id_verified", label: "ID Verified?", type: "select", options: ["Yes", "No", "N/A"], required: true },
        { name: "host_name", label: "Host/Person Being Visited", type: "text", required: true },
        { name: "purpose", label: "Purpose of Visit", type: "text", required: true },
        { name: "badge_number", label: "Visitor Badge Number Issued", type: "text", required: false },
        { name: "sign_in_time", label: "Sign-In Time", type: "time", required: true },
        { name: "sign_out_time", label: "Sign-Out Time", type: "time", required: false },
        { name: "vehicle_info", label: "Vehicle Info (Make/Model/Plate)", type: "text", required: false },
        { name: "items_carried", label: "Items/Equipment Carried In", type: "textarea", required: false },
        { name: "notes", label: "Additional Notes", type: "textarea", required: false }
      ]
    },
    {
      name: "Shift Handoff Report",
      description: "End-of-shift summary for incoming guard",
      category: "security",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "outgoing_officer", label: "Outgoing Officer", type: "text", required: true },
        { name: "incoming_officer", label: "Incoming Officer", type: "text", required: true },
        { name: "shift_ending", label: "Shift Ending", type: "select", options: ["Day (0600-1400)", "Swing (1400-2200)", "Night (2200-0600)", "Custom"], required: true },
        { name: "shift_end_time", label: "Shift End Time", type: "time", required: true },
        { name: "incidents_summary", label: "Incidents During Shift", type: "textarea", required: true },
        { name: "ongoing_issues", label: "Ongoing Issues/Situations", type: "textarea", required: false },
        { name: "visitor_count", label: "Total Visitors This Shift", type: "number", required: false },
        { name: "patrols_completed", label: "Patrols Completed", type: "number", required: true },
        { name: "equipment_status", label: "Equipment Status", type: "select", options: ["All Functional", "Issues - See Notes"], required: true },
        { name: "keys_accounted", label: "All Keys Accounted For?", type: "select", options: ["Yes", "No - See Notes"], required: true },
        { name: "pending_tasks", label: "Pending Tasks for Next Shift", type: "textarea", required: false },
        { name: "management_notifications", label: "Items Requiring Management Attention", type: "textarea", required: false },
        { name: "outgoing_signature", label: "Outgoing Officer Signature", type: "signature", required: true },
        { name: "incoming_signature", label: "Incoming Officer Acknowledgment", type: "signature", required: true }
      ]
    },
    {
      name: "Key/Access Control Log",
      description: "Key issuance and return tracking",
      category: "security",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "officer_name", label: "Issuing Officer", type: "text", required: true },
        { name: "key_number", label: "Key Number/ID", type: "text", required: true },
        { name: "key_description", label: "Key Description", type: "text", required: true },
        { name: "action", label: "Action", type: "select", options: ["Issued", "Returned", "Lost", "Replacement Issued", "Deactivated"], required: true },
        { name: "issued_to", label: "Issued To (Name)", type: "text", required: true },
        { name: "issued_to_company", label: "Company/Department", type: "text", required: false },
        { name: "purpose", label: "Purpose/Reason", type: "text", required: true },
        { name: "issue_time", label: "Issue Time", type: "time", required: true },
        { name: "expected_return", label: "Expected Return Time", type: "time", required: false },
        { name: "actual_return_time", label: "Actual Return Time", type: "time", required: false },
        { name: "return_condition", label: "Return Condition", type: "select", options: ["Good", "Damaged", "Not Returned", "N/A"], required: false },
        { name: "authorization", label: "Authorized By", type: "text", required: true },
        { name: "recipient_signature", label: "Recipient Signature", type: "signature", required: true },
        { name: "notes", label: "Additional Notes", type: "textarea", required: false }
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
      requiresPhotos: true,
      minPhotos: 1,
      maxPhotos: 8,
      photoInstructions: "Photos required for compliance and transparency. Must be well-lighted and timestamped. Document scene, equipment involved, and any visible injuries or hazards (HIPAA compliant - no patient faces without consent).",
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
      requiresPhotos: true,
      minPhotos: 2,
      maxPhotos: 10,
      photoInstructions: "Photos required for OSHA compliance and client transparency. Must be well-lighted and timestamped. Document PPE usage, equipment conditions, hazards identified, and overall site safety.",
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
      requiresPhotos: true,
      minPhotos: 1,
      maxPhotos: 10,
      photoInstructions: "Photos required for transparency and documentation. Must be clear, well-lighted, and timestamped. Document the incident scene, any damage, and relevant conditions.",
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
