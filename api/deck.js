// Deck uploads for the apply form, stored in the private Supabase Storage bucket "mastermind-decks".
// POST {name, size, type} -> {uploadUrl, link}: the browser PUTs the PDF to uploadUrl, and `link`
//   goes into the Formspree submission.
// GET ?f=<path> -> redirects to a short-lived signed download URL for that deck.
const crypto = require("crypto");

const BUCKET = "mastermind-decks";
const MAX_BYTES = 50 * 1024 * 1024;
const STORAGE = `${process.env.SUPABASE_URL}/storage/v1`;
const HEADERS = { apikey: process.env.SUPABASE_SECRET_KEY, "Content-Type": "application/json" };
const PATH_RE = /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,80}\.pdf$/;

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const path = String(req.query.f || "");
      if (!PATH_RE.test(path)) return res.status(400).send("Bad deck link");
      const r = await fetch(`${STORAGE}/object/sign/${BUCKET}/${path}`, {
        method: "POST", headers: HEADERS, body: JSON.stringify({ expiresIn: 300 }),
      });
      if (!r.ok) return res.status(404).send("Deck not found");
      const { signedURL } = await r.json();
      return res.redirect(302, `${STORAGE}${signedURL}`);
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const size = Number(body.size);
      const isPdf = body.type === "application/pdf" || /\.pdf$/i.test(body.name || "");
      if (!isPdf) return res.status(400).json({ error: "Please attach a PDF." });
      if (!(size > 0) || size > MAX_BYTES) return res.status(400).json({ error: "PDF must be 50MB or smaller." });

      const base = String(body.name || "deck").replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 76) || "deck";
      const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${base}.pdf`;
      const r = await fetch(`${STORAGE}/object/upload/sign/${BUCKET}/${path}`, { method: "POST", headers: HEADERS, body: "{}" });
      if (!r.ok) return res.status(502).json({ error: "Upload unavailable, please try again." });
      const { url } = await r.json();
      return res.status(200).json({
        uploadUrl: `${STORAGE}${url}`,
        link: `https://${req.headers.host}/api/deck?f=${encodeURIComponent(path)}`,
      });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: "Upload unavailable, please try again." });
  }
};
