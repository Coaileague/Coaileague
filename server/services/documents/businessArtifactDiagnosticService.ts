
export interface BusinessArtifactCoverageSummary {
  totalArtifacts: number;
  vaultBackedArtifacts: number;
  generatedArtifacts: number;
  tenantVisibleArtifacts: number;
  employeeVisibleArtifacts: number;
  gapCount: number;
  categories: Record<string, {
    total: number;
    vaultBacked: number;
    gaps: number;
  }>;
  gaps: BusinessArtifactCatalogEntry[];
}

export interface BusinessArtifactDiagnosticResult {
  healthy: boolean;
  summary: BusinessArtifactCoverageSummary;
  recommendedNextActions: string[];
}

function buildCategorySummary(entries: BusinessArtifactCatalogEntry[]): BusinessArtifactCoverageSummary['categories'] {
  return entries.reduce((acc, entry) => {
    const category = entry.category as BusinessArtifactCategory;
    if (!acc[category]) {
      acc[category] = { total: 0, vaultBacked: 0, gaps: 0 };
    }
    acc[category].total += 1;
    if (entry.vaultBacked) acc[category].vaultBacked += 1;
    if (!entry.vaultBacked || !entry.generator) acc[category].gaps += 1;
    return acc;
  }, {} as BusinessArtifactCoverageSummary['categories']);
}

function buildRecommendations(gaps: BusinessArtifactCatalogEntry[]): string[] {
  if (gaps.length === 0) {
    return ['All cataloged business artifacts have generators and vault coverage. Continue monitoring new artifact requirements.'];
  }

  return gaps.map(gap => {
    const missing: string[] = [];
    if (!gap.generator) missing.push('generator');
    if (!gap.vaultBacked) missing.push('vault persistence');
    return `Add ${missing.join(' + ')} for ${gap.artifactType} (${gap.title}) in ${gap.sourceDomain}.`;
  });
}

export function getBusinessArtifactCoverageSummary(): BusinessArtifactCoverageSummary {
  const entries = listBusinessArtifactCatalog();
  const gaps = listBusinessArtifactGaps();

  return {
    totalArtifacts: entries.length,
    vaultBackedArtifacts: entries.filter(entry => entry.vaultBacked).length,
    generatedArtifacts: entries.filter(entry => Boolean(entry.generator)).length,
    tenantVisibleArtifacts: entries.filter(entry => entry.availableToTenant).length,
    employeeVisibleArtifacts: entries.filter(entry => entry.availableToEmployee).length,
    gapCount: gaps.length,
    categories: buildCategorySummary(entries),
    gaps,
  };
}

/**
 * Read-only diagnostic for support/Trinity/HelpAI.
 *
 * This turns the static artifact catalog into an operational health answer:
 * which forms exist, which are vault-backed, and which business-required
 * artifacts still need a generator or vault path.
 */
export function diagnoseBusinessArtifactCoverage(): BusinessArtifactDiagnosticResult {
  const summary = getBusinessArtifactCoverageSummary();
  return {
    healthy: summary.gapCount === 0,
    summary,
    recommendedNextActions: buildRecommendations(summary.gaps),
  };
}
