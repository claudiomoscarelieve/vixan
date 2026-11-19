// Vixan — comprobante imprimible (factura / nota de crédito) con el QR de ARCA
const QRCode = require('qrcode');
const store = require('./db');
const { COND_IVA_NOMBRE } = require('./arca');

const money = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DOC = { 80: 'CUIT', 86: 'CUIL', 96: 'DNI', 99: '' };

async function facturaHTML(t, id) {
  const f = store.get(t, 'facturas', id);
  if (!f) throw new Error('No existe');
  const em = store.getSettings(t).facturacion || {};
  const letra = String(f.tipo || 'B').replace('NC ', '');
  const esNC = String(f.tipo).startsWith('NC');
  let qr = '';
  if (f.cae) {
    const datos = { ver: 1, fecha: String(f.fecha).slice(0, 10), cuit: Number(String(em.cuit).replace(/\D/g, '')), ptoVta: f.punto_venta, tipoCmp: f.cbte_tipo, nroCmp: f.nro, importe: f.total, moneda: 'PES', ctz: 1, tipoDocRec: f.doc_tipo, nroDocRec: Number(f.doc_nro) || 0, tipoCodAut: 'E', codAut: Number(f.cae) };
    const url = 'https://www.afip.gob.ar/fe/qr/?p=' + Buffer.from(JSON.stringify(datos)).toString('base64');
    qr = await QRCode.toString(url, { type: 'svg', margin: 0, width: 110 });
  }
  const items = (f.items && f.items.length ? f.items : [{ nombre: esNC ? `Anulación de ${f.asociada}` : 'Venta', cantidad: 1, precio: f.total }]);
  const discrimina = letra === 'A';
  const factor = discrimina ? 1 + (f.alicuota || 21) / 100 : 1;
  const filas = items.map((i) => `<tr><td>${esc(i.sku || '')}</td><td>${esc(i.nombre)}</td><td class="n">${i.cantidad}</td><td class="n">${money(i.precio / factor)}</td>${discrimina ? `<td class="n">${f.alicuota || 21}%</td>` : ''}<td class="n">${money((i.precio * i.cantidad) / factor)}</td></tr>`).join('');
  const cond = COND_IVA_NOMBRE[f.cond_iva_receptor] || 'Consumidor Final';
  const leyendas = [];
  if (f.cond_iva_receptor === 5) leyendas.push('A CONSUMIDOR FINAL');
  if (letra === 'A' && [6, 13, 16].includes(f.cond_iva_receptor)) leyendas.push('El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618');
  const homo = f.ambiente === 'homologacion';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(f.tipo)} ${esc(f.numero)}</title><style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:0;padding:20px}
  .hoja{max-width:800px;margin:0 auto;border:1px solid #000}
  .orig{text-align:center;font-weight:bold;border-bottom:1px solid #000;padding:4px;letter-spacing:2px}
  .cab{display:grid;grid-template-columns:1fr 70px 1fr;border-bottom:1px solid #000}
  .cab>div{padding:10px}
  .letra{border-left:1px solid #000;border-right:1px solid #000;text-align:center}
  .letra b{font-size:38px;display:block;line-height:1}.letra small{font-size:10px}
  h1{font-size:18px;margin:0 0 6px}h2{font-size:18px;margin:0 0 6px}
  .rec{padding:10px;border-bottom:1px solid #000;display:grid;grid-template-columns:1fr 1fr;gap:4px}
  table{width:100%;border-collapse:collapse}th,td{padding:5px 8px;border-bottom:1px solid #ddd;text-align:left}th{background:#eee}.n{text-align:right}
  .tot{padding:10px;display:flex;justify-content:flex-end}.tot table{width:300px}.tot td{border:none}.tot tr:last-child td{font-weight:bold;font-size:15px;border-top:1px solid #000}
  .pie{display:flex;gap:14px;align-items:center;padding:10px;border-top:1px solid #000}
  .ley{padding:6px 10px;font-size:11px;border-top:1px solid #000}
  .homo{background:#fde68a;padding:6px;text-align:center;font-weight:bold}
  @media print{body{padding:0}.noprint{display:none}}
  </style></head><body>
  ${homo ? '<div class="homo">COMPROBANTE DE PRUEBA (homologación) — SIN VALIDEZ FISCAL</div>' : ''}
  <div class="hoja">
    <div class="orig">ORIGINAL</div>
    <div class="cab">
      <div><h1>${esc(em.razon_social || '')}</h1><div><b>Domicilio:</b> ${esc(em.domicilio || '')}</div><div><b>Condición frente al IVA:</b> ${esc(em.condicion_iva || '')}</div></div>
      <div class="letra"><b>${letra}</b><small>COD. ${String(f.cbte_tipo || '').padStart(2, '0')}</small></div>
      <div><h2>${esNC ? 'NOTA DE CRÉDITO' : 'FACTURA'}</h2>
        <div><b>Punto de venta:</b> ${String(f.punto_venta || '').padStart(5, '0')} &nbsp; <b>Comp. Nro:</b> ${String(f.nro || '').padStart(8, '0')}</div>
        <div><b>Fecha de emisión:</b> ${fecha(f.fecha)}</div><div><b>CUIT:</b> ${esc(em.cuit || '')}</div>
        <div><b>Ingresos Brutos:</b> ${esc(em.iibb || em.cuit || '')}</div><div><b>Inicio de actividades:</b> ${fecha(em.inicio_act)}</div></div>
    </div>
    <div class="rec">
      <div><b>${DOC[f.doc_tipo] || 'Doc.'}:</b> ${f.doc_tipo === 99 ? '—' : esc(f.doc_nro)}</div><div><b>Apellido y nombre / Razón social:</b> ${esc(f.cliente || '')}</div>
      <div><b>Condición frente al IVA:</b> ${esc(cond)}</div><div><b>Domicilio:</b> ${esc(f.domicilio || '')}</div>
      ${f.asociada ? `<div style="grid-column:span 2"><b>Comprobante asociado:</b> Factura ${esc(letra)} ${esc(f.asociada)}${f.motivo ? ' — ' + esc(f.motivo) : ''}</div>` : ''}
      ${f.pedido ? `<div><b>Pedido:</b> ${esc(f.pedido)}</div>` : ''}<div><b>Condición de venta:</b> Contado</div>
    </div>
    <table><thead><tr><th>Código</th><th>Producto / Servicio</th><th class="n">Cant.</th><th class="n">Precio unit.</th>${discrimina ? '<th class="n">IVA</th>' : ''}<th class="n">Subtotal</th></tr></thead><tbody>${filas}</tbody></table>
    <div class="tot"><table>
      ${discrimina ? `<tr><td>Importe neto gravado</td><td class="n">${money(f.neto)}</td></tr><tr><td>IVA ${f.alicuota || 21}%</td><td class="n">${money(f.iva)}</td></tr>` : ''}
      <tr><td>Importe total</td><td class="n">${money(f.total)}</td></tr></table></div>
    ${letra === 'B' ? `<div class="ley"><b>Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</b> — IVA contenido: ${money(f.iva)}</div>` : ''}
    ${leyendas.map((l) => `<div class="ley">${esc(l)}</div>`).join('')}
    <div class="pie">${qr ? `<div style="width:110px">${qr}</div>` : ''}<div><b>Comprobante autorizado por ARCA</b><div><b>CAE N°:</b> ${esc(f.cae || '—')}</div><div><b>Vencimiento del CAE:</b> ${fecha(f.cae_vto)}</div></div></div>
  </div>
  <p class="noprint" style="text-align:center"><button onclick="print()" style="padding:8px 18px;font-size:14px">Imprimir / guardar PDF</button></p>
  </body></html>`;
}
module.exports = { facturaHTML };
