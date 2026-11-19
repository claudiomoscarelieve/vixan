// Vixan — facturación electrónica con ARCA (ex AFIP)
//  · Genera la clave privada y el pedido de certificado (CSR) de cada cliente.
//  · WSAA: login con el certificado (CMS firmado) → token y sign, con caché.
//  · WSFEv1: último comprobante autorizado y pedido de CAE (facturas y notas de crédito A, B y C).
//  · Informa la condición frente al IVA del receptor (CondicionIVAReceptorId, RG 5616).
const forge = require('node-forge');
const https = require('https');
const http = require('http');
const store = require('./db');

const URLS = {
  homologacion: { wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms', wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx' },
  produccion: { wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms', wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx' },
};
const urlDe = (amb, svc) => process.env[`ARCA_${svc.toUpperCase()}_URL`] || URLS[amb][svc];

// Tipos de comprobante (tabla de ARCA)
const CBTE = { A: 1, B: 6, C: 11, 'NC A': 3, 'NC B': 8, 'NC C': 13 };
const LETRA_DE_CODIGO = Object.fromEntries(Object.entries(CBTE).map(([k, v]) => [v, k]));
// Condición frente al IVA del receptor (FEParamGetCondicionIvaReceptor)
const COND_IVA = {
  'Responsable Inscripto': 1, 'IVA Sujeto Exento': 4, 'Consumidor Final': 5, 'Responsable Monotributo': 6,
  'Sujeto No Categorizado': 7, 'Proveedor del Exterior': 8, 'Cliente del Exterior': 9, 'IVA Liberado – Ley 19.640': 10,
  'Monotributista Social': 13, 'IVA No Alcanzado': 15, 'Monotributo Trabajador Independiente Promovido': 16,
};
const COND_IVA_NOMBRE = Object.fromEntries(Object.entries(COND_IVA).map(([k, v]) => [v, k]));
const RECIBE_A = new Set([1, 6, 13, 16]); // los demás reciben B
const ALICUOTAS = { 21: 5, 10.5: 4, 27: 6, 0: 3 }; // % → Id de ARCA
const UMBRAL_IDENTIFICAR_CF = Number(process.env.ARCA_UMBRAL_CF) || 10000000; // RG 5700/2025

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const fiscal = (t) => store.getSettings(t).facturacion || {};
const arcaCfg = (t) => store.getSettings(t).arca || {};
const secretos = (t) => store.getSettings(t).arca_secret || {};

// ───────────── Certificado ─────────────
function generarCSR(t, { alias = 'vixan' } = {}) {
  const f = fiscal(t);
  const cuit = soloDigitos(f.cuit);
  if (!cuitValido(cuit)) throw new Error('El CUIT de Datos de facturación no es válido: revisalo');
  if (!f.razon_social) throw new Error('Cargá primero la razón social en Datos de facturación');
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;
  csr.setSubject([
    { name: 'countryName', value: 'AR' },
    { name: 'organizationName', value: f.razon_social.slice(0, 64) },
    { name: 'commonName', value: String(alias).replace(/[^a-zA-Z0-9]/g, '').slice(0, 30) || 'vixan' },
    { type: '2.5.4.5', value: `CUIT ${cuit}` }, // serialNumber
  ]);
  csr.sign(keys.privateKey, forge.md.sha256.create());
  const csrPem = forge.pki.certificationRequestToPem(csr);
  // La clave nueva reemplaza a la anterior: el certificado viejo deja de servir
  store.setSetting(t, 'arca_secret', { private_key: forge.pki.privateKeyToPem(keys.privateKey), cert: null, csr: csrPem });
  store.setSetting(t, 'arca', { ...arcaCfg(t), tiene_clave: true, tiene_cert: false, cert_vence: null, cert_cn: null, csr_generado: new Date().toISOString() });
  borrarTA(t);
  return { csr: csrPem, archivo: `vixan-${cuit}.csr` };
}

function guardarCertificado(t, pem) {
  const s = secretos(t);
  if (!s.private_key) throw new Error('Primero generá el pedido de certificado (CSR) desde Vixan');
  let cert;
  try { cert = forge.pki.certificateFromPem(String(pem).trim()); } catch { throw new Error('El archivo no es un certificado válido (.crt / .pem)'); }
  const key = forge.pki.privateKeyFromPem(s.private_key);
  if (cert.publicKey.n.compareTo(key.n) !== 0) throw new Error('Este certificado no corresponde a la clave generada en Vixan. Descargá el que ARCA emitió para el último CSR.');
  if (cert.validity.notAfter < new Date()) throw new Error('El certificado está vencido');
  store.setSetting(t, 'arca_secret', { ...s, cert: forge.pki.certificateToPem(cert) });
  const cn = cert.subject.getField('CN')?.value || '';
  store.setSetting(t, 'arca', { ...arcaCfg(t), tiene_cert: true, cert_vence: cert.validity.notAfter.toISOString(), cert_cn: cn });
  borrarTA(t);
  return { vence: cert.validity.notAfter.toISOString(), cn };
}

// ───────────── HTTP / SOAP ─────────────
// Los servidores de ARCA usan parámetros TLS viejos: se baja el nivel de seguridad SOLO para estas llamadas.
const agente = new https.Agent({ ciphers: 'DEFAULT@SECLEVEL=1', keepAlive: true });
function soap(url, accion, xml) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'http:' ? http : https;
    const req = mod.request(u, { method: 'POST', agent: u.protocol === 'https:' ? agente : undefined, timeout: 45000, headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: accion, 'Content-Length': Buffer.byteLength(xml) } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const fault = tag(data, 'faultstring');
        if (fault) return reject(new Error(`ARCA: ${unesc(fault)}`));
        if (res.statusCode >= 400) return reject(new Error(`ARCA respondió ${res.statusCode}`));
        resolve(data);
      });
    });
    req.on('timeout', () => req.destroy(new Error('ARCA no respondió a tiempo (sus servidores a veces están caídos: probá en unos minutos)')));
    req.on('error', (e) => reject(new Error(/ENOTFOUND|ECONNREFUSED|ETIMEDOUT/.test(e.message) ? 'No se pudo conectar con ARCA' : e.message)));
    req.end(xml);
  });
}
const esc = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const unesc = (s) => String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function tag(xml, nombre) { const m = String(xml).match(new RegExp(`<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`)); return m ? m[1] : null; }
function tags(xml, nombre) { return [...String(xml).matchAll(new RegExp(`<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`, 'g'))].map((m) => m[1]); }

// ───────────── WSAA (login) ─────────────
const taKey = (t) => `arca_ta_${arcaCfg(t).ambiente || 'homologacion'}`;
function borrarTA(t) { for (const a of ['homologacion', 'produccion']) store.setSetting(t, `arca_ta_${a}`, null); }
function isoAR(ms) { return new Date(ms - 3 * 3600000).toISOString().slice(0, 19) + '-03:00'; }

async function login(t) {
  const amb = arcaCfg(t).ambiente || 'homologacion';
  const cache = store.getSettings(t)[taKey(t)];
  if (cache?.token && new Date(cache.expira).getTime() - Date.now() > 10 * 60000) return cache;
  const s = secretos(t);
  if (!s.private_key || !s.cert) throw new Error('Falta el certificado de ARCA: completá los pasos en Configuración → Facturación electrónica');
  const ahora = Date.now();
  const tra = `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(ahora / 1000)}</uniqueId><generationTime>${isoAR(ahora - 10 * 60000)}</generationTime><expirationTime>${isoAR(ahora + 10 * 60000)}</expirationTime></header><service>wsfe</service></loginTicketRequest>`;
  const cert = forge.pki.certificateFromPem(s.cert);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({ key: forge.pki.privateKeyFromPem(s.private_key), certificate: cert, digestAlgorithm: forge.pki.oids.sha256, authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() }] });
  p7.sign();
  const cms = forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
  const xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
  let resp;
  try { resp = await soap(urlDe(amb, 'wsaa'), '', xml); } catch (e) {
    if (/ya posee un TA valido/i.test(e.message)) throw new Error('ARCA dice que ya hay una sesión abierta para este certificado (pasa si se pidió desde otro sistema). Esperá unos minutos y volvé a probar.');
    if (/Computador no autorizado|no autorizado a acceder/i.test(e.message)) throw new Error('El certificado no está autorizado para facturar: en ARCA, Administrador de Relaciones → Nueva relación → servicio "Facturación electrónica" (wsfe) para este certificado.');
    throw e;
  }
  const ret = unesc(tag(resp, 'loginCmsReturn') || '');
  const ta = { token: tag(ret, 'token'), sign: tag(ret, 'sign'), expira: tag(ret, 'expirationTime') };
  if (!ta.token) throw new Error('ARCA no devolvió el token de acceso');
  store.setSetting(t, taKey(t), ta);
  return ta;
}

// ───────────── WSFEv1 ─────────────
const NS = 'http://ar.gov.afip.dif.FEV1/';
async function wsfe(t, metodo, cuerpo = '', conAuth = true) {
  const amb = arcaCfg(t).ambiente || 'homologacion';
  let auth = '';
  if (conAuth) {
    const ta = await login(t);
    auth = `<ar:Auth><ar:Token>${ta.token}</ar:Token><ar:Sign>${ta.sign}</ar:Sign><ar:Cuit>${soloDigitos(fiscal(t).cuit)}</ar:Cuit></ar:Auth>`;
  }
  const xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}"><soapenv:Header/><soapenv:Body><ar:${metodo}>${auth}${cuerpo}</ar:${metodo}></soapenv:Body></soapenv:Envelope>`;
  const resp = await soap(urlDe(amb, 'wsfe'), NS + metodo, xml);
  const errores = tags(tag(resp, 'Errors') || '', 'Err').map((e) => `${tag(e, 'Code')}: ${unesc(tag(e, 'Msg'))}`);
  return { resp, errores };
}
async function estadoServidor(t) {
  const { resp } = await wsfe(t, 'FEDummy', '', false);
  return { app: tag(resp, 'AppServer'), db: tag(resp, 'DbServer'), auth: tag(resp, 'AuthServer') };
}
async function ultimoAutorizado(t, ptoVta, cbteTipo) {
  const { resp, errores } = await wsfe(t, 'FECompUltimoAutorizado', `<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>`);
  if (errores.length) throw new Error(`ARCA: ${errores.join(' · ')}`);
  return Number(tag(resp, 'CbteNro')) || 0;
}

// ───────────── Reglas de facturación ─────────────
function condicionEmisor(t) {
  const c = String(fiscal(t).condicion_iva || '').toLowerCase();
  if (c.includes('monotributo')) return 'MT';
  if (c.includes('exento')) return 'EX';
  return 'RI';
}
function letraPara(t, condReceptor) {
  if (condicionEmisor(t) !== 'RI') return 'C';
  return RECIBE_A.has(Number(condReceptor)) ? 'A' : 'B';
}
function documentoDe(cuitODni) {
  const d = soloDigitos(cuitODni);
  if (d.length === 11) return { docTipo: 80, docNro: d };
  if (d.length >= 7 && d.length <= 8) return { docTipo: 96, docNro: d };
  return { docTipo: 99, docNro: '0' };
}
function cuitValido(c) {
  const d = soloDigitos(c);
  if (d.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((a, p, i) => a + p * Number(d[i]), 0);
  let v = 11 - (suma % 11);
  if (v === 11) v = 0;
  if (v === 10) return false;
  return v === Number(d[10]);
}
const yyyymmdd = (iso) => String(iso).slice(0, 10).replace(/-/g, '');

// Prepara los importes y valida antes de ir a ARCA (los errores de ARCA son crípticos)
function armarComprobante(t, { letra, total, alicuota = 21, condReceptor, doc }) {
  total = r2(total);
  if (!(total > 0)) throw new Error('El total tiene que ser mayor a cero');
  const base = letra.replace('NC ', '');
  if (base === 'A' && doc.docTipo !== 80) throw new Error('Para factura A el cliente tiene que tener CUIT (11 dígitos)');
  if (doc.docTipo === 80 && !cuitValido(doc.docNro)) throw new Error(`El CUIT ${doc.docNro} no es válido (revisá los números en la ficha del cliente)`);
  if (base === 'A' && !RECIBE_A.has(Number(condReceptor))) throw new Error('La factura A es solo para Responsables Inscriptos y Monotributistas');
  if (base === 'B' && Number(condReceptor) === 5 && doc.docTipo === 99 && total >= UMBRAL_IDENTIFICAR_CF) throw new Error(`Desde $${UMBRAL_IDENTIFICAR_CF.toLocaleString('es-AR')} hay que identificar al consumidor final: cargale DNI o CUIT al cliente`);
  if (base === 'C') return { total, neto: total, iva: 0, alicuota: 0, ivaXml: '' };
  const idAlic = ALICUOTAS[alicuota];
  if (!idAlic) throw new Error('Alícuota de IVA no soportada');
  const neto = r2(total / (1 + alicuota / 100));
  const iva = r2(total - neto);
  return { total, neto, iva, alicuota, ivaXml: `<ar:Iva><ar:AlicIva><ar:Id>${idAlic}</ar:Id><ar:BaseImp>${neto.toFixed(2)}</ar:BaseImp><ar:Importe>${iva.toFixed(2)}</ar:Importe></ar:AlicIva></ar:Iva>` };
}

async function emitir(t, { letra, total, alicuota, condReceptor = 5, cuitODni, fecha, asociado }) {
  const f = fiscal(t);
  const pto = Number(f.punto_venta);
  if (!pto) throw new Error('Falta el punto de venta en Datos de facturación (tiene que ser uno habilitado para "Web Services" en ARCA)');
  const cbteTipo = CBTE[letra];
  const doc = documentoDe(cuitODni);
  const imp = armarComprobante(t, { letra, total, alicuota, condReceptor, doc });
  const nro = (await ultimoAutorizado(t, pto, cbteTipo)) + 1;
  const fch = yyyymmdd(fecha || new Date(Date.now() - 3 * 3600000).toISOString());
  const asoc = asociado ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${asociado.cbte_tipo}</ar:Tipo><ar:PtoVta>${asociado.punto_venta}</ar:PtoVta><ar:Nro>${asociado.nro}</ar:Nro><ar:Cuit>${soloDigitos(f.cuit)}</ar:Cuit><ar:CbteFch>${yyyymmdd(asociado.fecha)}</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>` : '';
  const det = `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${pto}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>`
    + `<ar:Concepto>1</ar:Concepto><ar:DocTipo>${doc.docTipo}</ar:DocTipo><ar:DocNro>${doc.docNro}</ar:DocNro><ar:CbteDesde>${nro}</ar:CbteDesde><ar:CbteHasta>${nro}</ar:CbteHasta><ar:CbteFch>${fch}</ar:CbteFch>`
    + `<ar:ImpTotal>${imp.total.toFixed(2)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${imp.neto.toFixed(2)}</ar:ImpNeto><ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${imp.iva.toFixed(2)}</ar:ImpIVA>`
    + `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>${Number(condReceptor)}</ar:CondicionIVAReceptorId>${asoc}${imp.ivaXml}`
    + `</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`;
  const { resp, errores } = await wsfe(t, 'FECAESolicitar', det);
  const resultado = tag(resp, 'Resultado');
  const obs = tags(tag(resp, 'Observaciones') || '', 'Obs').map((o) => `${tag(o, 'Code')}: ${unesc(tag(o, 'Msg'))}`);
  const cae = tag(tag(resp, 'FECAEDetResponse') || '', 'CAE');
  if (resultado !== 'A' || !cae) throw new Error(`ARCA rechazó el comprobante. ${[...errores, ...obs].join(' · ') || 'Sin detalle'}`);
  const caeVto = tag(tag(resp, 'FECAEDetResponse') || '', 'CAEFchVto');
  return {
    tipo: letra, cbte_tipo: cbteTipo, punto_venta: pto, nro, numero: `${String(pto).padStart(5, '0')}-${String(nro).padStart(8, '0')}`,
    fecha: `${fch.slice(0, 4)}-${fch.slice(4, 6)}-${fch.slice(6)}`, total: imp.total, neto: imp.neto, iva: imp.iva, alicuota: imp.alicuota,
    doc_tipo: doc.docTipo, doc_nro: doc.docNro, cond_iva_receptor: Number(condReceptor), cae, cae_vto: caeVto ? `${caeVto.slice(0, 4)}-${caeVto.slice(4, 6)}-${caeVto.slice(6)}` : null,
    ambiente: arcaCfg(t).ambiente || 'homologacion', observaciones: obs, estado: 'emitida',
  };
}

// ───────────── Alto nivel: pedidos, manual, notas de crédito ─────────────
function datosCliente(t, pedido) {
  const todos = store.list(t, 'clientes');
  const cli = (pedido.cliente_id && todos.find((c) => c.id === Number(pedido.cliente_id))) || todos.find((c) => c.nombre === pedido.cliente);
  // Lo que el comprador declaró en el checkout de ESE pedido manda; si no declaró nada, se usa la ficha del cliente
  const cond = COND_IVA[pedido.condicion_iva] || COND_IVA[cli?.condicion_iva] || 5;
  const doc = pedido.doc || cli?.cuit || pedido.dni || '';
  // A un Responsable Inscripto se le factura a nombre de la razón social
  return { cliente: (cond !== 5 && cli?.razon_social) || pedido.cliente, cuitODni: doc, condReceptor: cond, domicilio: [cli?.direccion || pedido.direccion, cli?.localidad || pedido.localidad].filter(Boolean).join(', ') };
}
async function facturarPedidos(t, ids) {
  const ya = new Set(store.list(t, 'facturas').filter((f) => f.estado === 'emitida' && !String(f.tipo).startsWith('NC')).map((f) => Number(f.pedido_id)));
  const out = [];
  for (const id of ids) {
    const p = store.get(t, 'pedidos', id);
    if (!p) continue;
    if (ya.has(p.id)) { out.push({ pedido: p.numero, ok: false, error: 'Ya estaba facturado' }); continue; }
    if (p.estado === 'cancelado') { out.push({ pedido: p.numero, ok: false, error: 'Pedido cancelado' }); continue; }
    const c = datosCliente(t, p);
    try {
      const f = await emitir(t, { letra: letraPara(t, c.condReceptor), total: p.total, alicuota: Number(fiscal(t).alicuota_default) || 21, condReceptor: c.condReceptor, cuitODni: c.cuitODni });
      const reg = store.create(t, 'facturas', { ...f, pedido: p.numero, pedido_id: p.id, cliente: c.cliente, domicilio: c.domicilio, plataforma: p.plataforma, items: p.items || [] });
      out.push({ pedido: p.numero, ok: true, factura: reg.numero, tipo: reg.tipo, cae: reg.cae });
    } catch (e) {
      out.push({ pedido: p.numero, ok: false, error: e.message });
      if (/certificado|Falta el punto|conectar con ARCA|no respondió|sesión abierta/.test(e.message)) break; // error general: no insistir con los demás
    }
  }
  return out;
}
async function facturaManual(t, b) {
  const condReceptor = Number(b.cond_iva_receptor) || 5;
  const items = (b.items || []).filter((i) => i.nombre || i.sku);
  const total = items.length ? items.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio), 0) : Number(b.total);
  const f = await emitir(t, { letra: letraPara(t, condReceptor), total, alicuota: Number(b.alicuota) || 21, condReceptor, cuitODni: b.cuit });
  return store.create(t, 'facturas', { ...f, cliente: b.cliente || 'Consumidor final', domicilio: b.domicilio || '', items, manual: true });
}
async function notaCredito(t, facturaId, motivo) {
  const orig = store.get(t, 'facturas', facturaId);
  if (!orig || !orig.cae) throw new Error('Solo se pueden anular facturas emitidas con CAE');
  if (String(orig.tipo).startsWith('NC')) throw new Error('No se puede anular una nota de crédito');
  if (orig.anulada_por) throw new Error('Esa factura ya tiene nota de crédito');
  const nc = await emitir(t, { letra: `NC ${orig.tipo}`, total: orig.total, alicuota: orig.alicuota || 21, condReceptor: orig.cond_iva_receptor, cuitODni: orig.doc_nro !== '0' ? orig.doc_nro : '', asociado: orig });
  const reg = store.create(t, 'facturas', { ...nc, cliente: orig.cliente, domicilio: orig.domicilio, pedido: orig.pedido, pedido_id: orig.pedido_id, items: orig.items, asociada: orig.numero, asociada_id: orig.id, motivo: motivo || '' });
  store.update(t, 'facturas', orig.id, { estado: 'anulada', anulada_por: reg.numero });
  return reg;
}

async function probar(t) {
  const f = fiscal(t);
  const srv = await estadoServidor(t);
  await login(t);
  const pto = Number(f.punto_venta);
  const ultimos = {};
  for (const l of condicionEmisor(t) === 'RI' ? ['A', 'B'] : ['C']) ultimos[l] = await ultimoAutorizado(t, pto, CBTE[l]);
  return { servidor: srv, ambiente: arcaCfg(t).ambiente || 'homologacion', punto_venta: pto, ultimos };
}

function estado(t) {
  const a = arcaCfg(t); const f = fiscal(t);
  return { ambiente: a.ambiente || 'homologacion', tiene_clave: !!a.tiene_clave, tiene_cert: !!a.tiene_cert, cert_vence: a.cert_vence || null, cert_cn: a.cert_cn || null, cuit: f.cuit || '', razon_social: f.razon_social || '', punto_venta: f.punto_venta || '', condicion_iva: f.condicion_iva || '', emisor: condicionEmisor(t), csr: a.tiene_clave && !a.tiene_cert ? secretos(t).csr : null };
}

module.exports = { cuitValido, generarCSR, guardarCertificado, probar, estado, facturarPedidos, facturaManual, notaCredito, letraPara, condicionEmisor, COND_IVA, COND_IVA_NOMBRE, LETRA_DE_CODIGO, armarComprobante, documentoDe };
