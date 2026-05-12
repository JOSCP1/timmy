const Report: ReportModule = (() => {
  function exportXML(): void {
    const vulns   = VulnMgmt.getAll();
    const project = (document.getElementById('projectName') as HTMLInputElement|null)?.value || 'Untitled';
    if (!vulns.length) { App.toast('No vulnerabilities to export.', 'error'); return; }

    const x = (s: unknown): string => String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    const items = vulns.map(v => `
    <vulnerability id="${x(v.id)}">
      <name>${x(v.name)}</name>
      <category>${x(v.category)}</category>
      <description>${x(v.description)}</description>
      <asset><id>${x(v.assetId)}</id><name>${x(v.assetName)}</name><type>${x(v.assetType)}</type></asset>
      <status>${x(v.status)}</status>
      <cvss4>
        <score>${v.cvssScore ?? 0}</score>
        <vector>${x(CVSS4.vector(v.cvss))}</vector>
        <rating>${x(CVSS4.qualitative(v.cvssScore).label)}</rating>
      </cvss4>
      <privacy-impact>${x(v.privacyImpact)}</privacy-impact>
      <safety-impact>${x(v.safetyImpact)}</safety-impact>
      <controls>${x(v.controls)}</controls>
      <residual-risk>${x(v.residualRisk)}</residual-risk>
      <control-reference>${x(v.controlRef)}</control-reference>
      <notes>${x(v.notes)}</notes>
    </vulnerability>`).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ostra-report version="1.0">
  <metadata>
    <project-name>${x(project)}</project-name>
    <generated-at>${new Date().toISOString()}</generated-at>
    <tool>OSTRA – Open Source Threat Modeling &amp; Risk Analysis</tool>
    <total>${vulns.length}</total>
    <open>${vulns.filter(v=>v.status==='Open').length}</open>
    <mitigated>${vulns.filter(v=>v.status==='Mitigated').length}</mitigated>
  </metadata>
  <vulnerabilities>${items}
  </vulnerabilities>
</ostra-report>`;

    const blob = new Blob([xml], { type:'application/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ostra-report-${project.replace(/\s+/g,'_')}-${Date.now()}.xml`;
    a.click(); URL.revokeObjectURL(a.href);
    App.toast('✅ XML report exported.', 'ok');
    Audit.log('export_xml', { project });
  }

  return { exportXML };
})();
