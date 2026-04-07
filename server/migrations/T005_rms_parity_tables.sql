-- Extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Incident Reports Table (if not exists)
CREATE TABLE IF NOT EXISTS incident_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL,
    report_number TEXT NOT NULL,
    site_id TEXT,
    site_name TEXT,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    title TEXT NOT NULL,
    narrative TEXT NOT NULL,
    ai_narrative TEXT,
    location_description TEXT,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    reported_by_employee_id TEXT,
    reported_by_name TEXT NOT NULL,
    witnesses JSONB DEFAULT '[]'::jsonb,
    involved_parties JSONB DEFAULT '[]'::jsonb,
    photos TEXT[] DEFAULT '{}',
    police_report_number TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    supervisor_id TEXT,
    supervisor_notes TEXT,
    supervisor_signed_at TIMESTAMP WITH TIME ZONE,
    notification_sent BOOLEAN DEFAULT false,
    client_notified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- BOLO Alerts Table
CREATE TABLE IF NOT EXISTS bolo_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    subject_name TEXT,
    subject_description TEXT,
    vehicle_description TEXT,
    danger_level TEXT DEFAULT 'medium', -- low, medium, high, critical
    photo_urls TEXT[] DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Evidence Items Table
CREATE TABLE IF NOT EXISTS evidence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL,
    incident_report_id UUID REFERENCES incident_reports(id),
    case_number TEXT,
    item_name TEXT NOT NULL,
    description TEXT,
    category TEXT, -- weapon, drug, digital, etc.
    serial_number TEXT,
    storage_location TEXT,
    status TEXT DEFAULT 'in_custody', -- in_custody, transferred, disposed, released
    photo_urls TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Evidence Custody Log Table
CREATE TABLE IF NOT EXISTS evidence_custody_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL,
    evidence_item_id UUID NOT NULL REFERENCES evidence_items(id),
    action TEXT NOT NULL, -- check_in, check_out, transfer, dispose
    from_user_id TEXT,
    to_user_id TEXT,
    to_organization TEXT, -- e.g. "Police Department"
    notes TEXT,
    signature_url TEXT,
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Geofence Departure Log Table
CREATE TABLE IF NOT EXISTS geofence_departure_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    departed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_known_lat DOUBLE PRECISION,
    last_known_lng DOUBLE PRECISION,
    handled_by_trinity BOOLEAN DEFAULT false
);

-- Manual Clock-in Overrides Table
CREATE TABLE IF NOT EXISTS manual_clockin_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    approved_by TEXT,
    approved_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_incident_reports_workspace ON incident_reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bolo_alerts_workspace ON bolo_alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bolo_alerts_active ON bolo_alerts(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_evidence_items_workspace ON evidence_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_evidence_custody_item ON evidence_custody_log(evidence_item_id);
CREATE INDEX IF NOT EXISTS idx_bolo_subject_trgm ON bolo_alerts USING gin (subject_name gin_trgm_ops);
