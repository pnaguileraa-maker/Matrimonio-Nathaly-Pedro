// Backend de RSVP para la boda de Nathaly & Pedro.
// Recibe las confirmaciones enviadas por el formulario conversacional del sitio
// (index.html, tarjeta "Confirma tu Asistencia") via fetch POST, y las registra
// en la hoja "Invitados". No depende de Meta / WhatsApp Business API: el envio
// del resumen por WhatsApp lo hace el propio navegador del invitado abriendo
// wa.me, este script solo deja la respuesta guardada en la planilla.
//
// Ya no se pregunta por menu (una sola opcion para todos): lo unico que interesa
// es quien asiste. El invitado principal solo puede confirmar como acompanantes a
// los nombres que ya estaban escritos en la columna E (Acompanantes esperados) de
// SU fila, porque esos son los unicos que el sitio le muestra como botones — no
// hay forma de escribir un nombre que no este en esa lista.
//
// PUESTA EN MARCHA
// 1. La hoja "Invitados" debe tener (al menos) estas columnas en este orden:
//    A Nombre invitado | B Nombre principal | C Telefono | D Cupos |
//    E Acompanantes esperados | F Link invitacion | G Boton enviar |
//    H Estado de confirmacion de asistencia | I Confirmados | J Titular |
//    K Acompanantes confirmados | L UltimoContacto
//    - A (Nombre invitado) es el saludo que se muestra en la portada, puede ser
//      grupal, ej. "Franco y Familia".
//    - B (Nombre principal) es el nombre de pila de quien responde el RSVP, ej.
//      "Franco". Si la invitacion es para una sola persona puede repetir lo de A.
//    - D (Cupos) es el total reservado para esta invitacion, incluyendo al principal.
//    - E (Acompanantes esperados) lista los nombres de pila de los acompanantes que
//      esperamos que traiga, separados por " | ", ej. "Miguel | Maria | Carlos".
//      Deben ser Cupos - 1 nombres. Esta columna la llenas tu a mano por cada fila.
//    - F (Link invitacion) arma la URL personalizada a partir de A, B, D y E. Formula
//      sugerida (ajusta el dominio si corresponde):
//      =CONCATENAR("https://pnaguileraa-maker.github.io/Matrimonio-Nathaly-Pedro/?nombre=",
//        ENCODEURL(A2),"&principal=",ENCODEURL(B2),"&cupos=",D2,"&acompanantes=",ENCODEURL(E2))
//    - G (Boton enviar) te arma un link de wa.me para mandarle tu mismo la invitacion
//      al telefono del invitado (C). Formula sugerida:
//      =CONCATENAR("https://wa.me/",C2,"?text=",ENCODEURL(CONCATENAR("¡Hola ",B2,
//        "! 💛 Aquí tienes tu invitación a la boda de Nathaly & Pedro: ",F2)))
//    - J (Titular) y K (Acompanantes confirmados) los llena este script cuando el
//      invitado responde: J lleva "Nombre (Aceptado)" o "Nombre (No asiste)", K lista
//      los acompanantes que el invitado SI marco como asistentes, separados por " | ".
// 2. Extensiones > Apps Script, pega este archivo. Vincula el proyecto al Sheet.
// 3. Implementar > Nueva implementacion > Aplicacion web > Acceso: Cualquier usuario.
//    Copia esa URL y pegala como APPS_SCRIPT_URL en index.html.
// 4. Cada vez que edites este archivo: Implementar > Administrar implementaciones >
//    (lapiz) Editar > Version: Nueva version > Implementar. Así la URL no cambia.

const SHEET_NAME = 'Invitados';

// Posicion de cada columna en la hoja "Invitados" (A=1, B=2, ...).
const COL = {
  NOMBRE: 1,
  PRINCIPAL: 2,
  TELEFONO: 3,
  CUPOS: 4,
  ACOMPANANTES_ESPERADOS: 5,
  LINK: 6,
  BOTON_ENVIAR: 7,
  ESTADO: 8,
  CONFIRMADOS: 9,
  TITULAR: 10,
  ACOMPANANTES_CONFIRMADOS: 11,
  ULTIMO_CONTACTO: 12
};

function doGet(e) {
  return ContentService.createTextOutput('Backend RSVP activo.');
}

function doPost(e) {
  try {
    // OJO: e.postData.contents / e.postData.getBytes() corrompen tildes y ñ en Apps Script
    // (bug conocido de la plataforma: el body crudo de un POST se decodifica mal y los
    // caracteres multibyte se pierden, mostrando el símbolo � en la hoja). e.parameter SÍ
    // decodifica UTF-8 correctamente, por eso el sitio manda el JSON como un parametro de
    // formulario ("payload") en vez de como texto plano.
    const data = JSON.parse(e.parameter.payload || '{}');
    const rowIndex = guardarConfirmacion(data);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, fila: rowIndex }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // Antes esto quedaba solo en el log y el cliente igual recibia {ok:true}, asi que un
    // fallo real (ej. hoja no encontrada) pasaba inadvertido. Ahora el error se ve en
    // Ejecuciones (Apps Script) Y se devuelve al cliente para poder diagnosticar sin adivinar.
    console.error('doPost error: ' + err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function guardarConfirmacion(data) {
  // "nombre" en el payload es en realidad el nombre principal (ej. "Franco"), el mismo
  // que va en la columna B de la hoja y en ?principal= de la URL — no el saludo de la
  // columna A, que puede ser grupal (ej. "Franco y Familia") y no serviria para ubicar
  // la fila correcta.
  const nombre = String(data.nombre || '').trim() || 'Invitado sin nombre';
  const estado = data.estado === 'Rechazado' ? 'Rechazado' : 'Aceptado';
  const acompanantes = (Array.isArray(data.acompanantes) ? data.acompanantes : [])
    .map(a => String(a || '').trim())
    .filter(Boolean);

  const confirmados = estado === 'Aceptado' ? 1 + acompanantes.length : 0;
  const titularTexto = estado === 'Aceptado' ? `${nombre} (Aceptado)` : `${nombre} (No asiste)`;
  const acompanantesTexto = acompanantes.join(' | ');

  const sheet = getSheet();
  if (!sheet) {
    throw new Error(`No se encontro la hoja "${SHEET_NAME}" en esta planilla.`);
  }

  let rowIndex = findGuestRowByName(sheet, nombre);
  if (rowIndex === -1) {
    rowIndex = sheet.getLastRow() + 1;
    sheet.getRange(rowIndex, COL.PRINCIPAL).setValue(nombre);
  }

  updateGuestRow(rowIndex, {
    [COL.ESTADO]: estado,
    [COL.CONFIRMADOS]: confirmados,
    [COL.TITULAR]: titularTexto,
    [COL.ACOMPANANTES_CONFIRMADOS]: acompanantesTexto,
    [COL.ULTIMO_CONTACTO]: new Date()
  });

  return rowIndex;
}

// ===================== SHEET HELPERS =====================

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function findGuestRowByName(sheet, nombre) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const nombres = sheet.getRange(2, COL.PRINCIPAL, lastRow - 1, 1).getValues();
  const normalizado = nombre.trim().toLowerCase();

  for (let i = 0; i < nombres.length; i++) {
    if (String(nombres[i][0]).trim().toLowerCase() === normalizado) return i + 2;
  }
  return -1;
}

function updateGuestRow(rowIndex, updates) {
  const sheet = getSheet();
  Object.keys(updates).forEach(col => {
    sheet.getRange(rowIndex, Number(col)).setValue(updates[col]);
  });
}
