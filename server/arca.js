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
const CBTE = { A: 1, B: 6, C: 11, 'NC A': 3, 'NC B': 8, 'NC C': 13, 'ND A': 2, 'ND B': 7, 'ND C': 12 };
const LETRA_DE_CODIGO = Object.fromEntries(Object.entries(CBTE).map(([k, v]) => [v, k]));
// Condición frente al IVA del receptor (FEParamGetCondicionIvaReceptor)
const COND_IVA = {
  'Responsable Inscripto': 1, 'IVA Sujeto Exento': 4, 'Consumidor Final': 5, 'Responsable Monotributo': 6,
  'Sujeto No Categorizado': 7, 'Proveedor del Exterior': 8, 'Cliente del Exterior': 9, 'IVA Liberado – Ley 19.640': 10,
  'Monotributista Social': 13, 'IVA No Alcanzado': 15, 'Monotributo Trabajador Independiente Promovido': 16,
};
const COND_IVA_NOMBRE = Object.fromEntries(Object.entries(COND_IVA).map(([k, v]) => [v, k]));
const RECIBE_A = new Set([1, 6, 13, 16]); // los demás reciben B
const ALICUOTAS = { 21: 5, 10.5: 4, 27: 6, 5: 8, 2.5: 9, 0: 3 }; // % → Id de ARCA
const ALICUOTA_DE_ID = Object.fromEntries(Object.entries(ALICUOTAS).map(([k, v]) => [v, Number(k)]));
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

// Importes de un comprobante con varias alícuotas e impuestos internos.
// lineas: [{ cantidad, precio, alicuota, imp_int }] — precio NETO por unidad (sin IVA) e imp_int por unidad.
// Para la clase C no se discrimina IVA: el neto es todo lo cobrado (sin los impuestos internos).
function calcularImportes(letra, lineas) {
  const base = String(letra).replace(/^(NC|ND) /, '');
  const grupos = new Map();
  let netoTotal = 0, impInt = 0, baseImpInt = 0;
  for (const l of lineas) {
    const cant = Number(l.cantidad) || 0;
    const neto = r2(cant * Number(l.precio || 0));
    const ii = r2(cant * Number(l.imp_int || 0));
    if (!(neto > 0) && !(ii > 0)) continue;
    const alic = base === 'C' ? 0 : Number(l.alicuota ?? 21);
    if (base !== 'C' && ALICUOTAS[alic] === undefined) throw new Error(`Alícuota de IVA ${alic}% no soportada`);
    netoTotal = r2(netoTotal + neto);
    if (ii > 0) { impInt = r2(impInt + ii); baseImpInt = r2(baseImpInt + neto); }
    if (base !== 'C') { const g = grupos.get(alic) || { alic, neto: 0, iva: 0 }; g.neto = r2(g.neto + neto); grupos.set(alic, g); }
  }
  const alicuotas = [...grupos.values()].map((g) => ({ ...g, iva: r2(g.neto * g.alic / 100) })).sort((a, b) => b.alic - a.alic);
  const iva = r2(alicuotas.reduce((a, g) => a + g.iva, 0));
  const total = r2(netoTotal + iva + impInt);
  return { total, neto: netoTotal, iva, imp_internos: impInt, base_imp_internos: baseImpInt, alicuotas, alicuota: alicuotas.length === 1 ? alicuotas[0].alic : (alicuotas.length ? null : 0) };
}
// De un total con IVA incluido (pedidos) a líneas netas, con una sola alícuota
function lineasDesdeTotal(total, alicuota = 21, letra = 'B') {
  const base = String(letra).replace(/^(NC|ND) /, '');
  const neto = base === 'C' ? r2(total) : r2(Number(total) / (1 + alicuota / 100));
  // se ajusta el neto para que neto + IVA dé exactamente el total cobrado
  let n = neto;
  if (base !== 'C') { const iva = r2(n * alicuota / 100); n = r2(n + (r2(total) - r2(n + iva))); }
  return [{ cantidad: 1, precio: n, alicuota }];
}
function xmlImportes(imp, letra) {
  const base = String(letra).replace(/^(NC|ND) /, '');
  const iva = base === 'C' || !imp.alicuotas.length ? '' : `<ar:Iva>${imp.alicuotas.map((g) => `<ar:AlicIva><ar:Id>${ALICUOTAS[g.alic]}</ar:Id><ar:BaseImp>${g.neto.toFixed(2)}</ar:BaseImp><ar:Importe>${g.iva.toFixed(2)}</ar:Importe></ar:AlicIva>`).join('')}</ar:Iva>`;
  const ts = [];
  if (imp.imp_internos > 0) ts.push(`<ar:Tributo><ar:Id>4</ar:Id><ar:Desc>Impuestos internos</ar:Desc><ar:BaseImp>${imp.base_imp_internos.toFixed(2)}</ar:BaseImp><ar:Alic>${(imp.base_imp_internos ? r2(imp.imp_internos / imp.base_imp_internos * 100) : 0).toFixed(2)}</ar:Alic><ar:Importe>${imp.imp_internos.toFixed(2)}</ar:Importe></ar:Tributo>`);
  if (imp.percep_iva > 0) ts.push(`<ar:Tributo><ar:Id>6</ar:Id><ar:Desc>Percepcion de IVA</ar:Desc><ar:BaseImp>${imp.percep_base.toFixed(2)}</ar:BaseImp><ar:Alic>${imp.percep_alic.toFixed(2)}</ar:Alic><ar:Importe>${imp.percep_iva.toFixed(2)}</ar:Importe></ar:Tributo>`);
  const trib = ts.length ? `<ar:Tributos>${ts.join('')}</ar:Tributos>` : '';
  return { iva, trib };
}
function validarReceptor(letra, total, condReceptor, doc) {
  const base = String(letra).replace(/^(NC|ND) /, '');
  if (!(total > 0)) throw new Error('El total tiene que ser mayor a cero');
  if (base === 'A' && doc.docTipo !== 80) throw new Error('Para factura A el cliente tiene que tener CUIT (11 dígitos)');
  if (doc.docTipo === 80 && !cuitValido(doc.docNro)) throw new Error(`El CUIT ${doc.docNro} no es válido (revisá los números en la ficha del cliente)`);
  if (base === 'A' && !RECIBE_A.has(Number(condReceptor))) throw new Error('La factura A es solo para Responsables Inscriptos y Monotributistas');
  if (base === 'B' && RECIBE_A.has(Number(condReceptor))) throw new Error('A un Responsable Inscripto o Monotributista se le hace factura A, no B');
  if (base === 'B' && Number(condReceptor) === 5 && doc.docTipo === 99 && total >= UMBRAL_IDENTIFICAR_CF) throw new Error(`Desde $${UMBRAL_IDENTIFICAR_CF.toLocaleString('es-AR')} hay que identificar al consumidor final: cargale DNI o CUIT al cliente`);
}

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

async function emitir(t, { letra, total, alicuota, condReceptor = 5, cuitODni, fecha, asociado, lineas, percepcion }) {
  const f = fiscal(t);
  const pto = Number(f.punto_venta);
  if (!pto) throw new Error('Falta el punto de venta en Datos de facturación (tiene que ser uno habilitado para "Web Services" en ARCA)');
  const cbteTipo = CBTE[letra];
  if (!cbteTipo) throw new Error(`Tipo de comprobante desconocido: ${letra}`);
  if (/^(NC|ND) /.test(letra) && !asociado) throw new Error('Las notas de crédito y de débito tienen que indicar el comprobante que corrigen');
  const doc = documentoDe(cuitODni);
  const calc = calcularImportes(letra, lineas || lineasDesdeTotal(total, alicuota ?? 21, letra));
  const per = typeof percepcion === 'function' ? percepcion(calc) : percepcion;
  calc.percep_iva = per?.importe > 0 ? r2(per.importe) : 0;
  calc.percep_base = per?.base || 0; calc.percep_alic = per?.alic || 0;
  calc.total = r2(calc.total + calc.percep_iva);
  validarReceptor(letra, calc.total, condReceptor, doc);
  const x = xmlImportes(calc, letra);
  const imp = { ...calc, ivaXml: x.iva, tribXml: x.trib };
  const nro = (await ultimoAutorizado(t, pto, cbteTipo)) + 1;
  const fch = yyyymmdd(fecha || new Date(Date.now() - 3 * 3600000).toISOString());
  const asoc = asociado ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${asociado.cbte_tipo}</ar:Tipo><ar:PtoVta>${asociado.punto_venta}</ar:PtoVta><ar:Nro>${asociado.nro}</ar:Nro><ar:Cuit>${soloDigitos(f.cuit)}</ar:Cuit>${asociado.fecha ? `<ar:CbteFch>${yyyymmdd(asociado.fecha)}</ar:CbteFch>` : ''}</ar:CbteAsoc></ar:CbtesAsoc>` : '';
  const det = `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${pto}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>`
    + `<ar:Concepto>1</ar:Concepto><ar:DocTipo>${doc.docTipo}</ar:DocTipo><ar:DocNro>${doc.docNro}</ar:DocNro><ar:CbteDesde>${nro}</ar:CbteDesde><ar:CbteHasta>${nro}</ar:CbteHasta><ar:CbteFch>${fch}</ar:CbteFch>`
    + `<ar:ImpTotal>${imp.total.toFixed(2)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${imp.neto.toFixed(2)}</ar:ImpNeto><ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpTrib>${r2(imp.imp_internos + imp.percep_iva).toFixed(2)}</ar:ImpTrib><ar:ImpIVA>${imp.iva.toFixed(2)}</ar:ImpIVA>`
    + `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>${Number(condReceptor)}</ar:CondicionIVAReceptorId>${asoc}${imp.tribXml}${imp.ivaXml}`
    + `</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`;
  const { resp, errores } = await wsfe(t, 'FECAESolicitar', det);
  const resultado = tag(resp, 'Resultado');
  const obs = tags(tag(resp, 'Observaciones') || '', 'Obs').map((o) => `${tag(o, 'Code')}: ${unesc(tag(o, 'Msg'))}`);
  const cae = tag(tag(resp, 'FECAEDetResponse') || '', 'CAE');
  if (resultado !== 'A' || !cae) throw new Error(`ARCA rechazó el comprobante. ${[...errores, ...obs].join(' · ') || 'Sin detalle'}`);
  const caeVto = tag(tag(resp, 'FECAEDetResponse') || '', 'CAEFchVto');
  return {
    tipo: letra, cbte_tipo: cbteTipo, punto_venta: pto, nro, numero: `${String(pto).padStart(5, '0')}-${String(nro).padStart(8, '0')}`,
    fecha: `${fch.slice(0, 4)}-${fch.slice(4, 6)}-${fch.slice(6)}`, total: imp.total, neto: imp.neto, iva: imp.iva, alicuota: imp.alicuota, alicuotas: imp.alicuotas, imp_internos: imp.imp_internos, percep_iva: imp.percep_iva, ...(imp.percep_iva ? { percep_base: imp.percep_base, percep_alic: imp.percep_alic } : {}),
    doc_tipo: doc.docTipo, doc_nro: doc.docNro, cond_iva_receptor: Number(condReceptor), cae, cae_vto: caeVto ? `${caeVto.slice(0, 4)}-${caeVto.slice(4, 6)}-${caeVto.slice(6)}` : null,
    ambiente: arcaCfg(t).ambiente || 'homologacion', observaciones: obs, estado: 'emitida',
  };
}

// ───────────── Percepción de IVA (Tributo Id 6) ─────────────
// Configuración en Configuración → Percepción y deuda (setting percepcion_iva).
const COMESTIBLES = /aliment|bebida|almac[eé]n|navidad/i;
function configPercepcion(t) {
  const c = store.getSettings(t).percepcion_iva || {};
  return { activa: !!c.activa, pct: Number(c.pct) || 0, pct_reducida: c.pct_reducida === '' || c.pct_reducida == null ? null : Number(c.pct_reducida), min_percepcion: Number(c.min_percepcion) || 0, min_venta: Number(c.min_venta) || 0,
    solo_ri: c.solo_ri !== false, desde: c.desde || '', min_sobre: c.min_sobre === 'total' ? 'total' : 'neto', sin_ml: !!c.sin_ml, solo_comestibles: !!c.solo_comestibles, sin_categoria: c.sin_categoria === 'no' ? 'no' : 'si' };
}
// Devuelve { importe, base, alic, auto } o null. forzar: true (tildada a mano) | false (destildada) | undefined (regla automática)
function calcularPercepcion(t, { letra, condReceptor, plataforma, items, calc, fecha, forzar }) {
  const c = configPercepcion(t);
  if (!c.activa || forzar === false || !c.pct) return null;
  if (String(letra) !== 'A') return null; // sólo facturas A
  if (c.solo_ri && Number(condReceptor) !== 1) return null;
  if (c.desde && String(fecha || new Date().toISOString()).slice(0, 10) < c.desde) return null;
  if (c.sin_ml && /mercado ?libre/i.test(plataforma || '')) return null;
  // proporción de cada alícuota que percibe (filtro de comestibles por categoría del producto)
  let fraccion = 1;
  if (c.solo_comestibles && items?.length) {
    const prods = new Map(store.list(t, 'productos').map((p) => [String(p.sku), p]));
    let tot = 0, si = 0;
    for (const i of items) {
      const v = (Number(i.cantidad) || 0) * Number(i.neto ?? i.precio ?? 0);
      const cat = prods.get(String(i.sku))?.categoria || i.categoria || '';
      tot += v;
      if (cat ? COMESTIBLES.test(cat) : c.sin_categoria === 'si') si += v;
    }
    fraccion = tot > 0 ? si / tot : 0;
  }
  let importe = 0, base = 0;
  for (const g of calc.alicuotas) {
    const b = r2(g.neto * fraccion);
    const pct = Number(g.alic) === 10.5 && c.pct_reducida != null ? c.pct_reducida : c.pct;
    if (!(b > 0) || !pct) continue;
    base = r2(base + b); importe = r2(importe + b * pct / 100);
  }
  if (!(importe > 0)) return null;
  const auto = (c.min_sobre === 'total' ? calc.total : calc.neto) >= c.min_venta;
  if (forzar !== true && !auto) return null;
  if (importe < c.min_percepcion) return null;
  return { importe, base, alic: base ? r2(importe / base * 100) : 0, auto };
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
      const letra = letraPara(t, c.condReceptor);
      const f = await emitir(t, { letra, total: p.total, alicuota: Number(fiscal(t).alicuota_default) || 21, condReceptor: c.condReceptor, cuitODni: c.cuitODni,
        percepcion: (calc) => calcularPercepcion(t, { letra, condReceptor: c.condReceptor, plataforma: p.plataforma, items: p.items, calc }) });
      const reg = store.create(t, 'facturas', { ...f, pedido: p.numero, pedido_id: p.id, cliente: c.cliente, domicilio: c.domicilio, plataforma: p.plataforma, items: p.items || [] });
      out.push({ pedido: p.numero, ok: true, factura: reg.numero, tipo: reg.tipo, cae: reg.cae });
    } catch (e) {
      out.push({ pedido: p.numero, ok: false, error: e.message });
      if (/certificado|Falta el punto|conectar con ARCA|no respondió|sesión abierta/.test(e.message)) break; // error general: no insistir con los demás
    }
  }
  return out;
}
// Factura manual (sin pedido): líneas con precio NETO, alícuota por línea e impuestos internos.
// tipo: 'auto' (la letra sale sola) o un tipo concreto (A, B, C, NC A…, ND B…). Las NC/ND necesitan el comprobante asociado.
async function facturaManual(t, b) {
  const condReceptor = Number(b.cond_iva_receptor) || 5;
  let items = (b.items || []).filter((i) => (i.nombre || i.sku) && Number(i.cantidad) > 0);
  let lineas;
  if (items.length && items.some((i) => i.neto !== undefined || i.alicuota !== undefined || i.imp_int !== undefined)) {
    lineas = items.map((i) => ({ cantidad: Number(i.cantidad), precio: Number(i.neto ?? i.precio), alicuota: Number(i.alicuota ?? b.alicuota ?? 21), imp_int: Number(i.imp_int || 0) }));
  } else {
    // versión anterior: precios con IVA incluido y una sola alícuota
    const total = items.length ? items.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio), 0) : Number(b.total);
    lineas = null; b._total = total;
  }
  let letra = b.tipo && b.tipo !== 'auto' ? b.tipo : letraPara(t, condReceptor);
  if (condicionEmisor(t) !== 'RI' && !/C$/.test(letra)) throw new Error('Como Monotributista o Exento solo podés emitir comprobantes C');
  let asociado = null;
  if (/^(NC|ND) /.test(letra)) {
    const m = String(b.asociado || '').match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
    if (!m) throw new Error('Indicá el comprobante asociado como punto de venta y número, por ejemplo 5-123');
    const base = letra.slice(3);
    const tipoAsoc = letra.startsWith('ND') && b.asociado_tipo === 'nc' ? `NC ${base}` : base;
    const pv = Number(m[1]), nro = Number(m[2]);
    const orig = store.list(t, 'facturas').find((f) => f.cbte_tipo === CBTE[tipoAsoc] && Number(f.punto_venta) === pv && Number(f.nro) === nro);
    asociado = { cbte_tipo: CBTE[tipoAsoc], punto_venta: pv, nro, fecha: orig?.fecha || null };
    if (orig) b._asociado = orig;
  }
  const forzar = b.percepcion === true || b.percepcion === 'si' ? true : b.percepcion === false || b.percepcion === 'no' ? false : undefined;
  const f = await emitir(t, { letra, total: b._total, alicuota: Number(b.alicuota) || 21, lineas, condReceptor, cuitODni: b.cuit, asociado,
    percepcion: (calc) => calcularPercepcion(t, { letra, condReceptor, plataforma: 'Venta directa', items, calc, forzar }) });
  const reg = store.create(t, 'facturas', { ...f, cliente: b.cliente || 'Consumidor final', domicilio: b.domicilio || '', items, manual: true, ...(b._asociado ? { asociada: b._asociado.numero, asociada_id: b._asociado.id } : {}) });
  if (b._asociado && letra.startsWith('NC')) registrarNC(t, b._asociado, reg);
  return reg;
}
// Suma lo acreditado a la factura original y la marca anulada cuando la NC cubre todo
function registrarNC(t, orig, nc) {
  const acreditado = r2(Number(orig.nc_total || 0) + Number(nc.total));
  const total = acreditado >= Number(orig.total) - 0.01;
  store.update(t, 'facturas', orig.id, { nc_total: acreditado, ncs: [...(orig.ncs || []), nc.numero], ...(total ? { estado: 'anulada', anulada_por: nc.numero } : { nc_parcial: true }) });
}
// Nota de crédito por el total (o por un monto menor: parcial, proporcional a cada alícuota)
async function notaCredito(t, facturaId, motivo, monto) {
  const orig = store.get(t, 'facturas', facturaId);
  if (!orig || !orig.cae) throw new Error('Solo se pueden anular facturas emitidas con CAE');
  if (/^NC /.test(String(orig.tipo))) throw new Error('No se puede anular una nota de crédito');
  if (orig.estado === 'anulada') throw new Error('Esa factura ya tiene nota de crédito por el total');
  const pendiente = r2(Number(orig.total) - Number(orig.nc_total || 0));
  const importe = monto ? r2(Number(monto)) : pendiente;
  if (!(importe > 0) || importe > pendiente + 0.01) throw new Error(`El importe de la nota de crédito tiene que ser de hasta ${pendiente.toFixed(2)}`);
  const base = String(orig.tipo).replace(/^ND /, '');
  const factor = importe / Number(orig.total);
  const percNC = orig.percep_iva ? r2(Number(orig.percep_iva) * factor) : 0;
  let lineas;
  if (orig.alicuotas?.length || orig.imp_internos || percNC) {
    lineas = (orig.alicuotas || []).map((g) => ({ cantidad: 1, precio: r2(g.neto * factor), alicuota: g.alic }));
    if (base === 'C') lineas = [{ cantidad: 1, precio: r2((Number(orig.neto) || Number(orig.total)) * factor), alicuota: 0 }];
    if (orig.imp_internos) { lineas[0] = lineas[0] || { cantidad: 1, precio: 0, alicuota: 0 }; lineas[0].imp_int = r2(orig.imp_internos * factor); }
    // el redondeo por alícuota puede correr un centavo: se ajusta en la primera línea
    for (let k = 0; k < 8 && lineas[0]; k++) {
      const dif = r2(importe - percNC - calcularImportes(`NC ${base}`, lineas).total);
      if (!dif) break;
      const paso = Math.abs(dif) >= 0.05 ? r2(dif / (1 + (base === 'C' ? 0 : lineas[0].alicuota / 100))) : Math.sign(dif) * 0.01;
      lineas[0].precio = r2(lineas[0].precio + paso);
    }
  }
  if (percNC && !lineas) lineas = lineasDesdeTotal(r2(importe - percNC), orig.alicuota || 21, base);
  const nc = await emitir(t, { letra: `NC ${base}`, total: importe, alicuota: orig.alicuota || 21, lineas, condReceptor: orig.cond_iva_receptor, cuitODni: orig.doc_nro !== '0' ? orig.doc_nro : '', asociado: orig,
    percepcion: percNC ? { importe: percNC, base: r2(Number(orig.percep_base || 0) * factor), alic: Number(orig.percep_alic || 0) } : null });
  const reg = store.create(t, 'facturas', { ...nc, cliente: orig.cliente, domicilio: orig.domicilio, pedido: orig.pedido, pedido_id: orig.pedido_id, items: factor >= 0.9999 ? orig.items : [], asociada: orig.numero, asociada_id: orig.id, motivo: motivo || '', manual: !!orig.manual });
  registrarNC(t, orig, reg);
  return reg;
}

// ───────────── Consultas a ARCA ─────────────
// Trae un comprobante ya autorizado (FECompConsultar). Devuelve null si ARCA no lo tiene.
async function consultarComprobante(t, cbteTipo, ptoVta, nro) {
  const { resp, errores } = await wsfe(t, 'FECompConsultar', `<ar:FeCompConsReq><ar:CbteTipo>${cbteTipo}</ar:CbteTipo><ar:CbteNro>${nro}</ar:CbteNro><ar:PtoVta>${ptoVta}</ar:PtoVta></ar:FeCompConsReq>`);
  const r = tag(resp, 'ResultGet');
  if (!r) { if (errores.some((e) => /^602/.test(e))) return null; if (errores.length) throw new Error(`ARCA: ${errores.join(' · ')}`); return null; }
  const g = (n) => tag(r, n);
  const fch = g('CbteFch') || '';
  const alicuotas = tags(tag(r, 'Iva') || '', 'AlicIva').map((a) => ({ alic: ALICUOTA_DE_ID[Number(tag(a, 'Id'))] ?? 0, neto: Number(tag(a, 'BaseImp')), iva: Number(tag(a, 'Importe')) }));
  const tribs = tags(tag(r, 'Tributos') || '', 'Tributo').map((x) => ({ id: Number(tag(x, 'Id')), importe: Number(tag(x, 'Importe')) }));
  return {
    cbte_tipo: Number(g('CbteTipo') || cbteTipo), punto_venta: Number(g('PtoVta') || ptoVta), nro: Number(g('CbteDesde') || nro),
    fecha: fch ? `${fch.slice(0, 4)}-${fch.slice(4, 6)}-${fch.slice(6, 8)}` : null, doc_tipo: Number(g('DocTipo')), doc_nro: g('DocNro'),
    total: Number(g('ImpTotal')), neto: Number(g('ImpNeto')), iva: Number(g('ImpIVA')), exento: Number(g('ImpOpEx') || 0), no_gravado: Number(g('ImpTotConc') || 0),
    imp_internos: tribs.filter((x) => x.id === 4).reduce((a, x) => a + x.importe, 0), percep_iva: tribs.filter((x) => x.id === 6).reduce((a, x) => a + x.importe, 0), otros_tributos: tribs.filter((x) => ![4, 6].includes(x.id)).reduce((a, x) => a + x.importe, 0),
    alicuotas, cae: g('CodAutorizacion'), cae_vto: g('FchVto'), resultado: g('Resultado'), cond_iva_receptor: Number(g('CondicionIVAReceptorId') || 0) || null,
  };
}
// Registra en Vixan un comprobante que ARCA autorizó y acá no estaba
async function recuperarComprobante(t, letra, nro, ptoVta) {
  const cbteTipo = CBTE[letra];
  if (!cbteTipo) throw new Error('Tipo de comprobante desconocido');
  const pv = Number(ptoVta || fiscal(t).punto_venta);
  const ya = store.list(t, 'facturas').find((f) => f.cbte_tipo === cbteTipo && Number(f.punto_venta) === pv && Number(f.nro) === Number(nro));
  if (ya) throw new Error(`El comprobante ${letra} ${ya.numero} ya está registrado`);
  const c = await consultarComprobante(t, cbteTipo, pv, Number(nro));
  if (!c) throw new Error(`ARCA no tiene el comprobante ${letra} ${pv}-${nro}`);
  const cli = c.doc_nro && c.doc_nro !== '0' ? store.list(t, 'clientes').find((x) => soloDigitos(x.cuit) === String(c.doc_nro)) : null;
  return store.create(t, 'facturas', {
    ...c, tipo: letra, numero: `${String(pv).padStart(5, '0')}-${String(c.nro).padStart(8, '0')}`, estado: 'emitida', recuperada: true, manual: true,
    cliente: cli?.razon_social || cli?.nombre || (c.doc_tipo === 99 ? 'Consumidor final' : `Doc. ${c.doc_nro}`), alicuota: c.alicuotas.length === 1 ? c.alicuotas[0].alic : null,
    cond_iva_receptor: c.cond_iva_receptor || (c.doc_tipo === 80 && /^A/.test(letra) ? 1 : 5), ambiente: arcaCfg(t).ambiente || 'homologacion', items: [],
  });
}
// Números que faltan en el registro: huecos entre el primero y el último de cada punto de venta y tipo,
// y (si hay conexión con ARCA) lo que ARCA autorizó después del último registrado.
async function faltantes(t, { desde, hasta, consultarArca = true } = {}) {
  const todas = store.list(t, 'facturas').filter((f) => f.cae && f.nro && f.punto_venta);
  const grupos = new Map();
  for (const f of todas) { const k = `${f.punto_venta}|${f.cbte_tipo}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(f); }
  const faltan = [], avisos = [];
  for (const [k, fs] of grupos) {
    const [pv, tipo] = k.split('|').map(Number);
    const nums = fs.map((f) => Number(f.nro)).sort((a, b) => a - b);
    const enRango = fs.filter((f) => (!desde || f.fecha >= desde) && (!hasta || f.fecha <= hasta)).map((f) => Number(f.nro));
    if (!enRango.length) continue;
    const min = Math.min(...enRango), max = Math.max(...enRango);
    const set = new Set(nums);
    for (let n = min; n <= max; n++) if (!set.has(n)) faltan.push({ letra: LETRA_DE_CODIGO[tipo], cbte_tipo: tipo, punto_venta: pv, nro: n, motivo: 'hueco en la numeración' });
    if (consultarArca && arcaCfg(t).tiene_cert) {
      try {
        const ult = await ultimoAutorizado(t, pv, tipo);
        for (let n = nums[nums.length - 1] + 1; n <= ult && n <= nums[nums.length - 1] + 50; n++) faltan.push({ letra: LETRA_DE_CODIGO[tipo], cbte_tipo: tipo, punto_venta: pv, nro: n, motivo: 'ARCA lo autorizó después del último registrado' });
      } catch (e) { avisos.push(`No se pudo consultar ARCA para ${LETRA_DE_CODIGO[tipo]} ${pv}: ${e.message}`); }
    }
  }
  return { faltan, avisos, controlados: grupos.size };
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

module.exports = {
  calcularPercepcion, configPercepcion, cuitValido, generarCSR, guardarCertificado, probar, estado, facturarPedidos, facturaManual, notaCredito, letraPara, condicionEmisor, COND_IVA, COND_IVA_NOMBRE, LETRA_DE_CODIGO, CBTE, ALICUOTAS, armarComprobante, documentoDe, calcularImportes, consultarComprobante, recuperarComprobante, faltantes };
