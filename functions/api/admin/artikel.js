export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const {
      id,
      artikelnummer,
      name,
      kategorie,
      bestand,
      warnbestand,
      lagerplatz_id
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

    const result = await context.env.DB
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

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Artikel gespeichert.",
        result
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
