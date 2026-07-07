const DEFAULTS = {
  UPDATE_PATH: "/u/replace-with-a-long-random-string",
  CHECK_PATH: "/current",
  KV_KEY: "home:current-ip",
};

function config(env) {
  return {
    updatePath: normalizePath(env.UPDATE_PATH || DEFAULTS.UPDATE_PATH),
    checkPath: normalizePath(env.CHECK_PATH || DEFAULTS.CHECK_PATH),
    kvKey: env.KV_KEY || DEFAULTS.KV_KEY,
  };
}

function normalizePath(path) {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    request.headers.get("X-Real-IP") ||
    null
  );
}

function buildRecord(ip, request) {
  const now = new Date();
  return {
    ip,
    updated_at: now.toISOString(),
    updated_at_jst: now.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
    source: {
      country: request.cf?.country || null,
      colo: request.cf?.colo || null,
    },
  };
}

async function handleUpdate(request, env) {
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, { status: 405 });
  }

  if (!env.HOME_IP_KV) {
    return json({ ok: false, error: "kv_binding_missing" }, { status: 500 });
  }

  const ip = getClientIp(request);
  if (!ip) {
    return json({ ok: false, error: "client_ip_not_found" }, { status: 400 });
  }

  const record = buildRecord(ip, request);
  await env.HOME_IP_KV.put(config(env).kvKey, JSON.stringify(record));
  return json({ ok: true, ...record });
}

async function handleCheck(env) {
  if (!env.HOME_IP_KV) {
    return json({ ok: false, error: "kv_binding_missing" }, { status: 500 });
  }

  const raw = await env.HOME_IP_KV.get(config(env).kvKey);
  if (!raw) {
    return json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    return json({ ok: true, record: JSON.parse(raw) });
  } catch {
    return json({ ok: false, error: "stored_data_invalid" }, { status: 500 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { updatePath, checkPath } = config(env);

    if (url.pathname === updatePath) {
      return handleUpdate(request, env);
    }

    if (url.pathname === checkPath) {
      return handleCheck(env);
    }

    return json({ ok: false, error: "not_found" }, { status: 404 });
  },
};

export { buildRecord, config, getClientIp, normalizePath };
