export async function onRequestGet(context) {
  try {
    const result = await context.env.DB
      .prepare(`
        SELECT id, name, aktiv, created_at
        FROM mitarbeiter
        ORDER BY name
      `)
      .all();

    return new Response(
      JSON.stringify({
        ok: true,
        mitarbeiter: result.results
      }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message
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
