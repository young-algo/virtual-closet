function weatherCodePhraseV2_(code) {
  if (code === 0) return 'clear';
  if (code <= 3) return 'partly cloudy';
  if (code <= 48) return 'foggy';
  if (code <= 67) return 'rainy';
  if (code <= 77) return 'snowy';
  if (code <= 82) return 'showery';
  return 'stormy';
}

function modelWeatherViewV2_(weather) {
  var keys = [
    'morningFeelsLikeF', 'middayFeelsLikeF', 'eveningFeelsLikeF', 'minFeelsLikeF', 'maxFeelsLikeF',
    'highTemperatureF', 'lowTemperatureF', 'maxRainProbability', 'totalPrecipitationInches',
    'maxWindMph', 'maxGustMph', 'averageHumidity', 'rainExpected', 'windy', 'largeTemperatureSwing',
    'layerGuidance', 'plainEnglishSummary', 'weatherPhrase', 'localDate', 'locationLabel'
  ];
  return keys.reduce(function(view, key) {
    if (Object.prototype.hasOwnProperty.call(weather, key)) view[key] = weather[key];
    return view;
  }, {});
}

function fetchDailyWeatherV2() {
  var config = applySnapshotSettingsV2_(getDailyConfigV2_(), loadSnapshotV2_());
  var params = {
    latitude: config.latitude,
    longitude: config.longitude,
    hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',
    daily: 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,weather_code',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: config.timezone,
    forecast_days: 1
  };
  var query = Object.keys(params).map(function(key) { return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); }).join('&');
  var response;
  try {
    response = UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?' + query, { muteHttpExceptions: true });
  } catch (error) {
    try {
      var exceptionCached = loadWeatherCacheV2_();
      if (exceptionCached && exceptionCached.localDate === localDateV2_(new Date(), config.timezone) && Date.now() - exceptionCached.fetchedAt <= DAILY_V2.MAX_WEATHER_AGE_MS) return exceptionCached;
    } catch (_cacheError) {}
    throw error;
  }
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    var cached = loadWeatherCacheV2_();
    if (cached && cached.localDate === localDateV2_(new Date(), config.timezone) && Date.now() - cached.fetchedAt <= DAILY_V2.MAX_WEATHER_AGE_MS) return cached;
    throw new Error('Weather service returned HTTP ' + status);
  }
  var raw = JSON.parse(response.getContentText());
  var profile = deriveWeatherProfileV2_(raw, config);
  saveWeatherCacheV2_(profile);
  return profile;
}

function deriveWeatherProfileV2_(raw, config) {
  if (!raw || !raw.hourly || !raw.daily) throw new Error('Weather response is incomplete');
  var hours = [];
  raw.hourly.time.forEach(function(time, index) {
    var localHour = Number(time.slice(11, 13));
    if (localHour < 6 || localHour > 23) return;
    hours.push({
      localHour: localHour,
      temperatureF: raw.hourly.temperature_2m[index],
      feelsLikeF: raw.hourly.apparent_temperature[index],
      precipitationProbability: raw.hourly.precipitation_probability[index] || 0,
      precipitationInches: raw.hourly.precipitation[index] || 0,
      humidity: raw.hourly.relative_humidity_2m[index] || 0,
      windMph: raw.hourly.wind_speed_10m[index] || 0,
      gustMph: raw.hourly.wind_gusts_10m[index] || 0,
      weatherCode: raw.hourly.weather_code[index]
    });
  });
  if (!hours.length) throw new Error('Weather response contains no usable daytime hours');
  var sensitivity = 0;
  try {
    var snapshot = loadSnapshotV2_();
    sensitivity = snapshot && snapshot.settings ? Number(snapshot.settings.coldSensitivity || 0) : 0;
  } catch (_ignored) {}
  var shift = sensitivity * -3;
  var feels = hours.map(function(hour) { return hour.feelsLikeF + shift; });
  var pick = function(start, end) {
    var values = hours.filter(function(hour) { return hour.localHour >= start && hour.localHour <= end; }).map(function(hour) { return hour.feelsLikeF + shift; });
    return values.length ? values.reduce(function(sum, value) { return sum + value; }, 0) / values.length : feels[0];
  };
  var minFeels = Math.min.apply(null, feels);
  var maxFeels = Math.max.apply(null, feels);
  var maxRain = Math.max.apply(null, hours.map(function(hour) { return hour.precipitationProbability; }));
  var totalRain = hours.reduce(function(sum, hour) { return sum + hour.precipitationInches; }, 0);
  var maxWind = Math.max.apply(null, hours.map(function(hour) { return hour.windMph; }));
  var maxGust = Math.max.apply(null, hours.map(function(hour) { return hour.gustMph; }));
  var humidity = hours.reduce(function(sum, hour) { return sum + hour.humidity; }, 0) / hours.length;
  var rainExpected = maxRain >= 50 && totalRain >= 0.01;
  var layerGuidance = minFeels < 40 ? 'required' : minFeels < 50 ? 'recommended' : maxFeels - minFeels >= 18 ? 'optional' : 'none';
  var high = raw.daily.temperature_2m_max[0];
  var code = raw.daily.weather_code[0];
  var implications = [];
  if (layerGuidance === 'required') implications.push('A warm layer is essential early and late');
  else if (layerGuidance === 'recommended') implications.push('Plan on a layer for the cooler hours');
  else if (layerGuidance === 'optional') implications.push('A removable layer will handle the temperature swing');
  else implications.push('Light, breathable pieces should carry the day');
  if (rainExpected) implications.push('rain-safe shoes matter');
  if (maxWind >= 18 || maxGust >= 28) implications.push('wind protection is useful');
  return {
    localDate: String(raw.daily.time[0]),
    locationLabel: config.locationLabel,
    timezone: config.timezone,
    hourly: hours,
    morningFeelsLikeF: pick(6, 10),
    middayFeelsLikeF: pick(11, 15),
    eveningFeelsLikeF: pick(17, 22),
    minFeelsLikeF: minFeels,
    maxFeelsLikeF: maxFeels,
    highTemperatureF: high,
    lowTemperatureF: raw.daily.temperature_2m_min[0],
    maxRainProbability: maxRain,
    totalPrecipitationInches: totalRain,
    maxWindMph: maxWind,
    maxGustMph: maxGust,
    averageHumidity: humidity,
    rainExpected: rainExpected,
    windy: maxWind >= 18 || maxGust >= 28,
    largeTemperatureSwing: maxFeels - minFeels >= 18,
    layerGuidance: layerGuidance,
    plainEnglishSummary: implications.join('; ') + '.',
    weatherPhrase: weatherCodePhraseV2_(code),
    fetchedAt: Date.now()
  };
}
