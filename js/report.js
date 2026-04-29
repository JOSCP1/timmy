'use strict';

const Report = (() => {

  function exportXML() {
    const vulns   = VulnMgmt.getAll();
    const project = document.getElementById('projectName').value || 'Untitled';
    const date    = new Date().toISOString();

    if (!vulns.length) { App.toast('No vulnerabilities to export.', 'error'); return; }

    const x = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                                    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    const items = vulns.map(v => `
    <vulnerability id="${x(v.id)}">
      <name>${x(v.name)}</name>
      <category>${x(v.category)}</category>
      <description>${x(v.description)}</description>
      <asset>
        <id>${x(v.assetId)}</id>
        <name>${x(v.assetName)}</name>
        <type>${x(v.assetType)}</type>
      </asset>
      <status>${x(v.status)}</status>
      <cvss4>
        <score>${v.cvssScore ?? 0}</score>
        <vector>${x(CVSS4.vector(v.cvss))}</vector>
        <rating>${x(CVSS4.qualitative(v.cvssScore).label)}</rating>
        <metrics>
          <AV>${x(v.cvss?.AV)}</AV>
          <AC>${x(v.cvss?.AC)}</AC>
          <AT>${x(v.cvss?.AT)}</AT>
          <PR>${x(v.cvss?.PR)}</PR>
          <UI>${x(v.cvss?.UI)}</UI>
          <VC>${x(v.cvss?.VC)}</VC>
          <VI>${x(v.cvss?.VI)}</VI>
          <VA>${x(v.cvss?.VA)}</VA>
          <SC>${x(v.cvss?.SC)}</SC>
          <SI>${x(v.cvss?.SI)}</SI>
          <SA>${x(v.cvss?.SA)}</SA>
        </metrics>
      </cvss4>
      <privacy-impact>${x(v.privacyImpact)}</privacy-impact>
      <safety-impact>${x(v.safetyImpact)}</safety-impact>
      <controls>${x(v.controls)}</controls>
      <residual-risk>${x(v.residualRisk)}</residual-risk>
      <control-reference>${x(v.controlRef)}</control-reference>
      <notes>${x(v.notes)}</notes>
    </vulnerability>`).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<olysec-report xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               version="1.0">
  <metadata>
    <project-name>${x(project)}</project-name>
    <generated-at>${date}</generated-at>
    <tool>OLYSEC v1.0.0</tool>
    <total-vulnerabilities>${vulns.length}</total-vulnerabilities>
    <open>${vulns.filter(v=>v.status==='Open').length}</open>
    <mitigated>${vulns.filter(v=>v.status==='Mitigated').length}</mitigated>
  </metadata>
  <vulnerabilities>${items}
  </vulnerabilities>
</olysec-report>`;

    download(xml, `olysec-report-${project.replace(/\s+/g,'_')}-${Date.now()}.xml`, 'application/xml');
    App.toast('✅ XML report exported.', 'ok');
  }

  function download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return { exportXML };
})();
