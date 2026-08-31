function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }

  return bytes;
}

function bytesToBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hashPin(pin, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  return new Uint8Array(hash);
}

async function signSession(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return bytesToBase64Url(new Uint8Array(signature));
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const pin = String(body.pin || "").trim();

    if (!/^\d{4}$/.test(pin)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Bitte genau 4 Ziffern eingeben."
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    const mitarbeiter = await context.env.DB
      .prepare(`
        SELECT id, name, pin_hash, aktiv
        FROM mitarbeiter
        WHERE aktiv = 1
      `)
      .all();

    let gefundenerMitarbeiter = null;

    for (const person of mitarbeiter.results) {
      const teile = String(person.pin_hash || "").split("$");

      if (teile.length !== 4) {
        continue;
      }

      const algorithmus = teile[0];
      const iterations = Number(teile[1]);
      const saltHex = teile[2];
      const hashHex = teile[3];

      if (
        algorithmus !== "pbkdf2" ||
        !Number.isFinite(iterations)
      ) {
        continue;
      }

      try {
        const salt = hexToBytes(saltHex);

        const berechneterHash = await hashPin(
          pin,
          salt,
          iterations
        );

        const gespeicherterHash = hexToBytes(hashHex);

        if (berechneterHash.length !== gespeicherterHash.length) {
          continue;
        }

        let unterschied = 0;

        for (let i = 0; i < berechneterHash.length; i++) {
          unterschied |=
            berechneterHash[i] ^ gespeicherterHash[i];
        }

        if (unterschied === 0) {
          gefundenerMitarbeiter = person;
          break;
        }

      } catch {
        continue;
      }
    }

    if (!gefundenerMitarbeiter) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "PIN ist nicht korrekt."
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

    const sessionData =
      `employee:${gefundenerMitarbeiter.id}:${timestamp}`;

    const signature = await signSession(
      sessionData,
      context.env.ADMIN_KEY
    );

    const cookieValue =
      `${gefundenerMitarbeiter.id}.${timestamp}.${signature}`;

    return new Response(
      JSON.stringify({
        ok: true,
        mitarbeiter: {
          id: gefundenerMitarbeiter.id,
          name: gefundenerMitarbeiter.name
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",

          "Set-Cookie":
            `employee_session=${cookieValue}; ` +
            `HttpOnly; Secure; SameSite=Strict; ` +
            `Path=/; Max-Age=28800`
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Ungültige Anfrage."
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
