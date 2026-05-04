const Threats: ThreatsModule = (() => {
  interface StrideEntry { name: string; desc: string; cia: string[]; }
  const STRIDE: Record<string, StrideEntry> = {
    S:  { name:'Spoofing',               desc:'An adversary pretends to be something or someone else.',              cia:['c','i'] },
    T:  { name:'Tampering',              desc:'Unauthorized modification of data or code.',                          cia:['i'] },
    R:  { name:'Repudiation',            desc:'Performing actions that cannot be proven or tied back to the actor.', cia:['i','a'] },
    ID: { name:'Information Disclosure', desc:'Exposing information to parties not authorized to see it.',           cia:['c'] },
    D:  { name:'Denial of Service',      desc:'Making a resource or service unavailable to legitimate users.',       cia:['a'] },
    E:  { name:'Elevation of Privilege', desc:'Gaining capabilities or permissions beyond what is authorized.',      cia:['c','i','a'] },
  };

  const THREAT_MAP: Record<string, string[]> = {
    process:   ['S','T','R','ID','D','E'],
    store:     ['T','ID','D'],
    dataflow:  ['T','ID','D'],
    trustzone: [],
  };

  function identify(): void {
    const elements    = Diagram.getElements();
    const connections = Diagram.getConnections();
    const generated: Vulnerability[] = [];

    elements.forEach(el => {
      (THREAT_MAP[el.type] || []).forEach(cat => {
        generated.push(makeThreat(cat, el.id, el.name, el.type, `${STRIDE[cat].name} on ${el.name}`));
      });
    });

    connections.forEach(c => {
      THREAT_MAP['dataflow'].forEach(cat => {
        generated.push(makeThreat(cat, c.id, c.name, 'dataflow', `${STRIDE[cat].name} on data flow "${c.name}"`));
      });
      const trustZones = elements.filter(e => e.type === 'trustzone');
      const src = elements.find(e => e.id === c.src);
      const tgt = elements.find(e => e.id === c.tgt);
      if (src && tgt) {
        trustZones.forEach(tz => {
          if (pointInZone(src, tz) !== pointInZone(tgt, tz)) {
            Object.keys(STRIDE).forEach(cat => {
              generated.push(makeThreat(cat, c.id, c.name, 'trust-boundary',
                `${STRIDE[cat].name} across trust boundary "${tz.name}" on flow "${c.name}"`));
            });
          }
        });
      }
    });

    if (!generated.length) {
      App.toast('No elements found. Add processes, stores, and data flows first.', 'error'); return;
    }
    VulnMgmt.importThreats(generated);
    App.switchView('vuln-mgmt');
    App.toast(`✅ ${generated.length} potential threats identified.`, 'ok');
    Audit.log('identify_threats', { count: generated.length });
  }

  function makeThreat(cat: string, assetId: string, assetName: string, assetType: string, title: string): Vulnerability {
    return {
      id: 'vuln_' + Math.random().toString(36).slice(2,9),
      name: title, category: STRIDE[cat]?.name || cat,
      description: STRIDE[cat]?.desc || '', assetId, assetName, assetType,
      status: 'Open', adversalId: '', cvss: { ...CVSS4.DEFAULTS }, cvssScore: 0,
      privacyImpact:'None', safetyImpact:'None', controls:'', residualRisk:'', controlRef:'', notes:'',
      vulnId: '',
    };
  }

  function pointInZone(el: DiagramElement, tz: DiagramElement): boolean {
    return el.x >= (tz.x) && el.x <= (tz.x + (tz.w||0)) &&
           el.y >= (tz.y) && el.y <= (tz.y + (tz.h||0));
  }

  return { identify };
})();
