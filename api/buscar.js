const FOLDER_RAIZ = "1-teE3e0TIsK8RDSZolXvSHGyXJkDNhyj";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

async function getAccessToken() {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600
  }));
  const msg = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = btoa(String.fromCharCode(
    ...new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(msg)))
  )).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
  const jwt = `${msg}.${sig}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("Token error: " + JSON.stringify(d));
  return d.access_token;
}

function pemToBuffer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g,"").replace(/\s/g,"");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function driveList(token, q) {
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=100`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error("Drive " + r.status + ": " + await r.text());
  return (await r.json()).files || [];
}

async function listarRecursivo(token, folderId, ruta = "", depth = 0) {
  if (depth > 3) return [];
  const items = await driveList(token, `'${folderId}' in parents and trashed = false`);
  let archivos = [];
  for (const item of items) {
    if (item.mimeType === "application/vnd.google-apps.folder") {
      const sub = await listarRecursivo(token, item.id, ruta ? `${ruta}/${item.name}` : item.name, depth + 1);
      archivos = archivos.concat(sub);
    } else {
      archivos.push({
        id: item.id,
        nombre: item.name,
        ext: item.name.split(".").pop().toLowerCase(),
        fecha: item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString("es-PE") : "",
        bytes: parseInt(item.size) || 0,
        ruta
      });
    }
  }
  return archivos;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Falta query" });

  try {
    const token = await getAccessToken();
    const carpetas = await driveList(token,
      `'${FOLDER_RAIZ}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    );
    const match = carpetas.filter(f => f.name.toLowerCase().includes(query.toLowerCase()));
    if (!match.length) return res.status(200).json({ ok: false, archivos: [] });

    const carpeta = match[0];
    const archivos = await listarRecursivo(token, carpeta.id);
    return res.status(200)
