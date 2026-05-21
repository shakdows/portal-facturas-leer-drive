export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Falta el parámetro query" });
  }

  const FOLDER_RAIZ = "1-teE3e0TIsK8RDSZolXvSHGyXJkDNhyj";

  const prompt = `Eres un asistente que busca facturas en Google Drive. Tienes acceso a Google Drive.

CARPETA RAÍZ ID: ${FOLDER_RAIZ}

INSTRUCCIONES:
1. Busca dentro de la carpeta raíz subcarpetas cuyo nombre contenga "${query}" (búsqueda flexible, puede ser RUC completo o parte del nombre).
   Query Drive: title contains '${query}' and '${FOLDER_RAIZ}' in parents and mimeType = 'application/vnd.google-apps.folder'

2. Si encuentras la carpeta del cliente, busca TODOS los archivos de forma RECURSIVA:
   - Primero lista los archivos directamente en la carpeta del cliente
   - Luego lista las subcarpetas (por mes, año, etc.) y para cada una lista sus archivos
   - Repite recursivamente para carpetas anidadas (hasta 3 niveles de profundidad)
   - Incluye TODOS los archivos sin importar en qué subcarpeta estén

3. Para cada archivo recopila: id, nombre, extensión, fecha de modificación (formato DD/MM/YYYY), tamaño en bytes, y la ruta relativa donde está (ej: "2024/ENERO" o vacío si está directo).

4. Responde ÚNICAMENTE con JSON puro sin markdown ni texto extra:

Si encontró:
{"ok":true,"carpeta":"NOMBRE CARPETA","archivos":[{"id":"...","nombre":"FAC-001.pdf","ext":"pdf","fecha":"21/05/2026","bytes":147513,"ruta":""}]}

El campo "ruta" es el nombre de la subcarpeta si el archivo está dentro de una. Si está directo en la carpeta del cliente, dejar vacío "".

Si no encontró:
{"ok":false,"archivos":[]}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,   // ← viene de Vercel, nunca expuesta
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: prompt,
        messages: [{ role: "user", content: `Busca facturas para: "${query}"` }],
        mcp_servers: [{ type: "url", url: "https://drivemcp.googleapis.com/mcp/v1", name: "google-drive" }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: "Error API Anthropic", detalle: err });
    }

    const data = await response.json();
    const texto = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) return res.status(200).json({ ok: false, archivos: [] });

    const resultado = JSON.parse(match[0]);
    return res.status(200).json(resultado);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error interno", detalle: e.message });
  }
}
