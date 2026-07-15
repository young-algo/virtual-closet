function validatePlannerResponseV2_(response, archetype, snapshot) {
  var errors = [];
  if (!response || response.archetype !== archetype) errors.push('response archetype must be ' + archetype);
  if (!response || !Array.isArray(response.candidates) || response.candidates.length !== 5) return errors.concat(['exactly five candidates are required']);
  var items = itemMapV2_(snapshot);
  var candidateIds = Object.create(null);
  var combinations = Object.create(null);
  var coreSelections = [];
  response.candidates.forEach(function(candidate, index) {
    var path = 'candidate[' + index + ']';
    if (typeof candidate.candidateId !== 'string' || !candidate.candidateId ||
        Object.prototype.hasOwnProperty.call(candidateIds, candidate.candidateId)) {
      errors.push(path + ' has a missing or duplicate candidateId');
    } else {
      candidateIds[candidate.candidateId] = true;
      if (historyTextForModelV2_(candidate.candidateId, snapshot) !== candidate.candidateId) {
        errors.push(path + '.candidateId contains an unsafe model token');
      }
    }
    if (candidate.archetype !== archetype) errors.push(path + ' has the wrong archetype');
    var slots = [['topId', 'top'], ['bottomId', 'bottom'], ['shoeId', 'shoes']];
    if (candidate.layerId) slots.push(['layerId', 'layer']);
    slots.forEach(function(pair) {
      var item = items[candidate[pair[0]]];
      if (!item) errors.push(path + '.' + pair[0] + ' is an invented id');
      else if (item.slot !== pair[1]) errors.push(path + '.' + pair[0] + ' uses the wrong slot');
    });
    var expected = [candidate.topId, candidate.bottomId, candidate.shoeId].concat(candidate.layerId ? [candidate.layerId] : []);
    if (new Set(expected).size !== expected.length) errors.push(path + ' repeats an item within the outfit');
    if (!Array.isArray(candidate.itemIds) || candidate.itemIds.length !== expected.length || expected.some(function(id) { return candidate.itemIds.indexOf(id) < 0; })) errors.push(path + '.itemIds does not match its slots');
    if (!candidate.name || !candidate.styleSummary || !candidate.weatherSummary) errors.push(path + ' is missing customer-facing summary text');
    if (!candidate.colorStrategy || candidate.colorStrategy.length < 30 || candidate.colorStrategy.length > 280) errors.push(path + '.colorStrategy must be 30–280 characters and name a specific cross-item visual relationship');
    if (!Array.isArray(candidate.potentialRisks)) errors.push(path + '.potentialRisks must be an array');
    var key = JSON.stringify(expected.slice().sort());
    if (Object.prototype.hasOwnProperty.call(combinations, key)) errors.push(path + ' exactly duplicates another candidate');
    combinations[key] = true;
    var coreIds = [candidate.topId, candidate.bottomId, candidate.shoeId];
    coreSelections.forEach(function(previous, previousIndex) {
      var shared = coreIds.filter(function(id) { return previous.indexOf(id) >= 0; });
      if (shared.length >= 2) errors.push(path + ' is only a one-core-item variation of candidate[' + previousIndex + ']');
    });
    coreSelections.push(coreIds);
    var exactCopy = savedOutfitExactCopyV2_(coreIds, snapshot);
    if (exactCopy) errors.push(path + ' exactly copies manual saved outfit "' + exactCopy.name + '"');
  });
  return errors;
}
