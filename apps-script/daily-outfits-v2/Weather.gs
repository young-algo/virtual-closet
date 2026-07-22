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

var WEATHER_PROVIDER_RETRY_DELAY_MS_V2 = 2000;

function openMeteoUrlV2_(config) {
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
  var apiKey = null;
  try { apiKey = getDailyPropertiesV2_().getProperty('OPEN_METEO_API_KEY'); } catch (_ignored) {}
  if (apiKey) params.apikey = apiKey;
  var query = Object.keys(params).map(function(key) { return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); }).join('&');
  var host = apiKey ? 'https://customer-api.open-meteo.com' : 'https://api.open-meteo.com';
  return host + '/v1/forecast?' + query;
}

function fetchWeatherJsonV2_(label, url, failures) {
  for (var attempt = 1; attempt <= 2; attempt += 1) {
    var response = null;
    try {
      response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'virtual-closet-daily-outfits/2 (github.com/young-algo/virtual-closet)' }
      });
    } catch (error) {
      failures.push(label + ': ' + (error && error.message ? error.message : String(error)));
      if (attempt >= 2) return null;
      Utilities.sleep(WEATHER_PROVIDER_RETRY_DELAY_MS_V2);
      continue;
    }
    var status = response.getResponseCode();
    if (status >= 200 && status < 300) {
      try { return JSON.parse(response.getContentText()); }
      catch (_parseError) { failures.push(label + ': invalid JSON'); return null; }
    }
    failures.push(label + ' HTTP ' + status);
    // 429 here is a quota block on Apps Script's shared egress IPs; an in-run retry cannot clear it.
    if (status < 500 || attempt >= 2) return null;
    Utilities.sleep(WEATHER_PROVIDER_RETRY_DELAY_MS_V2);
  }
  return null;
}

function fetchOpenMeteoProfileV2_(config, failures) {
  var raw = fetchWeatherJsonV2_('open-meteo', openMeteoUrlV2_(config), failures);
  if (!raw) return null;
  try {
    return deriveWeatherProfileV2_(raw, config);
  } catch (error) {
    failures.push('open-meteo: ' + error.message);
    return null;
  }
}

function nwsWindMphV2_(windSpeed) {
  if (typeof windSpeed === 'number') return Number.isFinite(windSpeed) ? windSpeed : 0;
  var matches = String(windSpeed || '').match(/\d+(\.\d+)?/g);
  return matches && matches.length ? Number(matches[matches.length - 1]) : 0;
}

function nwsWeatherCodeV2_(shortForecast) {
  var text = String(shortForecast || '').toLowerCase();
  if (text.indexOf('thunder') >= 0 || text.indexOf('storm') >= 0) return 95;
  if (text.indexOf('snow') >= 0 || text.indexOf('sleet') >= 0 || text.indexOf('ice') >= 0 || text.indexOf('flurr') >= 0) return 73;
  if (text.indexOf('shower') >= 0) return 80;
  if (text.indexOf('rain') >= 0 || text.indexOf('drizzle') >= 0) return 63;
  if (text.indexOf('fog') >= 0 || text.indexOf('mist') >= 0 || text.indexOf('haze') >= 0) return 45;
  if (text.indexOf('sunny') >= 0 || text.indexOf('clear') >= 0) {
    return text.indexOf('partly') >= 0 || text.indexOf('mostly') >= 0 ? 2 : 0;
  }
  return 2;
}

function nwsFeelsLikeFV2_(temperatureF, humidityPercent, windMph) {
  if (temperatureF <= 50 && windMph > 3) {
    var windPow = Math.pow(windMph, 0.16);
    return 35.74 + 0.6215 * temperatureF - 35.75 * windPow + 0.4275 * temperatureF * windPow;
  }
  if (temperatureF < 80) return temperatureF;
  var t = temperatureF;
  var r = humidityPercent;
  var heatIndex = -42.379 + 2.04901523 * t + 10.14333127 * r - 0.22475541 * t * r
    - 0.00683783 * t * t - 0.05481717 * r * r + 0.00122874 * t * t * r
    + 0.00085282 * t * r * r - 0.00000199 * t * t * r * r;
  if (r < 13 && t <= 112) heatIndex -= ((13 - r) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
  else if (r > 85 && t <= 87) heatIndex += ((r - 85) / 10) * ((87 - t) / 5);
  return heatIndex;
}

function nwsRawFromHourlyV2_(hourlyJson, localDate) {
  var periods = hourlyJson && hourlyJson.properties && hourlyJson.properties.periods;
  if (!periods || !periods.length) throw new Error('no forecast periods');
  var today = periods.filter(function(period) { return String(period.startTime || '').slice(0, 10) === localDate; });
  if (!today.length) throw new Error('no forecast periods for ' + localDate);
  var hourly = {
    time: [], temperature_2m: [], apparent_temperature: [], relative_humidity_2m: [],
    precipitation_probability: [], precipitation: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: []
  };
  today.forEach(function(period) {
    var temperatureF = period.temperatureUnit === 'C' ? period.temperature * 9 / 5 + 32 : period.temperature;
    var humidity = period.relativeHumidity && Number.isFinite(Number(period.relativeHumidity.value)) ? Number(period.relativeHumidity.value) : 50;
    var pop = period.probabilityOfPrecipitation && Number.isFinite(Number(period.probabilityOfPrecipitation.value)) ? Number(period.probabilityOfPrecipitation.value) : 0;
    var windMph = nwsWindMphV2_(period.windSpeed);
    hourly.time.push(String(period.startTime));
    hourly.temperature_2m.push(temperatureF);
    hourly.apparent_temperature.push(nwsFeelsLikeFV2_(temperatureF, humidity, windMph));
    hourly.relative_humidity_2m.push(humidity);
    hourly.precipitation_probability.push(pop);
    // NWS hourly forecasts omit precipitation amounts; a nominal 0.02 in/hr above 50% keeps
    // deriveWeatherProfileV2_'s rainExpected threshold equivalent to "probability >= 50".
    hourly.precipitation.push(pop >= 50 ? 0.02 : 0);
    hourly.weather_code.push(nwsWeatherCodeV2_(period.shortForecast));
    hourly.wind_speed_10m.push(windMph);
    hourly.wind_gusts_10m.push(Math.max(windMph, nwsWindMphV2_(period.windGust)));
  });
  return {
    hourly: hourly,
    daily: {
      time: [localDate],
      temperature_2m_max: [Math.max.apply(null, hourly.temperature_2m)],
      temperature_2m_min: [Math.min.apply(null, hourly.temperature_2m)],
      weather_code: [Math.max.apply(null, hourly.weather_code)]
    }
  };
}

function fetchNwsProfileV2_(config, failures) {
  var pointsUrl = 'https://api.weather.gov/points/' + Number(config.latitude).toFixed(4) + ',' + Number(config.longitude).toFixed(4);
  var points = fetchWeatherJsonV2_('nws-points', pointsUrl, failures);
  if (!points) return null;
  var hourlyUrl = points.properties && points.properties.forecastHourly;
  if (!hourlyUrl) {
    failures.push('nws-points: response has no hourly forecast URL');
    return null;
  }
  var hourlyJson = fetchWeatherJsonV2_('nws-hourly', hourlyUrl, failures);
  if (!hourlyJson) return null;
  try {
    return deriveWeatherProfileV2_(nwsRawFromHourlyV2_(hourlyJson, localDateV2_(new Date(), config.timezone)), config);
  } catch (error) {
    failures.push('nws-hourly: ' + error.message);
    return null;
  }
}

function fetchDailyWeatherV2() {
  var config = applySnapshotSettingsV2_(getDailyConfigV2_(), loadSnapshotV2_());
  try {
    var cached = loadWeatherCacheV2_();
    if (cached && cached.localDate === localDateV2_(new Date(), config.timezone) && Date.now() - cached.fetchedAt <= DAILY_V2.MAX_WEATHER_AGE_MS) return cached;
  } catch (_cacheError) {}
  var failures = [];
  var profile = fetchOpenMeteoProfileV2_(config, failures) || fetchNwsProfileV2_(config, failures);
  if (profile) {
    try { saveWeatherCacheV2_(profile); } catch (_saveError) {}
    return profile;
  }
  var unique = failures.filter(function(detail, index) { return failures.indexOf(detail) === index; });
  throw new Error('Weather service unavailable: ' + (unique.join('; ') || 'no provider response'));
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
