// Vixan — envío de emails por SMTP, sin dependencias.
// Cada cuenta configura su propio correo (settings.correo): servidor, puerto, seguridad, usuario y contraseña.
//   seguridad "ssl"      → TLS desde el inicio (puerto 465, el habitual de DonWeb/Ferozo)
//   seguridad "starttls" → conexión normal que pasa a TLS (puerto 587)
const net = require('net');
const tls = require('tls');
const os = require('os');
const crypto = require('crypto');
const store = require('./db');

function config(t) {
  const c = store.getSettings(t).correo || {};
  return { ...c, puerto: Number(c.puerto) || (c.seguridad === 'starttls' ? 587 : 465), seguridad: c.seguridad || 'ssl' };
}
const configurado = (t) => { const c = config(t); return !!(c.host && c.usuario && c.clave && (c.remitente || c.usuario)); };

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const encabezado = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const lineas64 = (s) => b64(s).replace(/.{1,76}/g, '$&\r\n');
const direccion = (s) => String(s || '').replace(/[\r\n<>]/g, '').trim();

function armarMensaje({ de, nombre, para, responderA, asunto, texto, html }) {
  const limite = 'vx' + crypto.randomBytes(12).toString('hex');
  const id = `<${crypto.randomBytes(12).toString('hex')}@${de.split('@')[1] || 'vixan'}>`;
  const cab = [
    `From: ${nombre ? `${encabezado(nombre)} ` : ''}<${de}>`,
    `To: <${para}>`,
    ...(responderA ? [`Reply-To: <${responderA}>`] : []),
    `Subject: ${encabezado(asunto)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${id}`,
    'MIME-Version: 1.0',
  ];
  if (!html) return [...cab, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', lineas64(texto || '')].join('\r\n');
  return [...cab, `Content-Type: multipart/alternative; boundary="${limite}"`, '',
    `--${limite}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', lineas64(texto || ''),
    `--${limite}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', lineas64(html),
    `--${limite}--`, ''].join('\r\n');
}

// Conversación SMTP mínima: EHLO, (STARTTLS), AUTH LOGIN, MAIL FROM, RCPT TO, DATA, QUIT
function smtp(c, de, para, mensaje) {
  return new Promise((resolve, reject) => {
    let sock; let buf = ''; let esperando = null; let terminado = false;
    const fin = (err) => { if (terminado) return; terminado = true; try { sock.destroy(); } catch { /* ya cerrado */ } err ? reject(err) : resolve(); };
    const timer = setTimeout(() => fin(new Error('El servidor de correo no respondió a tiempo')), 25000);
    const alRecibir = (d) => {
      buf += d.toString('utf8');
      // Una respuesta termina con una línea "NNN texto" (sin guion después del código)
      const lineas = buf.split('\r\n');
      for (let i = 0; i < lineas.length - 1; i++) {
        if (/^\d{3} /.test(lineas[i])) {
          const resp = lineas.slice(0, i + 1).join('\n'); buf = lineas.slice(i + 1).join('\r\n');
          const cb = esperando; esperando = null; if (cb) cb(resp); return;
        }
      }
    };
    const enviar = (linea, ok = [250]) => new Promise((res, rej) => {
      esperando = (resp) => (ok.includes(Number(resp.slice(0, 3))) ? res(resp) : rej(new Error(`El servidor de correo respondió: ${resp.split('\n').pop()}`)));
      if (linea !== null) sock.write(linea + '\r\n');
    });
    const conectar = (s) => { sock = s; sock.on('data', alRecibir); sock.on('error', (e) => fin(new Error(`No se pudo conectar al correo: ${e.message}`))); };
    const nombreEquipo = os.hostname() || 'vixan';
    (async () => {
      const opcionesTls = { servername: c.host, rejectUnauthorized: !c.ignorarCertificado };
      if (c.seguridad === 'ssl') conectar(tls.connect({ host: c.host, port: c.puerto, ...opcionesTls }));
      else conectar(net.connect({ host: c.host, port: c.puerto }));
      await enviar(null, [220]);
      let ehlo = await enviar(`EHLO ${nombreEquipo}`);
      if (c.seguridad === 'starttls') {
        if (!/STARTTLS/i.test(ehlo)) throw new Error('El servidor de correo no ofrece STARTTLS: probá con seguridad SSL y puerto 465');
        await enviar('STARTTLS', [220]);
        sock.removeAllListeners('data');
        await new Promise((ok, mal) => { const s = tls.connect({ socket: sock, ...opcionesTls }, ok); s.on('error', mal); conectar(s); });
        ehlo = await enviar(`EHLO ${nombreEquipo}`);
      }
      await enviar('AUTH LOGIN', [334]);
      await enviar(b64(c.usuario), [334]);
      await enviar(b64(c.clave), [235]).catch(() => { throw new Error('Usuario o contraseña del correo incorrectos'); });
      await enviar(`MAIL FROM:<${de}>`);
      await enviar(`RCPT TO:<${para}>`, [250, 251]);
      await enviar('DATA', [354]);
      // Líneas que empiezan con punto se duplican (regla de SMTP)
      await enviar(mensaje.replace(/\r\n\./g, '\r\n..') + '\r\n.');
      await enviar('QUIT', [221]).catch(() => {});
      clearTimeout(timer); fin();
    })().catch((e) => { clearTimeout(timer); fin(e); });
  });
}

// Plantilla HTML simple y legible en cualquier cliente de correo
function plantilla({ titulo, parrafos = [], boton, pie }) {
  const e = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden">
<tr><td style="background:#0F253C;color:#fff;padding:18px 24px;font-size:18px;font-weight:bold">${e(titulo)}</td></tr>
<tr><td style="padding:22px 24px;font-size:15px;line-height:1.55">${parrafos.map((p) => `<p style="margin:0 0 12px">${e(p)}</p>`).join('')}
${boton ? `<p style="margin:20px 0"><a href="${e(boton.url)}" style="background:#1FB1A4;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${e(boton.texto)}</a></p><p style="font-size:12px;color:#64748b;margin:0">Si el botón no funciona, copiá este enlace: ${e(boton.url)}</p>` : ''}
</td></tr>${pie ? `<tr><td style="padding:14px 24px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0">${e(pie)}</td></tr>` : ''}
</table></td></tr></table></body></html>`;
}

// Envía un email con el correo de la cuenta. Devuelve false (sin error) si la cuenta no configuró correo.
async function enviar(t, { para, asunto, texto, html, responderA }) {
  const c = config(t);
  if (!configurado(t)) return false;
  const de = direccion(c.remitente || c.usuario);
  const destino = direccion(para);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) throw new Error('Email de destino inválido');
  await smtp(c, de, destino, armarMensaje({ de, nombre: c.nombre || '', para: destino, responderA: direccion(responderA), asunto, texto, html }));
  return true;
}

// Envío en segundo plano: un error de correo nunca frena la operación principal
function enviarSinEsperar(t, datos) {
  enviar(t, datos).catch((e) => {
    console.error(`[correo] ${e.message}`);
    try { store.logEvent(t, null, 'correo_error', `${datos.asunto}: ${e.message}`); } catch { /* sin registro */ }
  });
}

module.exports = { enviar, enviarSinEsperar, configurado, config, plantilla, armarMensaje };
