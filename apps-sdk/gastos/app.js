// Gastos del mes — app del SDK de Sotos · © 2026 Sebastian Sotomontes · MIT
const $ = (s) => document.querySelector(s);
const CATEGORIAS = ["Comida", "Mercado", "Transporte", "Casa y servicios", "Salud", "Mascotas", "Ocio", "Ropa", "Educación", "Otros"];
const plata = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
let datos = { gastos: [], presupuestos: {}, avisados: {} };
const hoy = () => new Date().toISOString().slice(0, 10);
const mesActual = () => $("#mes").value;
const estado = (t) => { $("#estado").textContent = t; };
const guardar = () => sotos.storage.set("datos", datos).then(() => estado("Guardado")).catch(e => estado("No se pudo guardar: " + e.message));
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function pintar() {
  const mes = mesActual(), lista = datos.gastos.filter(g => g.fecha.startsWith(mes)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const total = lista.reduce((s, g) => s + g.monto, 0), presu = Number(datos.presupuestos[mes]) || 0;
  $("#presupuesto").value = presu || "";
  $("#gastado").textContent = plata.format(total);
  $("#cuantos").textContent = lista.length;
  const q = $("#queda"); q.textContent = presu ? plata.format(presu - total) : "Sin presupuesto"; q.classList.toggle("mal", presu > 0 && total > presu);
  $("#lista").innerHTML = lista.map(g => `<tr><td>${esc(g.fecha.slice(8))}/${esc(g.fecha.slice(5, 7))}</td><td>${esc(g.concepto)}</td><td>${esc(g.categoria)}</td><td class="num">${plata.format(g.monto)}</td><td><button data-quitar="${g.id}" aria-label="Quitar ${esc(g.concepto)}">Quitar</button></td></tr>`).join("");
  $("#vacio").hidden = lista.length > 0;
  const por = {}; lista.forEach(g => por[g.categoria] = (por[g.categoria] || 0) + g.monto);
  $("#porcat").innerHTML = Object.entries(por).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<tr><td>${esc(c)}</td><td class="num">${plata.format(v)}</td><td class="num">${total ? Math.round(v / total * 100) : 0}%</td></tr>`).join("") || `<tr><td class="vacio">—</td></tr>`;
  // aviso una sola vez por mes cuando se pasa del presupuesto
  if (presu && total > presu && !datos.avisados[mes]) { datos.avisados[mes] = true; guardar(); sotos.notify({ title: "Te pasaste del presupuesto", body: `${plata.format(total - presu)} por encima en ${mes}` }).catch(() => {}); }
}

$("#categoria").innerHTML = CATEGORIAS.map(c => `<option>${c}</option>`).join("");
$("#mes").value = hoy().slice(0, 7); $("#fecha").value = hoy();
const mover = (n) => { const [y, m] = mesActual().split("-").map(Number); const d = new Date(y, m - 1 + n, 1); $("#mes").value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; pintar(); };
$("#antes").onclick = () => mover(-1); $("#despues").onclick = () => mover(1); $("#mes").onchange = pintar;
$("#presupuesto").onchange = (e) => { datos.presupuestos[mesActual()] = Math.max(0, Number(e.target.value) || 0); delete datos.avisados[mesActual()]; guardar(); pintar(); };
$("#nuevo").onsubmit = (e) => {
  e.preventDefault();
  const g = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), fecha: $("#fecha").value, concepto: $("#concepto").value.trim(), categoria: $("#categoria").value, monto: Math.round(Number($("#monto").value)) };
  if (!g.concepto || !(g.monto > 0)) return;
  datos.gastos.push(g); $("#concepto").value = ""; $("#monto").value = ""; $("#concepto").focus();
  if (!g.fecha.startsWith(mesActual())) $("#mes").value = g.fecha.slice(0, 7);
  guardar(); pintar();
};
$("#lista").onclick = (e) => { const id = e.target.dataset?.quitar; if (!id) return; datos.gastos = datos.gastos.filter(g => g.id !== id); guardar(); pintar(); };
$("#exportar").onclick = async () => {
  const mes = mesActual(), filas = datos.gastos.filter(g => g.fecha.startsWith(mes)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const csv = "Fecha;Concepto;Categoría;Monto\n" + filas.map(g => [g.fecha, `"${g.concepto.replace(/"/g, '""')}"`, g.categoria, g.monto].join(";")).join("\n");
  const f = await sotos.files.save({ name: `Gastos ${mes}.csv`, data: "﻿" + csv, type: "text/csv" }).catch(e => { estado(e.message); return null; });
  if (f) estado("Exportado: " + f.name + " (ábrelo con Hojas)");
};
sotos.ready.then(async () => {
  const d = await sotos.storage.get("datos").catch(() => null); if (d) datos = { gastos: [], presupuestos: {}, avisados: {}, ...d };
  pintar(); estado(`${datos.gastos.length} gasto(s) guardado(s) en tu cuenta`);
});
