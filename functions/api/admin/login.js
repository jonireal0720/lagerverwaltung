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

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const adminKey = String(body.adminKey || "");

    if (!adminKey || adminKey !== context.env.ADMIN_KEY) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Ungültiger Admin-Schlüssel"
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    const timestamp = Date.now().toString();
    const signature = await createSignature(
      `admin:${timestamp}`,
      context.env.ADMIN_KEY
    );

    const cookieValue = `${timestamp}.${signature}`;

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Admin-Anmeldung erfolgreich"
      }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie":
            `admin_session=${cookieValue}; ` +
            `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Ungültige Anfrage"
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );
  }
}
