/**
 * TRINITY EXTERNAL INTELLIGENCE — External/Environmental Intelligence
 * =================================================================
 * Trinity provides advisory intelligence based on site locations and patterns.
 * 
 * Backing store: orchestration_runs (category='external_risk')
 * 
 * Actions (3):
 *   external.get_weather_risk       — Advisory risk assessment based on site location
 *   external.get_local_events_risk  — Advisory on potential local events near site
 *   external.flag_external_risk    — Proactive risk flagging and notification
 */

import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { orchestrationRuns, clients, sites } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityExternalIntelligenceActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity external intelligence: ${actionId}`,
    inputSchema: { type: 'object' as const, properties: {} },
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        const data = await fn(req.payload || {});
        return { 
          success: true, 
          actionId,
          message: 'Action completed successfully',
          data,
          executionTimeMs: 0 // Will be handled by hub if needed
        };
      } catch (err: any) {
        return { 
          success: false, 
          actionId,
          message: err?.message || 'Unknown error',
          executionTimeMs: 0
        };
      }
    }
  };
}

async function notifyManagers(
  workspaceId: string,
  title: string,
  message: string,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'high',
) {
  // Import dynamically to avoid circular dependencies if any
  const { workspaceMembers } = await import('@shared/schema');
  const { sql } = await import('drizzle-orm');
  
  const managers = await db.select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`))
    .catch(() => []);
    
  for (const mgr of managers) {
    await createNotification({ 
      workspaceId, 
      userId: mgr.userId, 
      type: 'external_risk', 
      title, 
      message, 
      priority,
      idempotencyKey: `external_risk-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
  }
  return managers.length;
}

// WMO Weather Interpretation Codes → human-readable label + risk level
function interpretWeatherCode(code: number): { label: string; riskLevel: 'low' | 'medium' | 'high' | 'critical' } {
  if (code === 0) return { label: 'Clear sky', riskLevel: 'low' };
  if (code <= 3) return { label: 'Partly cloudy', riskLevel: 'low' };
  if (code <= 48) return { label: 'Fog/depositing rime fog', riskLevel: 'medium' };
  if (code <= 57) return { label: 'Drizzle', riskLevel: 'medium' };
  if (code <= 67) return { label: 'Rain', riskLevel: 'medium' };
  if (code <= 77) return { label: 'Snow', riskLevel: 'high' };
  if (code <= 82) return { label: 'Rain showers', riskLevel: 'medium' };
  if (code <= 86) return { label: 'Snow showers', riskLevel: 'high' };
  if (code >= 95) return { label: 'Thunderstorm', riskLevel: 'critical' };
  return { label: 'Unknown conditions', riskLevel: 'medium' };
}

export function registerExternalIntelligenceActions() {

  /**
   * external.get_weather_risk
   * H1 FIX: Restored with live OpenMeteo data (free API, no key required).
   * Previous version was removed because it had no live data source.
   * OpenMeteo provides 3-day forecast by lat/lon — pulled from client or site record.
   */
  helpaiOrchestrator.registerAction(mkAction('external.get_weather_risk', async (params) => {
    const { workspaceId, clientId, siteId, latitude, longitude } = params;
    if (!workspaceId) throw new Error('workspaceId required');

    let lat: number | null = latitude ?? null;
    let lon: number | null = longitude ?? null;
    let locationName = 'Unknown Location';

    // Try to pull coordinates from site or client record
    if (!lat || !lon) {
      if (siteId) {
        const [site] = await db.select({ name: sites.name, latitude: sites.latitude, longitude: sites.longitude })
          .from(sites).where(and(eq(sites.workspaceId, workspaceId), eq(sites.id, siteId))).limit(1);
        if (site) { lat = site.latitude as any; lon = site.longitude as any; locationName = site.name || locationName; }
      }
      if ((!lat || !lon) && clientId) {
        const [client] = await db.select({ name: clients.companyName, latitude: clients.latitude, longitude: clients.longitude })
          .from(clients).where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId))).limit(1);
        if (client) { lat = client.latitude as any; lon = client.longitude as any; locationName = client.name || locationName; }
      }
    }

    if (!lat || !lon) {
      return {
        advisory: 'No location coordinates available for this site/client. Update the client or site record with GPS coordinates to enable live weather risk.',
        dataSource: 'none',
        requiresCoordinates: true,
      };
    }

    // Call OpenMeteo free API — no API key required
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,precipitation_probability_max,windspeed_10m_max,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`OpenMeteo API error: ${resp.status}`);
    const data: any = await resp.json();

    const daily = data.daily;
    const days = (daily?.time || []).map((date: string, i: number) => {
      const code = daily.weathercode?.[i] ?? 0;
      const { label, riskLevel } = interpretWeatherCode(code);
      const precipPct = daily.precipitation_probability_max?.[i] ?? 0;
      const windMph = ((daily.windspeed_10m_max?.[i] ?? 0) * 0.621371).toFixed(0); // km/h → mph
      const tempMaxF = (((daily.temperature_2m_max?.[i] ?? 0) * 9 / 5) + 32).toFixed(0);
      const tempMinF = (((daily.temperature_2m_min?.[i] ?? 0) * 9 / 5) + 32).toFixed(0);

      const risks: string[] = [];
      if (riskLevel === 'critical') risks.push('Severe weather — consider suspending outdoor operations');
      else if (riskLevel === 'high') risks.push('Hazardous conditions — ensure guards have appropriate gear and shelter access');
      if (precipPct > 70) risks.push(`High precipitation probability (${precipPct}%) — weatherproof equipment required`);
      if (Number(windMph) > 35) risks.push(`High winds (${windMph} mph) — heightened slip/fall risk for outdoor posts`);
      if (Number(tempMaxF) > 95) risks.push(`Extreme heat (${tempMaxF}°F) — enforce hydration breaks per OSHA guidelines`);
      if (Number(tempMinF) < 20) risks.push(`Extreme cold (${tempMinF}°F) — cold stress protocols required`);

      return { date, conditions: label, riskLevel, precipProbabilityPct: precipPct, windMph: Number(windMph), tempHighF: Number(tempMaxF), tempLowF: Number(tempMinF), operationalRisks: risks };
    });

    const maxRisk = days.reduce((max: string, d: any) => {
      const order = { low: 0, medium: 1, high: 2, critical: 3 };
      return (order[d.riskLevel as keyof typeof order] ?? 0) > (order[max as keyof typeof order] ?? 0) ? d.riskLevel : max;
    }, 'low');

    return {
      location: locationName,
      coordinates: { lat, lon },
      forecast: days,
      overallRiskLevel: maxRisk,
      dataSource: 'OpenMeteo (live)',
      advisory: maxRisk === 'critical'
        ? `URGENT: Severe weather forecast for ${locationName}. Review shift assignments and ensure safety protocols are in place.`
        : maxRisk === 'high'
        ? `High weather risk at ${locationName} in the next 3 days. Ensure guards have proper gear and shelter access.`
        : maxRisk === 'medium'
        ? `Moderate weather risk at ${locationName}. Monitor conditions and brief guards on any operational adjustments.`
        : `Conditions at ${locationName} look favorable for the next 3 days.`,
      confidenceScore: 0.88,
    };
  }));

  /**
   * external.get_local_events_risk
   * Advisory-only: no live event data source is currently integrated.
   * Returns guidance on what types of events to watch for based on site type.
   */
  helpaiOrchestrator.registerAction(mkAction('external.get_local_events_risk', async (params) => {
    const { workspaceId, clientId, siteId } = params;
    if (!workspaceId) throw new Error('workspaceId required');

    let siteName = 'this location';
    if (siteId) {
      const [site] = await db.select({ name: sites.name }).from(sites)
        .where(and(eq(sites.workspaceId, workspaceId), eq(sites.id, siteId))).limit(1);
      if (site?.name) siteName = site.name;
    } else if (clientId) {
      const [client] = await db.select({ name: clients.companyName }).from(clients)
        .where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId))).limit(1);
      if (client?.name) siteName = client.name;
    }

    return {
      location: siteName,
      advisory: `No live event data source is connected. For ${siteName}, manually check local event calendars (city events, sports, concerts, protests) that may increase foot traffic or crowd density requiring additional staffing.`,
      dataSource: 'advisory-only',
      checkSources: ['City/county events calendar', 'Ticketmaster/Eventbrite for nearby venues', 'Local police non-emergency for scheduled protests', 'School/university calendars if near campus'],
      confidenceScore: 0.4,
    };
  }));

  /**
   * external.flag_external_risk
   * Creates a proactive flag and notifies supervisors.
   */
  helpaiOrchestrator.registerAction(mkAction('security.flag_external_risk', async (params) => {
    const { workspaceId, siteId, riskType, details, affectedShiftIds, userId } = params;
    if (!workspaceId || !siteId || !riskType) {
      throw new Error('workspaceId, siteId, and riskType are required');
    }

    const [site] = await db.select().from(sites).where(and(eq(sites.workspaceId, workspaceId), eq(sites.id, siteId))).limit(1);
    
    const inputParams = {
      siteId,
      siteName: site?.name || 'Unknown Site',
      riskType,
      details,
      affectedShiftIds: affectedShiftIds || [],
      flaggedAt: new Date().toISOString()
    };

    const [run] = await db.insert(orchestrationRuns).values({
      workspaceId,
      userId: userId || 'trinity-ai',
      actionId: 'security.flag_external_risk',
      category: 'external_risk',
      source: 'trinity',
      status: 'active',
      inputParams,
      requiresApproval: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();

    const title = `Proactive Risk Flag: ${riskType}`;
    const message = `Trinity has flagged a ${riskType} risk for site ${site?.name || siteId}. Details: ${details}`;
    
    await notifyManagers(workspaceId, title, message, 'high');

    return {
      success: true,
      flagId: (run as any).id,
      riskType,
      siteName: site?.name,
      notified: 'managers'
    };
  }));

  log.info('[Trinity External Intelligence] Registered 3 actions: get_weather_risk (OpenMeteo live), get_local_events_risk (advisory), flag_external_risk');
}
