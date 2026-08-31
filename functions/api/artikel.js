export async function onRequestGet(context) {
  try {
    const result = await context.env.DB
      .prepare(`
        SELECT
          a.id,
          a.artikelnummer,
          a.name,
          a.kategorie,
          a.bild_url,
          a.lagerplatz_id,
          a.bestand,
          a.warnbestand,
          a.aktiv,

          lb.name AS lagerbereich,
          lp.name AS lagerplatz,

          v.id AS verpackung_id,
          v.name AS verpackung,
          v.einheiten AS verpackung_einheiten,
          v.ist_standard AS verpackung_standard

        FROM artikel a

        LEFT JOIN lagerplaetze lp
          ON lp.id = a.lagerplatz_id

        LEFT JOIN lagerbereiche lb
          ON lb.id = lp.bereich_id

        LEFT JOIN verpackungen v
          ON v.artikel_id = a.id
          AND v.aktiv = 1

        WHERE a.aktiv = 1

        ORDER BY a.name, v.einheiten
      `)
      .all();

    const artikel = {};

    for (const row of result.results) {

      if (!artikel[row.id]) {
        artikel[row.id] = {
          id: row.id,
          artikelnummer: row.artikelnummer,
          name: row.name,
          kategorie: row.kategorie,
          bild_url: row.bild_url,
          lagerplatz_id: row.lagerplatz_id,
          bestand: row.bestand,
          warnbestand: row.warnbestand,
          aktiv: row.aktiv,

          lagerbereich: row.lagerbereich,
          lagerplatz: row.lagerplatz,

          verpackungen: []
        };
      }

      if (row.verpackung_id) {
        artikel[row.id].verpackungen.push({
          id: row.verpackung_id,
          name: row.verpackung,
          einheiten: row.verpackung_einheiten,
          ist_standard: row.verpackung_standard
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        artikel: Object.values(artikel)
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
        error: "Artikel konnten nicht geladen werden."
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
