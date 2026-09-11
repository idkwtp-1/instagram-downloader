/**
 * InstaSnip Cloudflare Worker Edge Gateway
 * 
 * Multi-tier media resolution with zero file size limits:
 * - Tier 1: Dedicated Cobalt node (cobalt.aelew.dev) with Raycast API credential
 * - Tier 2: Cobalt community relay (api.cobalt.liubquanti.click) fallback
 * - Binary Passthrough: Stream arbitrary binaries via ReadableStream with full CORS
 */

export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, X-Requested-With",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ─── 1. Media Resolution Endpoint (/resolve or /api/resolve) ───────────────
    if (request.method === "POST" && (url.pathname === "/resolve" || url.pathname === "/api/resolve")) {
      try {
        const bodyText = await request.text();
        let parsedBody;
        try {
          parsedBody = JSON.parse(bodyText);
        } catch {
          return new Response(JSON.stringify({ status: "error", error: { code: "error.invalid_json" } }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const cleanUrl = parsedBody.url ? parsedBody.url.replace(/[?#].*$/, "") : "";
        const payload = JSON.stringify({
          url: cleanUrl || parsedBody.url,
          videoQuality: parsedBody.videoQuality || "1080",
          filenameStyle: "pretty",
          downloadMode: "auto",
        });

        // ── Tier 1: Dedicated high-speed Cobalt backend (aelew) ──
        try {
          const res1 = await fetch("https://cobalt.aelew.dev/", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "User-Agent": "raycast-cobalt/20241120",
              "Authorization": "Api-Key 00000000-0000-4000-a000-000000000000",
            },
            body: payload,
          });

          if (res1.ok) {
            const data = await res1.json();
            if (data && data.status !== "error") {
              return new Response(JSON.stringify(data), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        } catch (errTier1) {
          console.warn("Tier 1 resolver error:", errTier1.message);
        }

        // ── Tier 2: Community Cobalt relay fallback ──
        try {
          const res2 = await fetch("https://api.cobalt.liubquanti.click/", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Origin": "https://cobalt.liubquanti.click",
              "Referer": "https://cobalt.liubquanti.click/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            },
            body: payload,
          });

          const data2Text = await res2.text();
          return new Response(data2Text, {
            status: res2.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (errTier2) {
          return new Response(JSON.stringify({
            status: "error",
            error: { code: "error.gateway_upstream_failed", context: { message: errTier2.message } }
          }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (outerErr) {
        return new Response(JSON.stringify({ status: "error", error: { code: outerErr.message } }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── 2. Stream Passthrough Endpoint (/proxy or /api/proxy) ─────────────────
    // Unlimited file size via direct ReadableStream pipe
    if (request.method === "GET" && (url.pathname === "/proxy" || url.pathname === "/api/proxy")) {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        return new Response("Missing url query param", { status: 400, headers: corsHeaders });
      }

      try {
        const mediaRes = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
        });

        const responseHeaders = new Headers(mediaRes.headers);
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Disposition");

        return new Response(mediaRes.body, {
          status: mediaRes.status,
          statusText: mediaRes.statusText,
          headers: responseHeaders,
        });
      } catch (proxyErr) {
        return new Response(`Proxy streaming error: ${proxyErr.message}`, { status: 502, headers: corsHeaders });
      }
    }

    // ─── Health Check ──────────────────────────────────────────────────────────
    return new Response(JSON.stringify({ status: "ok", service: "InstaSnip Gateway", tiers: ["aelew", "liubquanti"] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
