export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          ok: true,
          message:
            "Shared L'Oreal Worker is running. Send a POST request with { messages, project?, useWebSearch? }."
        }),
        { headers: corsHeaders }
      );
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed. Use POST." }),
        { status: 405, headers: corsHeaders }
      );
    }

    try {
      const apiKey = env.OPENAI_API_KEY;

      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing OPENAI_API_KEY secret." }),
          { status: 500, headers: corsHeaders }
        );
      }

      const body = await request.json();
      const { messages, useWebSearch = false, project = "p9" } = body || {};

      if (!Array.isArray(messages) || messages.length === 0) {
        return new Response(
          JSON.stringify({
            error: "Invalid request. `messages` must be a non-empty array."
          }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (project === "p8") {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages,
            max_completion_tokens: 300
          })
        });

        const data = await response.json();

        return new Response(JSON.stringify(data), {
          status: response.status,
          headers: corsHeaders
        });
      }

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: messages,
          tools: useWebSearch ? [{ type: "web_search_preview" }] : [],
          temperature: 0.5
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return new Response(
          JSON.stringify({ error: "OpenAI request failed.", details: errorBody }),
          { status: 502, headers: corsHeaders }
        );
      }

      const data = await response.json();

      const reply =
        data.output_text ||
        data.output
          ?.flatMap((item) => item.content || [])
          .filter((entry) => entry.type === "output_text")
          .map((entry) => entry.text)
          .join("\n")
          .trim() ||
        "I could not generate a response.";

      const sources = (data.output || [])
        .flatMap((item) => item.content || [])
        .filter((entry) => entry.type === "output_text" && Array.isArray(entry.annotations))
        .flatMap((entry) =>
          entry.annotations
            .filter((annotation) => annotation.type === "url_citation")
            .map((annotation) => ({
              title: annotation.title || annotation.url,
              url: annotation.url
            }))
        );

      const uniqueSources = sources.filter(
        (source, index, self) =>
          source.url && index === self.findIndex((item) => item.url === source.url)
      );

      return new Response(
        JSON.stringify({
          reply,
          sources: uniqueSources
        }),
        { headers: corsHeaders }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Unexpected Worker error.",
          details: String(error)
        }),
        { status: 500, headers: corsHeaders }
      );
    }
  }
};
