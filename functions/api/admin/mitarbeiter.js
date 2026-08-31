function fromBase64Url(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    base64 + "=".repeat((4 - base64.length % 4) % 4);

  return Uint8Array.from(
    atob(padded),
    c => c.charCodeAt(0)
  );
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

  return new Uint8Array(signature);
}

async function verifyAdminSession(request, secret) {
  const cookieHeader = request.headers.get("Cookie") || "";

  const match = cookieHeader.match(
    /(?:^|;\s*)admin_session=([^;]+)/
  );

  if (!match) {
    return false;
  }

  const parts = match[1].split(".");

  if (parts.length !== 2) {
    return false;
  }

  const timestamp = Number(parts[0]);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const eightHours = 8 * 60 * 60 * 1000;

  if (Date.now() - timestamp > eightHours || Date.now() < timestamp) {
    return false;
  }

  const expected = await createSignature(
    `admin:${timestamp}`,
    secret
  );

  const received = fromBase64Url(parts[1]);

  if (expected.length !== received.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < expected.length; i++) {
    difference |= expected[i] ^ received[i];
  }

  return difference === 0;
}

async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const iterations = 100000;

  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  const toHex = bytes =>
    [...bytes]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

  return `pbkdf2$${iterations}$${toHex(salt)}$${toHex(
    new Uint8Array(hash)
  )}`;
}

export async function onRequestGet(context) {

  if (
    !(await verifyAdminSession(
      context.request,
      context.env.ADMIN_KEY
    ))
  ) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Nicht angemeldet"
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );
  }

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
}

export async function onRequestPost(context) {

  if (
    !(await verifyAdminSession(
      context.request,
      context.env.ADMIN_KEY
    ))
  ) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Nicht angemeldet"
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );
  }

  try {

    const body = await context.request.json();

    const name = String(body.name || "").trim();
    const pin = String(body.pin || "").trim();

    if (!name) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Name fehlt"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    if (!/^\d{4}$/.test(pin)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Die PIN muss genau 4 Ziffern haben"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    const existing = await context.env.DB
      .prepare(`
        SELECT id
        FROM mitarbeiter
        WHERE name = ?
        LIMIT 1
      `)
      .bind(name)
      .first();

    if (existing) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Dieser Mitarbeiter existiert bereits"
        }),
        {
          status: 409,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    const pinHash = await hashPin(pin);

    const result = await context.env.DB
      .prepare(`
        INSERT INTO mitarbeiter
          (name, pin_hash, aktiv)
        VALUES
          (?, ?, 1)
      `)
      .bind(name, pinHash)
      .run();

    return new Response(
      JSON.stringify({
        ok: true,
        id: result.meta.last_row_id,
        message: "Mitarbeiter wurde angelegt"
      }),
      {
        status: 201,
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
