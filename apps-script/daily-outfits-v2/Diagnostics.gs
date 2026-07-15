function getDailyOutfitDiagnosticsV2() {
  var snapshot = loadSnapshotV2_();
  var validation = validateStoredSnapshotV2();
  var state = loadJobStateV2_();
  var pending = loadPendingV2_();
  var selection = pending && pending.selection;
  return {
    snapshot: validation,
    job: state,
    selection: selection ? {
      path: selection.path,
      eligibleCountByArchetype: selection.eligibleCountByArchetype,
      feasibleSetCount: selection.feasibleSetCount,
      replannedArchetypes: selection.replannedArchetypes
    } : null,
    attemptCounts: state ? state.attemptCounts : {},
    lastSentDate: getDailyPropertiesV2_().getProperty('LAST_SENT_DATE_V2'),
    modelsConfigured: ['DAILY_PLANNER_MODEL', 'DAILY_CRITIC_MODEL', 'DAILY_CURATOR_MODEL', 'DAILY_REPAIR_MODEL'].reduce(function(result, key) {
      result[key] = Boolean(getDailyPropertiesV2_().getProperty(key));
      return result;
    }, {}),
    snapshotAgeHours: snapshot ? (Date.now() - snapshot.generatedAt) / 3600000 : null
  };
}
