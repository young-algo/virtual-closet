function geminiUrlV2_(model) {
  return 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(getRequiredPropertyV2_('GEMINI_API_KEY'));
}

function geminiRequestV2_(model, parts, schema, temperature) {
  return {
    url: geminiUrlV2_(model),
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        temperature: temperature,
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    })
  };
}

function parseGeminiResponseV2_(response, stage) {
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    var retryable = status === 429 || status >= 500;
    var responseText = response.getContentText() || '';
    var detail = responseText;
    try {
      var parsed = JSON.parse(responseText);
      detail = parsed && parsed.error && parsed.error.message ? parsed.error.message : responseText;
    } catch (_ignored) {}
    detail = String(detail || 'No response detail').replace(/\s+/g, ' ').slice(0, 1500);
    console.error(stage + ' model HTTP ' + status + ': ' + detail);
    var error = new Error(stage + ' model returned HTTP ' + status + ': ' + detail);
    error.retryable = retryable;
    throw error;
  }
  var envelope = JSON.parse(response.getContentText());
  var parts = envelope.candidates && envelope.candidates[0] && envelope.candidates[0].content && envelope.candidates[0].content.parts;
  if (!parts || !parts.length || !parts[0].text) throw new Error(stage + ' model returned no JSON text');
  try { return JSON.parse(parts[0].text); } catch (_error) { throw new Error(stage + ' model returned invalid JSON'); }
}

function callGeminiV2_(stage, parts, schema, temperature) {
  var request = geminiRequestV2_(getModelNameV2_(stage), parts, schema, temperature);
  return parseGeminiResponseV2_(UrlFetchApp.fetch(request.url, request), stage);
}

function callGeminiBatchV2_(stage, calls) {
  var model = getModelNameV2_(stage);
  var requests = calls.map(function(call) { return geminiRequestV2_(model, call.parts, call.schema, call.temperature); });
  var responses = UrlFetchApp.fetchAll(requests);
  return responses.map(function(response) { return parseGeminiResponseV2_(response, stage); });
}
