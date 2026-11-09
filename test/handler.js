// Run: node test/handler.js
//
// Loads the plugin script against a fake Pebble API and calls its handlers, the way the Pebble
// app would: weather locations from preferences/weather_location, the phone's position for the
// current one, the clock from preferences/units, and settings over the config channel.

'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var source = fs.readFileSync(path.join(__dirname, '../src/plugin/index.js'), 'utf8');

function load(fake) {
  var handlers = {};
  var store = {};
  var refreshed = [];
  var context = {
    console: { log: function () {}, error: function () {} },
    Promise: Promise, Date: Date, Math: Math, JSON: JSON,
    localStorage: {
      getItem: function (k) { return k in store ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
    },
    navigator: {
      geolocation: {
        getCurrentPosition: function (ok, fail) {
          if (fake.position) ok({ coords: fake.position });
          else fail({ code: 1, message: 'denied' });
        },
      },
    },
    Pebble: {
      readSource: function (q) {
        var answer = fake.sources[q.category + '/' + q.item];
        return answer ? Promise.resolve(answer) : Promise.reject({ code: 'PLUGIN_UNAVAILABLE' });
      },
      subscribeSource: function () {},
      refreshSources: function (list) { refreshed.push(list); },
      registerSourceHandler: function (fn) { handlers.source = fn; },
      registerConfigHandler: function (fn) { handlers.config = fn; },
    },
  };
  vm.runInNewContext(source, context);
  return { handlers: handlers, refreshed: refreshed };
}

// Objects made inside the sandbox fail deepStrictEqual against ours, so compare them as JSON.
function plain(x) {
  return JSON.parse(JSON.stringify(x));
}

function ask(plugin, request) {
  return new Promise(function (resolve) {
    plugin.handlers.source(request, {
      data: function (d) { resolve({ data: plain(d) }); },
      error: function (code, message) { resolve({ error: code, message: message }); },
    });
  });
}

function config(plugin, message) {
  return new Promise(function (resolve) { plugin.handlers.config(message, function (r) { resolve(plain(r)); }); });
}

var LOCATIONS = {
  instances: [
    { instanceId: 'loc-current', properties: { name: { shortText: { text: 'Current location' } }, current: { boolean: { value: true } } } },
    {
      instanceId: 'loc-jlm',
      properties: {
        name: { shortText: { text: 'Jerusalem' } },
        latitude: { numericValue: { value: 31.778 } }, longitude: { numericValue: { value: 35.235 } },
        current: { boolean: { value: false } },
      },
    },
  ],
};
var UNITS = { instances: [{ properties: { clock: { shortText: { text: '24h' } } } }] };
var HERE = { latitude: 39.95, longitude: -75.17 };

var failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log('ok   ' + name);
  } catch (e) {
    failures++;
    console.log('FAIL ' + name + '\n     ' + e.message);
  }
}

(async function () {
  await check('one instance per weather location, under its instanceId', async function () {
    var p = load({ position: HERE, sources: { 'preferences/weather_location': LOCATIONS, 'preferences/units': UNITS } });
    var r = await ask(p, { category: 'hebrew_calendar', item: 'date' });
    assert.ok(r.data, r.error);
    assert.deepStrictEqual(r.data.instances.map(function (i) { return i.instanceId; }), ['loc-current', 'loc-jlm']);
    assert.strictEqual(r.data.instances[1].properties.name.shortText.text, 'Jerusalem');
    assert.ok(/^\d+ \S/.test(r.data.instances[0].properties.date.shortText.text));
    assert.ok(r.data.validUntilMs > Date.now() && r.data.validUntilMs <= Date.now() + 86400000);
  });

  await check('times use the clock from preferences/units', async function () {
    var p = load({ position: HERE, sources: { 'preferences/weather_location': LOCATIONS, 'preferences/units': UNITS } });
    var r = await ask(p, { category: 'hebrew_calendar', item: 'times' });
    var props = r.data.instances[0].properties;
    assert.ok(/ \d\d:\d\d$/.test(props.next_sun_tzeit.longText.text), props.next_sun_tzeit.longText.text);
    assert.ok(/^\d\d:\d\d$/.test(props.next_sun_tzeit.shortText.text), props.next_sun_tzeit.shortText.text);
    assert.strictEqual(props.daily_sunset.series.timestamp.values.length, 7);
    assert.strictEqual(props.date, undefined);
  });

  await check('no weather locations: just where the phone is', async function () {
    var p = load({ position: HERE, sources: {} });
    var r = await ask(p, { category: 'hebrew_calendar', item: 'date' });
    assert.deepStrictEqual(r.data.instances.map(function (i) { return i.instanceId; }), ['current']);
  });

  await check('location refused: PERMISSION_DENIED', async function () {
    var p = load({ position: null, sources: {} });
    var r = await ask(p, { category: 'hebrew_calendar', item: 'date' });
    assert.strictEqual(r.error, 'PERMISSION_DENIED');
  });

  await check('position refused, but a saved place still serves', async function () {
    var p = load({ position: null, sources: { 'preferences/weather_location': LOCATIONS } });
    var r = await ask(p, { category: 'hebrew_calendar', item: 'date' });
    assert.deepStrictEqual(r.data.instances.map(function (i) { return i.instanceId; }), ['loc-jlm']);
  });

  await check('settings: defaults, saving, and a refresh', async function () {
    var p = load({ position: HERE, sources: {} });
    assert.deepStrictEqual(await config(p, { type: 'get' }), { secondDays: true, hebrewScript: false });
    var saved = await config(p, { type: 'set', hebrewScript: true });
    assert.deepStrictEqual(saved, { secondDays: true, hebrewScript: true });
    assert.deepStrictEqual(plain(p.refreshed), [['hebrew_calendar/date', 'hebrew_calendar/times']]);
    var r = await ask(p, { category: 'hebrew_calendar', item: 'date' });
    assert.ok(/[\u05D0-\u05EA]/.test(r.data.instances[0].properties.date.shortText.text));
  });

  console.log(failures ? '\n' + failures + ' failed' : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
