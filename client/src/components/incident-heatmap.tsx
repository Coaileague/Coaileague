import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, MapPin, TrendingUp } from "lucide-react";

interface HeatPoint {
  lat: number;
  lng: number;
  weight: number;
  category?: string;
  priority?: string;
}

interface HeatmapData {
  data: [number, number, number][];
  raw: { latitude: string; longitude: string; weight: string; category: string; priority: string }[];
}

const CATEGORY_COLORS: Record<string, string> = {
  assault: "#ef4444",
  theft: "#f97316",
  vandalism: "#eab308",
  trespass: "#a855f7",
  disturbance: "#3b82f6",
  medical: "#22c55e",
  suspicious: "#06b6d4",
  other: "#6b7280",
};

function weightToColor(weight: number, max: number): string {
  const ratio = Math.min(weight / Math.max(max, 1), 1);
  if (ratio >= 0.7) return "#ef4444";
  if (ratio >= 0.4) return "#f97316";
  if (ratio >= 0.2) return "#eab308";
  return "#22c55e";
}

function LeafletMap({ points, maxWeight }: { points: HeatPoint[]; maxWeight: number }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstance.current) return;

      const defaultCenter: [number, number] =
        points.length > 0
          ? [
              points.reduce((s, p) => s + p.lat, 0) / points.length,
              points.reduce((s, p) => s + p.lng, 0) / points.length,
            ]
          : [32.7767, -96.797];

      const map = L.map(mapRef.current, {
        center: defaultCenter,
        zoom: points.length > 0 ? 12 : 4,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      mapInstance.current = map;

      points.forEach((pt) => {
        const color = weightToColor(pt.weight, maxWeight);
        const radius = Math.max(10, Math.min(40, (pt.weight / maxWeight) * 40));
        const circle = L.circleMarker([pt.lat, pt.lng], {
          radius,
          fillColor: color,
          color: color,
          weight: 1,
          opacity: 0.8,
          fillOpacity: 0.45,
        })
          .bindPopup(
            `<div style="min-width:140px">
              <strong>${pt.category ? pt.category.charAt(0).toUpperCase() + pt.category.slice(1) : "Incident"}</strong><br/>
              <span style="color:#666">Count: ${pt.weight}</span><br/>
              ${pt.priority ? `<span style="color:#666">Priority: ${pt.priority}</span>` : ""}
            </div>`
          )
          .addTo(map);
        markersRef.current.push(circle);
      });

      if (points.length > 1) {
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;
    import("leaflet").then((L) => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      points.forEach((pt) => {
        const color = weightToColor(pt.weight, maxWeight);
        const radius = Math.max(10, Math.min(40, (pt.weight / maxWeight) * 40));
        const circle = L.circleMarker([pt.lat, pt.lng], {
          radius,
          fillColor: color,
          color: color,
          weight: 1,
          opacity: 0.8,
          fillOpacity: 0.45,
        })
          .bindPopup(
            `<div style="min-width:140px">
              <strong>${pt.category ? pt.category.charAt(0).toUpperCase() + pt.category.slice(1) : "Incident"}</strong><br/>
              <span style="color:#666">Count: ${pt.weight}</span>
            </div>`
          )
          .addTo(mapInstance.current);
        markersRef.current.push(circle);
      });
    });
  }, [points, maxWeight]);

  return <div ref={mapRef} className="w-full h-full rounded-lg" />;
}

export function IncidentHeatmap() {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const [dateRange, setDateRange] = useState("30");
  const [categoryFilter, setFilterCategory] = useState("all");

  const { data: heatmapData, isLoading } = useQuery<HeatmapData>({
    queryKey: ["/api/analytics/incident-heatmap", workspaceId, dateRange],
    queryFn: () => {
      const from = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      return fetch(
        `/api/analytics/incident-heatmap?workspaceId=${workspaceId}&from=${from}`,
        { credentials: "include" }
      ).then((r) => r.json());
    },
    enabled: !!workspaceId,
  });

  const raw = heatmapData?.raw ?? [];
  const categories = Array.from(new Set(raw.map((r) => r.category).filter(Boolean)));

  const filteredRaw =
    categoryFilter === "all" ? raw : raw.filter((r) => r.category === categoryFilter);

  const points: HeatPoint[] = filteredRaw
    .filter((r) => r.latitude && r.longitude)
    .map((r) => ({
      lat: parseFloat(r.latitude),
      lng: parseFloat(r.longitude),
      weight: parseFloat(r.weight),
      category: r.category,
      priority: r.priority,
    }));

  const maxWeight = points.reduce((m, p) => Math.max(m, p.weight), 1);
  const totalIncidents = raw.reduce((s, r) => s + parseFloat(r.weight || "0"), 0);
  const hotspots = points.filter((p) => p.weight / maxWeight >= 0.7).length;

  const legendItems = [
    { color: "#ef4444", label: "High density" },
    { color: "#f97316", label: "Medium-high" },
    { color: "#eab308", label: "Medium" },
    { color: "#22c55e", label: "Low density" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Incident Sites</span>
            </div>
            <p className="text-2xl font-bold">{points.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Incidents</span>
            </div>
            <p className="text-2xl font-bold">{totalIncidents}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Hotspots</span>
            </div>
            <p className="text-2xl font-bold text-red-500">{hotspots}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Incident Density Map
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Circle size and color reflect incident count per site
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[130px]" data-testid="select-heatmap-daterange">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
              {categories.length > 0 && (
                <Select value={categoryFilter} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[130px]" data-testid="select-heatmap-category">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="w-full h-[400px] rounded-b-lg" />
          ) : points.length === 0 ? (
            <div className="h-[400px] flex flex-col items-center justify-center text-center p-8">
              <MapPin className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="font-medium">No incident location data</p>
              <p className="text-sm text-muted-foreground mt-1">
                Incidents need GPS coordinates or site addresses to appear on the map.
                Make sure your sites have latitude and longitude configured.
              </p>
            </div>
          ) : (
            <>
              <div className="h-[400px] sm:h-[500px]" style={{ isolation: "isolate" }} data-testid="div-incident-heatmap">
                <LeafletMap points={points} maxWeight={maxWeight} />
              </div>
              <div className="flex items-center gap-4 px-4 py-3 border-t flex-wrap">
                <span className="text-xs text-muted-foreground font-medium">Density:</span>
                {legendItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {raw.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Top Incident Sites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...raw]
                .sort((a, b) => parseFloat(b.weight) - parseFloat(a.weight))
                .slice(0, 5)
                .map((site, i) => {
                  const w = parseFloat(site.weight);
                  const pct = Math.round((w / totalIncidents) * 100);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: weightToColor(w, maxWeight) }}
                      >
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate">
                            {site.latitude && site.longitude
                              ? `${parseFloat(site.latitude).toFixed(4)}, ${parseFloat(site.longitude).toFixed(4)}`
                              : "Unknown location"}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {site.category && (
                              <Badge variant="outline" className="text-xs">
                                {site.category}
                              </Badge>
                            )}
                            <span className="text-xs font-semibold">{w} ({pct}%)</span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full mt-1">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: weightToColor(w, maxWeight),
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
