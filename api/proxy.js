export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).send("GET と HEAD のみ利用できます");
  }

  const origin = process.env.UPSTREAM_ORIGIN;
  if (!origin) {
    return res.status(500).send("UPSTREAM_ORIGIN が設定されていません");
  }

  try {
    const upstream = new URL(origin);
    if (!["http:", "https:"].includes(upstream.protocol)) {
      return res.status(500).send("接続先URLの設定が不正です");
    }

    const requestUrl = new URL(req.url, "https://vercel.local");
    const path = requestUrl.searchParams.get("path") || "/";

    // 接続先ホストの差し替えを防ぐ
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
      return res.status(400).send("パスが不正です");
    }

    const target = new URL(path, upstream);
    if (target.origin !== upstream.origin) {
      return res.status(403).send("許可されていない接続先です");
    }

    const response = await fetch(target, {
      method: req.method,
      headers: {
        accept: req.headers.accept || "*/*",
        "accept-language": req.headers["accept-language"] || "ja"
      },
      redirect: "manual",
      signal: AbortSignal.timeout(10000)
    });

    if (response.status >= 300 && response.status < 400) {
      return res.status(502).send("転送先のリダイレクトには対応していません");
    }

    res.status(response.status);

    for (const name of ["content-type", "cache-control"]) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    if (req.method === "HEAD") return res.end();

    return res.send(Buffer.from(await response.arrayBuffer()));
  } catch {
    return res.status(502).send("転送先に接続できませんでした");
  }
}
