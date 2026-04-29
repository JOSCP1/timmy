'use strict';

const Threats = (() => {

  // STRIDE definitions
  const STRIDE = {
    S:  { name:'Spoofing',              desc:'An adversary pretends to be something or someone else.',              cia:['c','i'] },
    T:  { name:'Tampering',             desc:'Unauthorized modification of data or code.',                          cia:['i'] },
    R:  { name:'Repudiation',           desc:'Performing actions that cannot be proven or tied back to the actor.', cia:['i','a'] },
    ID: { name:'Information Disclosure',desc:'Exposing information to parties not authorized to see it.',           cia:['c'] },
    D:  { name:'Denial of Service',     desc:'Making a resource or service unavailable to legitimate users.',       cia:['a'] },
    E:  { name:'Elevation of Privilege',desc:'Gaining capabilities or permissions beyond what is authorized.',      cia:['c','i','a'] },
  };

  // Threat matrix per element type
  const THREAT_MAP = {
    process:   ['S','T','R','ID','D','E'],
    store:     ['T','ID','D'],
    dataflow:  ['T','ID','D'],
    trustzone: [],   // not directly threatened; crossing generates threats on the dataflow
  };

  function identify() {
    const elements    = Diagram.getElements();
    const connections = Diagram.getConnections();
    const generated   = [];

    // Threats per element
    elements.forEach(el => {
      const cats = THREAT_MAP[el.type] || [];
      cats.forEach(cat => {
        generated.push(makeThreat(cat, el.id, el.name, el.type, `${STRIDE[cat].name} on ${el.name}`));
      });
    });

    // Threats per data flow
    connections.forEach(c => {
      THREAT_MAP.dataflow.forEach(cat => {
        generated.push(makeThreat(cat, c.id, c.name, 'dataflow', `${STRIDE[cat].name} on data flow "${c.name}"`));
      });

      // Detect trust-zone crossings → full STRIDE
      const trustZones = elements.filter(e => e.type === 'trustzone');
      const src  = elements.find(e => e.id === c.src);
      const tgt  = elements.find(e => e.id === c.tgt);
      if (src && tgt) {
        trustZones.forEach(tz => {
          const srcIn = pointInZone(src, tz);
          const tgtIn = pointInZone(tgt, tz);
          if (srcIn !== tgtIn) { // crosses boundary
            Object.keys(STRIDE).forEach(cat => {
              generated.push(makeThreat(cat, c.id, c.name, 'trust-boundary',
                `${STRIDE[cat].name} across trust boundary "${tz.name}" on flow "${c.name}"`));
            });
          }
        });
      }
    });

    if (generated.length === 0) {
      App.toast('No elements found. Add processes, stores, and data flows first.', 'error');
      return;
    }

    VulnMgmt.importThreats(generated);
    App.switchView('vuln-mgmt');
    App.toast(`✅ ${generated.length} potential threats identified.`, 'ok');
  }

  function makeThreat(cat, assetId, assetName, assetType, title) {
    return {
      id:           'vuln_' + Math.random().toString(36).slice(2,9),
      name:         title,
      category:     STRIDE[cat]?.name || cat,
      description:  STRIDE[cat]?.desc || '',
      assetId:      assetId,
      assetName:    assetName,
      assetType:    assetType,
      status:       'Open',
      cvss:         { ...CVSS4.DEFAULTS },
      cvssScore:    0,
      privacyImpact:'None',
      safetyImpact: 'None',
      controls:     '',
      residualRisk: '',
      controlRef:   '',
      notes:        '',
    };
  }

  function pointInZone(el, tz) {
    return el.x >= tz.x && el.x <= tz.x + tz.w &&
           el.y >= tz.y && el.y <= tz.y + tz.h;
  }

  return { identify };
})();
