export async function onRequestGet(context) {
  try {
    const result = await context.env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all();

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Datenbankverbindung funktioniert",
        tables: result.results
      }),
      {
        headers: {
          "Content-Type": "application/json"
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
          "Content-Type": "application/json"
        }
      }
    );
  }
}
