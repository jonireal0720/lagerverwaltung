function toBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createSignature(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return toBase64Url(signature);
}

async function adminIstAngemeldet(context) {
  const cookie = context.request.headers.get("Cookie") || "";

  const match = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);

  if (!match) {
    return false;
  }

  const cookieValue = match[1];

  const teile = cookieValue.split(".");

  if (teile.length !== 2) {
    return false;
  }

  const timestamp = teile[0];
  const signature = teile[1];

  const zeit = Number(timestamp);

  if (!Number.isFinite(zeit)) {
    return false;
  }

  if (Date.now() - zeit > 8 * 60 * 60 * 1000) {
    return false;
  }

  const erwarteteSignatur = await createSignature(
    `admin:${timestamp}`,
    context.env.ADMIN_KEY
  );

  return signature === erwarteteSignatur;
}

export async function onRequestPost(context) {
  try {
    const angemeldet = await adminIstAngemeldet(context);

    if (!angemeldet) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Nicht als Admin angemeldet."
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    const body = await context.request.json();

   const {
  id,
  artikelnummer,
  name,
  kategorie,
  bestand,
  warnbestand,
  lagerplatz_id,
  verpackungen
} = body;

    if (!id || !artikelnummer || !name) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Artikelnummer, Name und ID sind erforderlich."
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

     await context.env.DB
      .prepare(`
        UPDATE artikel
        SET
          artikelnummer = ?,
          name = ?,
          kategorie = ?,
          bestand = ?,
          warnbestand = ?,
          lagerplatz_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        artikelnummer,
        name,
        kategorie || null,
        Number(bestand) || 0,
        Number(warnbestand) || 0,
        lagerplatz_id || null,
        id
      )
      .run();

    if (Array.isArray(verpackungen)) {
      await context.env.DB
        .prepare("DELETE FROM verpackungen WHERE artikel_id = ?")
        .bind(id)
        .run();

      for (const verpackung of verpackungen) {
        if (!verpackung.name || !verpackung.einheiten) {
          continue;
        }

        await context.env.DB
          .prepare(`
            INSERT INTO verpackungen
              (artikel_id, name, einheiten, ist_standard, aktiv)
            VALUES (?, ?, ?, ?, 1)
          `)
          .bind(
            id,
            verpackung.name,
            Number(verpackung.einheiten),
            Number(verpackung.ist_standard) || 0
          )
          .run();
      }
    }
      .run();

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Artikel gespeichert."
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Artikel konnte nicht gespeichert werden."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );
  }
}
