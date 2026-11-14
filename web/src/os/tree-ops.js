/* ============================================================
   Sotos OS — operaciones puras sobre el árbol de archivos
   © 2026 Sebastian Sotomontes

   Mismo código en el navegador (vfs.js) y en el servidor (server/fs.mjs):
   cada cambio es una operación determinista { t, ... } con ids y nombres
   ya decididos por el cliente, así dos dispositivos convergen al mismo estado.
   ============================================================ */

export const ROOT = "root", DESKTOP = "desktop";

export const cloneTree = (n) => n.children ? { ...n, children: n.children.map(cloneTree) } : { ...n };
export function index(root) {
  const map = new Map();
  const walk = (n, parent) => { map.set(n.id, { node: n, parent }); (n.children || []).forEach(c => walk(c, n)); };
  if (root) walk(root, null);
  return map;
}
export const isInside = (map, id, ancestorId) => { let cur = map.get(id); while (cur) { if (cur.node.id === ancestorId) return true; cur = cur.parent ? map.get(cur.parent.id) : null; } return false; };
export function blobIds(n, out = []) { if (n.children) n.children.forEach(c => blobIds(c, out)); else out.push(n.id); return out; }
export function folderSize(n) { return n.children ? n.children.reduce((s, c) => s + folderSize(c), 0) : (n.size || 0); }

/**
 * Aplica una operación a { root, trash } y devuelve un estado NUEVO
 * más los efectos que el servidor debe ejecutar sobre los blobs.
 */
export function applyOp(state, op) {
  const root = cloneTree(state.root); let trash = state.trash.map(t => ({ ...t, node: cloneTree(t.node) }));
  const map = index(root);
  const effects = { copyBlobs: [], deleteBlobs: [] };
  const folder = (id) => { const e = map.get(id); return e && e.node.children ? e.node : null; };
  switch (op.t) {
    case "replace": return { root: cloneTree(op.root), trash: (op.trash || []).map(t => ({ ...t, node: cloneTree(t.node) })), effects };
    case "create": {
      if (map.has(op.node.id)) break; // idempotente
      const p = folder(op.parent) || root; p.children.push(cloneTree(op.node));
      break;
    }
    case "write": { const e = map.get(op.id); if (e) { e.node.size = op.size; e.node.mtime = op.mtime; delete e.node.url; delete e.node.online; } break; }
    case "rename": { const e = map.get(op.id); if (e && op.id !== ROOT && op.id !== DESKTOP) { e.node.name = op.name; if (op.type) e.node.type = op.type; e.node.mtime = op.mtime || e.node.mtime; } break; }
    case "move": {
      const dest = folder(op.dest); if (!dest) break;
      for (const id of op.ids) {
        const e = map.get(id); if (!e || !e.parent || id === DESKTOP || id === ROOT || e.parent.id === op.dest || isInside(map, op.dest, id)) continue;
        e.parent.children = e.parent.children.filter(c => c.id !== id);
        if (op.names && op.names[id]) e.node.name = op.names[id];
        dest.children.push(e.node); map.set(id, { node: e.node, parent: dest });
      }
      break;
    }
    case "copy": {
      const dest = folder(op.dest); if (!dest) break;
      for (const it of op.items) { if (map.has(it.node.id)) continue; dest.children.push(cloneTree(it.node)); }
      effects.copyBlobs = op.blobs || [];
      break;
    }
    case "trash": {
      const items = [];
      for (const id of op.ids) {
        const e = map.get(id); if (!e || !e.parent || id === DESKTOP || id === ROOT) continue;
        e.parent.children = e.parent.children.filter(c => c.id !== id);
        items.push({ node: e.node, from: e.parent.id, at: op.at });
      }
      trash = [...items, ...trash];
      break;
    }
    case "restore": {
      const back = trash.filter(t => op.ids.includes(t.node.id)); trash = trash.filter(t => !op.ids.includes(t.node.id));
      for (const t of back) { const dest = folder(t.from) || root; if (op.names && op.names[t.node.id]) t.node.name = op.names[t.node.id]; dest.children.push(t.node); }
      break;
    }
    case "destroy": {
      const gone = trash.filter(t => op.ids.includes(t.node.id)); trash = trash.filter(t => !op.ids.includes(t.node.id));
      gone.forEach(t => effects.deleteBlobs.push(...blobIds(t.node)));
      break;
    }
    default: throw new Error("Operación desconocida: " + op.t);
  }
  return { root, trash, effects };
}

/** busca un nodo por id en el árbol o en la papelera */
export function findNode(state, id) {
  const e = index(state.root).get(id); if (e) return e.node;
  for (const t of state.trash) { const x = index(t.node).get(id); if (x) return x.node; }
  return null;
}
