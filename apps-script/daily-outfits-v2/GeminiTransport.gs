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
    error.status = status;
    throw error;
  }
  var envelope = JSON.parse(response.getContentText());
  var parts = envelope.candidates && envelope.candidates[0] && envelope.candidates[0].content && envelope.candidates[0].content.parts;
  if (!parts || !parts.length || !parts[0].text) throw new Error(stage + ' model returned no JSON text');
  try { return JSON.parse(parts[0].text); } catch (_error) { throw new Error(stage + ' model returned invalid JSON'); }
}

function geminiRetryDelayV2_(error, attempt) {
  if (!error || !error.retryable || attempt >= 2) return null;
  return error.status === 429 ? 20000 : 4000;
}

function fetchGeminiWithRetryV2_(request, stage) {
  for (var attempt = 1; attempt <= 2; attempt += 1) {
    var response;
    try {
      response = UrlFetchApp.fetch(request.url, request);
    } catch (error) {
      error.retryable = true;
      var transportDelay = geminiRetryDelayV2_(error, attempt);
      if (transportDelay === null) throw error;
      Utilities.sleep(transportDelay);
      continue;
    }
    try {
      return parseGeminiResponseV2_(response, stage);
    } catch (error) {
      var delay = geminiRetryDelayV2_(error, attempt);
      if (delay === null) throw error;
      Utilities.sleep(delay);
    }
  }
  throw new Error(stage + ' model retry loop exited unexpectedly');
}

function geminiBatchStageV2_(stage, call, index) {
  return stage + '[' + (call.context || index) + ']';
}

function callGeminiV2_(stage, parts, schema, temperature) {
  var request = geminiRequestV2_(getModelNameV2_(stage), parts, schema, temperature);
  return fetchGeminiWithRetryV2_(request, stage);
}

function callGeminiBatchV2_(stage, calls) {
  var model = getModelNameV2_(stage);
  var requests = calls.map(function(call) { return geminiRequestV2_(model, call.parts, call.schema, call.temperature); });
  var results = new Array(calls.length);
  var failures = [];
  UrlFetchApp.fetchAll(requests).forEach(function(response, index) {
    try {
      results[index] = parseGeminiResponseV2_(response, geminiBatchStageV2_(stage, calls[index], index));
    } catch (error) {
      failures.push({ index: index, error: error });
    }
  });

  var retryable = failures.filter(function(failure) { return failure.error.retryable; });
  var remaining = failures.filter(function(failure) { return !failure.error.retryable; });
  if (retryable.length) {
    var delay = retryable.some(function(failure) { return failure.error.status === 429; }) ? 20000 : 4000;
    Utilities.sleep(delay);
    var retryResponses = UrlFetchApp.fetchAll(retryable.map(function(failure) { return requests[failure.index]; }));
    retryResponses.forEach(function(response, retryIndex) {
      var originalIndex = retryable[retryIndex].index;
      try {
        results[originalIndex] = parseGeminiResponseV2_(response, geminiBatchStageV2_(stage, calls[originalIndex], originalIndex));
      } catch (error) {
        remaining.push({ index: originalIndex, error: error });
      }
    });
  }
  if (remaining.length) {
    remaining.sort(function(a, b) { return a.index - b.index; });
    throw remaining[0].error;
  }
  return results;
}
