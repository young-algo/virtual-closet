function jsonResponseV2_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Missing request body');
    if (e.postData.contents.length > DAILY_V2.MAX_POST_BYTES) throw new Error('Payload exceeds configured limit');
    var request = JSON.parse(e.postData.contents);
    if (!request.secret || request.secret !== getRequiredPropertyV2_('SYNC_SECRET')) throw new Error('Unauthorized');

    if (request.action === 'syncDailySnapshotV2') {
      var errors = validateSnapshotObjectV2_(request.snapshot);
      if (errors.length) throw new Error('Snapshot rejected: ' + errors.join('; '));
      var cleanSnapshot = JSON.parse(JSON.stringify(request.snapshot));
      saveSnapshotV2_(cleanSnapshot);
      return jsonResponseV2_({ ok: true, action: request.action, message: 'Stored ' + cleanSnapshot.items.length + ' items on ' + cleanSnapshot.atlasPages.length + ' atlas pages.', wardrobeFingerprint: cleanSnapshot.wardrobeFingerprint });
    }
    if (request.action === 'validateStoredSnapshotV2') {
      var result = validateStoredSnapshotV2();
      if (!result.ok) throw new Error(result.errors.join('; '));
      return jsonResponseV2_(Object.assign({ action: request.action, message: 'Stored snapshot passes every structural check.' }, result));
    }
    if (request.action === 'getDailyOutfitDiagnosticsV2') {
      return jsonResponseV2_({
        ok: true,
        action: request.action,
        diagnostics: getDailyOutfitDiagnosticsV2()
      });
    }
    if (request.action === 'generateDailyBundleNowV2') {
      var bundle = generateDailyBundleNowV2();
      return jsonResponseV2_({ ok: true, action: request.action, message: 'Bundle generated.', bundle: bundle });
    }
    if (request.action === 'generateDailyBundleStepV2') {
      var step = generateDailyBundleStepV2();
      return jsonResponseV2_({
        ok: true,
        action: request.action,
        message: step.complete ? 'Bundle generated.' : 'Generation advanced to ' + step.stage + '.',
        complete: step.complete,
        stage: step.stage,
        bundle: step.bundle
      });
    }
    if (request.action === 'sendDailyTestEmailV2') {
      sendDailyTestEmailV2();
      return jsonResponseV2_({ ok: true, action: request.action, message: 'Test email sent.' });
    }
    throw new Error('Unknown action');
  } catch (error) {
    console.error('Daily V2 request failed: ' + error.message);
    return jsonResponseV2_({ ok: false, error: error.message });
  }
}
