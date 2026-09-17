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

        let targetUrl = parsedBody.url || "";
        try {
          const parsed = new URL(targetUrl);
          const searchParams = new URLSearchParams(parsed.search);
          const TRACKING_QUERY_PARAMS = new Set([
            'igsh', 'igshid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'src', 'ref'
          ]);
          for (const key of [...searchParams.keys()]) {
            const lower = key.toLowerCase();
            if (TRACKING_QUERY_PARAMS.has(lower) || lower.startsWith('utm_')) {
              searchParams.delete(key);
            }
          }
          const remaining = searchParams.toString();
          parsed.search = remaining ? `?${remaining}` : '';
          targetUrl = parsed.toString();
        } catch {
          // Keep raw URL if parsing fails
        }

        const payload = JSON.stringify({
          url: targetUrl,
          videoQuality: parsedBody.videoQuality || "1080",
          filenameStyle: "pretty",
          downloadMode: "auto",
        });

        // ── Resilient Multi-Node Resolver Pool ──
        const RESOLVER_NODES = [
          {
            name: "cobalt-aelew",
            url: "https://cobalt.aelew.dev/",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "User-Agent": "raycast-cobalt/20241120",
              "Authorization": "Api-Key 00000000-0000-4000-a000-000000000000",
            },
          },
          {
            name: "cobalt-cjs",
            url: "https://cobaltapi.cjs.nz/",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "User-Agent": "raycast-cobalt/20241120",
              "Authorization": "Api-Key 00000000-0000-4000-a000-000000000000",
            },
          },
          {
            name: "cobalt-liubquanti",
            url: "https://api.cobalt.liubquanti.click/",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Origin": "https://cobalt.liubquanti.click",
              "Referer": "https://cobalt.liubquanti.click/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            },
          },
        ];

        let lastError = null;
        for (const node of RESOLVER_NODES) {
          try {
            const nodeRes = await fetch(node.url, {
              method: "POST",
              headers: node.headers,
              body: payload,
            });

            if (nodeRes.ok) {
              const data = await nodeRes.json();
              if (data && data.status !== "error") {
                return new Response(JSON.stringify(data), {
                  status: 200,
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              } else if (data?.error) {
                lastError = data;
              }
            } else {
              try {
                const errData = await nodeRes.json();
                if (errData?.error) lastError = errData;
              } catch {
                lastError = { status: "error", error: { code: `http_${nodeRes.status}` } };
              }
            }
          } catch (nodeErr) {
            lastError = { status: "error", error: { code: "node_unreachable", context: { message: nodeErr.message } } };
          }
        }

        return new Response(JSON.stringify(lastError || { status: "error", error: { code: "all_resolvers_exhausted" } }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
