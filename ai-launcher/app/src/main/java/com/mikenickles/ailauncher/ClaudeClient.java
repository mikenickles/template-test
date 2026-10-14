package com.mikenickles.ailauncher;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * Minimal streaming Claude Messages API client over HttpURLConnection.
 *
 * Raw HTTP instead of the Java SDK keeps the APK dependency-free (the SDK pulls in OkHttp,
 * Jackson and Kotlin). The conversation is append-only: each assistant turn is rebuilt from the
 * stream and stored exactly as received, and results for client tools are sent at the start of
 * the next user turn.
 *
 * Not thread-safe; call {@link #send} from one background thread at a time.
 */
final class ClaudeClient {

    /** Device actions Claude can trigger. Each returns a short result string for the model. */
    interface Actions {
        String openApp(String packageName);

        String openUrl(String url);

        String setTimer(int seconds, String label);

        String setAlarm(int hour, int minute, String label);
    }

    /** Progress callbacks, invoked on the calling (background) thread. */
    interface Listener {
        void onText(String delta);

        void onStatus(String status);

        void onAction(String result);
    }

    static final class ApiException extends IOException {
        ApiException(String message) {
            super(message);
        }
    }

    private static final String ENDPOINT = "https://api.anthropic.com/v1/messages";
    private static final int MAX_ROUNDS = 4;

    private JSONArray history = new JSONArray();
    private JSONArray pendingToolResults = new JSONArray();

    void reset() {
        history = new JSONArray();
        pendingToolResults = new JSONArray();
    }

    /** Sends one user turn, streaming the reply to {@code listener} and running device actions. */
    void send(String apiKey, String model, String system, String userText, Actions actions,
              Listener listener) throws IOException, JSONException {
        // Snapshot so a failed request leaves the conversation unchanged.
        JSONArray historyBefore = new JSONArray(history.toString());
        JSONArray pendingBefore = pendingToolResults;

        try {
            JSONArray content = pendingToolResults;
            pendingToolResults = new JSONArray();
            content.put(new JSONObject().put("type", "text").put("text", userText));
            history.put(new JSONObject().put("role", "user").put("content", content));

            for (int round = 0; round < MAX_ROUNDS; round++) {
                JSONObject response = stream(apiKey, buildRequest(model, system), listener);
                JSONArray blocks = response.getJSONArray("content");
                history.put(new JSONObject().put("role", "assistant").put("content", blocks));

                JSONArray toolResults = new JSONArray();
                for (int i = 0; i < blocks.length(); i++) {
                    JSONObject block = blocks.getJSONObject(i);
                    if ("tool_use".equals(block.getString("type"))) {
                        JSONObject result = runTool(block, actions);
                        toolResults.put(result);
                        listener.onAction(result.getString("content"));
                    }
                }

                String stop = response.optString("stop_reason");
                if ("pause_turn".equals(stop)) {
                    // A server tool (web search) paused a long turn; resend to let it continue.
                    continue;
                }
                if ("refusal".equals(stop)) {
                    listener.onText("\n\nClaude declined to answer that request.");
                } else if ("max_tokens".equals(stop)) {
                    listener.onText("\n\n(Reply was cut off.)");
                }
                // Device actions usually take the user out of the launcher, so the results are
                // delivered with the next message instead of making another round trip now.
                pendingToolResults = toolResults;
                break;
            }
        } catch (IOException | JSONException | RuntimeException e) {
            history = historyBefore;
            pendingToolResults = pendingBefore;
            throw e;
        }
    }

    private JSONObject buildRequest(String model, String system) throws JSONException {
        JSONObject req = new JSONObject();
        req.put("model", model);
        req.put("max_tokens", 16000);
        req.put("stream", true);
        // Launcher answers should be quick; low effort keeps latency and cost down.
        req.put("output_config", new JSONObject().put("effort", "low"));
        // On a safety decline, let the API retry on a fallback model automatically.
        req.put("fallbacks", "default");
        req.put("system", new JSONArray().put(new JSONObject()
                .put("type", "text")
                .put("text", system)
                .put("cache_control", new JSONObject().put("type", "ephemeral"))));
        req.put("tools", tools());
        req.put("messages", history);
        return req;
    }

    private static JSONArray tools() throws JSONException {
        JSONArray tools = new JSONArray();
        tools.put(clientTool("open_app",
                "Launch an installed app on the user's phone. Use the exact package name from the "
                        + "installed-apps list in the system prompt.",
                new JSONObject().put("package", stringProp("Android package name, e.g. com.spotify.music")),
                "package"));
        tools.put(clientTool("open_url",
                "Open a link on the phone. Supports https:// web pages, geo: map searches "
                        + "(geo:0,0?q=coffee+near+me), tel: to pre-fill the dialer, sms: and mailto:.",
                new JSONObject().put("url", stringProp("The URI to open")),
                "url"));
        tools.put(clientTool("set_timer",
                "Start a countdown timer in the phone's clock app.",
                new JSONObject()
                        .put("seconds", intProp("Timer length in seconds"))
                        .put("label", stringProp("Short label, or an empty string")),
                "seconds", "label"));
        tools.put(clientTool("set_alarm",
                "Set an alarm in the phone's clock app for the next occurrence of a time of day.",
                new JSONObject()
                        .put("hour", intProp("Hour, 0-23"))
                        .put("minute", intProp("Minute, 0-59"))
                        .put("label", stringProp("Short label, or an empty string")),
                "hour", "minute", "label"));
        tools.put(new JSONObject()
                .put("type", "web_search_20260209")
                .put("name", "web_search")
                .put("max_uses", 3));
        return tools;
    }

    private static JSONObject clientTool(String name, String description, JSONObject props,
                                         String... required) throws JSONException {
        JSONArray req = new JSONArray();
        for (String r : required) {
            req.put(r);
        }
        return new JSONObject()
                .put("name", name)
                .put("description", description)
                .put("strict", true)
                .put("input_schema", new JSONObject()
                        .put("type", "object")
                        .put("properties", props)
                        .put("required", req)
                        .put("additionalProperties", false));
    }

    private static JSONObject stringProp(String description) throws JSONException {
        return new JSONObject().put("type", "string").put("description", description);
    }

    private static JSONObject intProp(String description) throws JSONException {
        return new JSONObject().put("type", "integer").put("description", description);
    }

    private static JSONObject runTool(JSONObject block, Actions actions) throws JSONException {
        String name = block.getString("name");
        JSONObject input = block.optJSONObject("input");
        if (input == null) {
            input = new JSONObject();
        }
        String result;
        boolean error = false;
        try {
            if ("open_app".equals(name)) {
                result = actions.openApp(input.getString("package"));
            } else if ("open_url".equals(name)) {
                result = actions.openUrl(input.getString("url"));
            } else if ("set_timer".equals(name)) {
                result = actions.setTimer(input.getInt("seconds"), input.optString("label"));
            } else if ("set_alarm".equals(name)) {
                result = actions.setAlarm(input.getInt("hour"), input.getInt("minute"),
                        input.optString("label"));
            } else {
                result = "Unknown tool: " + name;
                error = true;
            }
        } catch (JSONException | RuntimeException e) {
            result = "Failed: " + e.getMessage();
            error = true;
        }
        return new JSONObject()
                .put("type", "tool_result")
                .put("tool_use_id", block.getString("id"))
                .put("content", result)
                .put("is_error", error);
    }

    /**
     * POSTs a streaming request and reassembles the assistant message from server-sent events.
     * Returns {"content": [...blocks...], "stop_reason": "..."}.
     */
    private static JSONObject stream(String apiKey, JSONObject body, Listener listener)
            throws IOException, JSONException {
        HttpURLConnection conn = (HttpURLConnection) new URL(ENDPOINT).openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(120000);
            conn.setDoOutput(true);
            conn.setRequestProperty("content-type", "application/json");
            conn.setRequestProperty("accept", "text/event-stream");
            conn.setRequestProperty("x-api-key", apiKey);
            conn.setRequestProperty("anthropic-version", "2023-06-01");
            conn.setRequestProperty("anthropic-beta", "server-side-fallback-2026-07-01");

            OutputStream out = conn.getOutputStream();
            out.write(body.toString().getBytes("UTF-8"));
            out.close();

            int code = conn.getResponseCode();
            if (code >= 400) {
                InputStream err = conn.getErrorStream();
                throw new ApiException(describeError(code, err == null ? "" : readAll(err)));
            }

            TreeMap<Integer, JSONObject> blocks = new TreeMap<Integer, JSONObject>();
            Map<Integer, StringBuilder> partialJson = new HashMap<Integer, StringBuilder>();
            String stopReason = "";

            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), "UTF-8"));
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.startsWith("data:")) {
                    continue;
                }
                JSONObject event = new JSONObject(line.substring(5).trim());
                String type = event.optString("type");

                if ("content_block_start".equals(type)) {
                    int index = event.getInt("index");
                    JSONObject block = event.getJSONObject("content_block");
                    blocks.put(index, block);
                    String blockType = block.optString("type");
                    if ("text".equals(blockType) && block.optString("text").length() > 0) {
                        listener.onText(block.optString("text"));
                    } else if ("server_tool_use".equals(blockType)) {
                        listener.onStatus("web_search".equals(block.optString("name"))
                                ? "Searching the web…" : "Working…");
                    }
                    if ("tool_use".equals(blockType) || "server_tool_use".equals(blockType)) {
                        partialJson.put(index, new StringBuilder());
                    }
                } else if ("content_block_delta".equals(type)) {
                    int index = event.getInt("index");
                    JSONObject block = blocks.get(index);
                    JSONObject delta = event.getJSONObject("delta");
                    String deltaType = delta.optString("type");
                    if (block == null) {
                        continue;
                    }
                    if ("text_delta".equals(deltaType)) {
                        String text = delta.getString("text");
                        block.put("text", block.optString("text") + text);
                        listener.onText(text);
                    } else if ("input_json_delta".equals(deltaType)) {
                        StringBuilder sb = partialJson.get(index);
                        if (sb != null) {
                            sb.append(delta.optString("partial_json"));
                        }
                    } else if ("thinking_delta".equals(deltaType)) {
                        block.put("thinking", block.optString("thinking") + delta.optString("thinking"));
                    } else if ("signature_delta".equals(deltaType)) {
                        block.put("signature", block.optString("signature") + delta.optString("signature"));
                    } else if ("citations_delta".equals(deltaType)) {
                        JSONArray citations = block.optJSONArray("citations");
                        if (citations == null) {
                            citations = new JSONArray();
                            block.put("citations", citations);
                        }
                        citations.put(delta.getJSONObject("citation"));
                    }
                } else if ("content_block_stop".equals(type)) {
                    int index = event.getInt("index");
                    StringBuilder sb = partialJson.remove(index);
                    JSONObject block = blocks.get(index);
                    if (sb != null && block != null) {
                        String json = sb.toString().trim();
                        block.put("input", json.isEmpty() ? new JSONObject() : new JSONObject(json));
                    }
                } else if ("message_delta".equals(type)) {
                    JSONObject delta = event.optJSONObject("delta");
                    if (delta != null && !delta.isNull("stop_reason")) {
                        stopReason = delta.optString("stop_reason");
                    }
                } else if ("error".equals(type)) {
                    JSONObject error = event.optJSONObject("error");
                    String message = error == null ? "unknown error" : error.optString("message");
                    throw new ApiException("Claude hit an error mid-reply: " + message);
                }
            }
            reader.close();

            JSONArray content = new JSONArray();
            for (JSONObject block : blocks.values()) {
                content.put(block);
            }
            return new JSONObject().put("content", content).put("stop_reason", stopReason);
        } finally {
            conn.disconnect();
        }
    }

    private static String describeError(int code, String body) {
        String message = body;
        try {
            message = new JSONObject(body).getJSONObject("error").getString("message");
        } catch (JSONException ignored) {
            // Not a JSON error body; show it raw.
        }
        switch (code) {
            case 401:
                return "That API key didn't work. Check it in settings.";
            case 429:
                return "Rate limited by the API. Try again in a moment.";
            case 529:
                return "Claude is overloaded right now. Try again shortly.";
            default:
                return "API error " + code + ": " + message;
        }
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = in.read(chunk)) != -1) {
            buf.write(chunk, 0, n);
        }
        in.close();
        return buf.toString("UTF-8");
    }
}
