// Run: node test/test.js
//
// Dates against convertdate and sun times against PyEphem (fixtures in test/fixtures, made by
// the scripts in test/gen), plus tests of the holiday rules and the sunset rollover.

'use strict';

var assert = require('assert');
var path = require('path');
var cal = require('../src/plugin/index.js');

var failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('ok   ' + name);
  } catch (e) {
    failures++;
    console.log('FAIL ' + name + '\n     ' + e.message);
  }
}

var hebdate = require(path.join(__dirname, 'fixtures/hebdate.json'));
var zmanim = require(path.join(__dirname, 'fixtures/zmanim.json'));

// A fixed-offset place, like the ones that aren't the phone's.
function at(lat, lon, offsetMin) {
  return { lat: lat, lon: lon, offsetAt: function () { return offsetMin; } };
}
var PHILLY = at(39.95, -75.17, -300); // EST; the dates below avoid summer time
var ON = { secondDays: true, hebrewScript: false };
var OFF = { secondDays: false, hebrewScript: false };

function hebrewOn(y, m, d) {
  return cal.jdToHebrew(cal.gregorianToJd(y, m, d));
}
function names(y, m, d, settings, script) {
  var jd = cal.gregorianToJd(y, m, d);
  return cal.holidays(cal.jdToHebrew(jd), jd, (settings || ON).secondDays)
    .map(function (e) { return cal.holidayText(e, script || 'latin'); });
}
// Local Philadelphia wall time (EST) as epoch ms.
function est(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h + 5, min || 0);
}

check('Gregorian to Hebrew matches convertdate (' + hebdate.dates.length + ' dates)', function () {
  hebdate.dates.forEach(function (f) {
    var h = hebrewOn(f.g[0], f.g[1], f.g[2]);
    assert.deepStrictEqual([h.year, h.month, h.day], f.h, f.g.join('-'));
    assert.strictEqual(cal.isLeapYear(h.year), f.leap, f.g.join('-') + ' leap');
  });
});

check('Hebrew to Gregorian round-trips', function () {
  hebdate.dates.forEach(function (f) {
    assert.strictEqual(cal.hebrewToJd(f.h[0], f.h[1], f.h[2]), cal.gregorianToJd(f.g[0], f.g[1], f.g[2]));
  });
});

check('month lengths match convertdate', function () {
  hebdate.monthLengths.forEach(function (f) {
    var count = f.leap ? 13 : 12;
    var got = [];
    for (var m = 1; m <= count; m++) got.push(cal.monthLength(f.year, m));
    assert.deepStrictEqual(got, f.lengths, String(f.year));
  });
});

check('sunrise, sunset and tzeit within 2 minutes of PyEphem (' + zmanim.length + ' cases)', function () {
  var TOL = 120000;
  zmanim.forEach(function (f) {
    var sun = cal.solarEvents(f.t - 2 * 86400000, f.t + 2 * 86400000, f.lat, f.lon, cal.SUNRISE_SET_ANGLE);
    var prev = sun.filter(function (e) { return e.t <= f.t; }).pop();
    var next = sun.filter(function (e) { return e.t > f.t; })[0];
    var label = f.name + ' @' + new Date(f.t).toISOString();
    if (f.prev === null || f.next === null) return; // polar cases
    assert.ok(Math.abs(prev.t - f.prev) < TOL, label + ' prev off by ' + (prev.t - f.prev) / 1000 + 's');
    assert.ok(Math.abs(next.t - f.next) < TOL, label + ' next off by ' + (next.t - f.next) / 1000 + 's');
    assert.strictEqual(prev.rising, f.prevRising, label + ' prevRising');
    if (f.tzeitNext !== null && f.tzeitNext !== undefined) {
      var dusk = cal.solarEvents(f.t - 86400000, f.t + 2 * 86400000, f.lat, f.lon, cal.TZEIT_ANGLE)
        .filter(function (e) { return !e.rising && e.t > f.t; })[0];
      assert.ok(Math.abs(dusk.t - f.tzeitNext) < TOL, label + ' tzeit off by ' + (dusk.t - f.tzeitNext) / 1000 + 's');
    }
  });
});

check('gematria', function () {
  assert.strictEqual(cal.gematria(1), "א'");
  assert.strictEqual(cal.gematria(15), 'ט"ו');
  assert.strictEqual(cal.gematria(16), 'ט"ז');
  assert.strictEqual(cal.gematria(17), 'י"ז');
  assert.strictEqual(cal.gematria(30), "ל'");
  assert.strictEqual(cal.gematria(5787), 'תשפ"ז');
  assert.strictEqual(cal.gematria(5800), 'ת"ת');
});

// Holidays. The civil dates come from the conversion checked above, not an outside calendar,
// so these test the holiday rules rather than the dates.
check('Tishrei 5787', function () {
  assert.deepStrictEqual(names(2026, 9, 11), ['Erev Rosh Hashana']);
  assert.deepStrictEqual(names(2026, 9, 12), ['Rosh Hashana 1']);
  assert.deepStrictEqual(names(2026, 9, 13), ['Rosh Hashana 2']);
  assert.deepStrictEqual(names(2026, 9, 14), ['Tzom Gedaliah']);
  assert.deepStrictEqual(names(2026, 9, 21), ['Yom Kippur']);
  assert.deepStrictEqual(names(2026, 9, 27), ['Sukkot 2']);
  assert.deepStrictEqual(names(2026, 9, 27, OFF), ['Chol HaMoed Sukkot']);
  assert.deepStrictEqual(names(2026, 10, 2), ['Hoshana Rabbah']);
  assert.deepStrictEqual(names(2026, 10, 3, OFF), ['Shmini Atzeret', 'Simchat Torah']);
  assert.deepStrictEqual(names(2026, 10, 4), ['Simchat Torah']);
  assert.deepStrictEqual(names(2026, 10, 4, OFF), []);
});

check('Rosh Chodesh, both days, named for the new month', function () {
  // 30 Tishrei and 1 Heshvan 5787
  assert.deepStrictEqual(names(2026, 10, 11), ['Rosh Chodesh Heshvan']);
  assert.deepStrictEqual(names(2026, 10, 12), ['Rosh Chodesh Heshvan']);
  assert.deepStrictEqual(names(2026, 10, 12, ON, 'hebrew'), ['ראש חודש חשון']);
});

check('Chanukah counts candles across Rosh Chodesh Tevet', function () {
  // 25 Kislev 5787 is 2026-12-05.
  assert.deepStrictEqual(names(2026, 12, 4), []);
  assert.deepStrictEqual(names(2026, 12, 5), ['Chanukah 1']);
  assert.ok(names(2026, 12, 10).indexOf('Chanukah 6') >= 0);
  assert.ok(names(2026, 12, 10).some(function (n) { return n.indexOf('Rosh Chodesh Tevet') === 0; }));
  assert.deepStrictEqual(names(2026, 12, 12), ['Chanukah 8']);
  assert.deepStrictEqual(names(2026, 12, 13), []);
});

check('a leap year: Purim Katan in Adar 1, Purim in Adar 2', function () {
  // 5787 is a leap year: 14 Adar 1 is 2027-02-21, 14 Adar 2 is 2027-03-23.
  assert.deepStrictEqual(names(2027, 2, 21), ['Purim Katan']);
  assert.deepStrictEqual(names(2027, 3, 22), ["Ta'anit Esther"]);
  assert.deepStrictEqual(names(2027, 3, 23), ['Purim']);
  assert.deepStrictEqual(names(2027, 3, 24), ['Shushan Purim']);
});

check('fasts that fall on Shabbat move', function () {
  // 9 Av 5782 was Shabbat 2022-08-06, so Tisha B'Av was Sunday the 7th; 17 Tammuz likewise.
  assert.deepStrictEqual(names(2022, 8, 6), []);
  assert.deepStrictEqual(names(2022, 8, 7), ["Tisha B'Av"]);
  assert.deepStrictEqual(names(2022, 7, 16), []);
  assert.deepStrictEqual(names(2022, 7, 17), ["Shiva Asar B'Tammuz"]);
  // 9 Av 5786 is a Thursday, 2026-07-23, and stays put.
  assert.deepStrictEqual(names(2026, 7, 23), ["Tisha B'Av"]);
  // 13 Adar 2 5784 was Shabbat 2024-03-23, so Ta'anit Esther was Thursday the 21st.
  assert.deepStrictEqual(names(2024, 3, 21), ["Ta'anit Esther"]);
  assert.deepStrictEqual(names(2024, 3, 23), []);
  // 3 Tishrei 5785 was Shabbat 2024-10-05, so Tzom Gedaliah was Sunday the 6th.
  assert.deepStrictEqual(names(2024, 10, 5), []);
  assert.deepStrictEqual(names(2024, 10, 6), ['Tzom Gedaliah']);
});

check('Pesach and Shavuot 5787, with and without second days', function () {
  // 15 Nisan 5787 is 2027-04-22.
  assert.deepStrictEqual(names(2027, 4, 21), ['Erev Pesach']);
  assert.deepStrictEqual(names(2027, 4, 22), ['Pesach 1']);
  assert.deepStrictEqual(names(2027, 4, 23), ['Pesach 2']);
  assert.deepStrictEqual(names(2027, 4, 23, OFF), ['Chol HaMoed Pesach']);
  assert.deepStrictEqual(names(2027, 4, 29, OFF), []);
  assert.deepStrictEqual(names(2027, 4, 29), ['Pesach 8']);
  assert.deepStrictEqual(names(2027, 6, 12), ['Shavuot 2']);
  assert.deepStrictEqual(names(2027, 6, 12, OFF), []);
});

check('the date rolls over at sunset', function () {
  // Friday 2026-11-13 is 3 Kislev 5787; Philadelphia sunset is about 4:48 PM.
  var before = cal.compute(est(2026, 11, 13, 16, 30), PHILLY, ON);
  var after = cal.compute(est(2026, 11, 13, 17, 0), PHILLY, ON);
  assert.deepStrictEqual([before.hebrew.month, before.hebrew.day], [9, 3]);
  assert.deepStrictEqual([after.hebrew.month, after.hebrew.day], [9, 4]);
  // Still the evening's date after midnight, then the civil date catches up.
  var small = cal.compute(est(2026, 11, 14, 1, 0), PHILLY, ON);
  assert.deepStrictEqual([small.hebrew.month, small.hebrew.day], [9, 4]);
});

check('Shabbat and yom tov, today and tonight', function () {
  var friday = cal.compute(est(2026, 11, 13, 10), PHILLY, ON);
  assert.strictEqual(friday.today, false);
  assert.strictEqual(friday.tonight, true);
  var saturday = cal.compute(est(2026, 11, 14, 10), PHILLY, ON);
  assert.strictEqual(saturday.today, true);
  assert.strictEqual(saturday.tonight, false);
  // Wednesday 2027-04-21 is Erev Pesach: yom tov tonight.
  var erev = cal.compute(est(2027, 4, 21, 10), at(39.95, -75.17, -240), ON);
  assert.strictEqual(erev.tonight, true);
  // Thursday 2027-04-22 is Pesach 1; with second days, tonight too.
  var first = cal.compute(est(2027, 4, 22, 10), at(39.95, -75.17, -240), ON);
  assert.strictEqual(first.today, true);
  assert.strictEqual(first.tonight, true);
  var firstOneDay = cal.compute(est(2027, 4, 22, 10), at(39.95, -75.17, -240), OFF);
  assert.strictEqual(firstOneDay.tonight, false);
});

check('next event and when to recompute', function () {
  var c = cal.compute(est(2026, 11, 13, 12), PHILLY, ON);
  assert.strictEqual(c.nextSun.name, 'sunset');
  assert.strictEqual(c.nextSunTzeit.name, 'sunset');
  assert.strictEqual(c.validUntil, c.nextSunTzeit.t);
  // Between sunset and tzeit, the two disagree.
  var dusk = cal.compute(est(2026, 11, 13, 17), PHILLY, ON);
  assert.strictEqual(dusk.nextSun.name, 'sunrise');
  assert.strictEqual(dusk.nextSunTzeit.name, 'tzeit');
  assert.strictEqual(dusk.validUntil, dusk.nextSunTzeit.t);
  var duskProps = cal.timeProperties(dusk, PHILLY, ON, '12h');
  assert.ok(/^Sunrise 6:\d\d AM$/.test(duskProps.next_sun.longText.text), duskProps.next_sun.longText.text);
  assert.ok(/^Tzeit 5:\d\d PM$/.test(duskProps.next_sun_tzeit.longText.text), duskProps.next_sun_tzeit.longText.text);
  assert.ok(/^6:\d\d$/.test(duskProps.next_sun.shortText.text), duskProps.next_sun.shortText.text);
  assert.strictEqual(duskProps.next_sun_time.timestamp.value, duskProps.next_sunrise.timestamp.value);
  assert.strictEqual(duskProps.next_sun_tzeit_time.timestamp.value, duskProps.next_tzeit.timestamp.value);
  var late = cal.compute(est(2026, 11, 13, 23), PHILLY, ON);
  assert.strictEqual(late.nextSun.name, 'sunrise');
  assert.strictEqual(late.nextSunTzeit.name, 'sunrise');
  assert.strictEqual(late.validUntil, est(2026, 11, 14, 0)); // midnight comes first
  var props = cal.timeProperties(c, PHILLY, ON, '12h');
  assert.ok(/^Sunset 4:4\d PM$/.test(props.next_sun.longText.text), props.next_sun.longText.text);
  assert.ok(/^4:4\d$/.test(props.next_sun.shortText.text), props.next_sun.shortText.text);
  assert.strictEqual(props.next_sun_tzeit.shortText.text, props.next_sun.shortText.text);
  assert.strictEqual(props.daily_tzeit.series.timestamp.values.length, 7);
  // At noon, the next sunrise is tomorrow's, while sunset and tzeit are today's.
  assert.strictEqual(props.next_sunrise.timestamp.value, Math.round(c.days[1].sun.sunrise / 1000));
  assert.strictEqual(props.next_sunset.timestamp.value, props.sunset.timestamp.value);
  assert.strictEqual(props.next_tzeit.timestamp.value, props.tzeit.timestamp.value);
  assert.ok(props.next_sunrise.timestamp.value > props.sunrise.timestamp.value);
});

check('polar: no sunset, so the date rolls over at midnight', function () {
  // Tromsø in midsummer: the sun doesn't set, and it never gets dark enough for tzeit.
  var tromso = at(69.65, 18.96, 120);
  var day = cal.compute(Date.UTC(2026, 5, 21, 21), tromso, ON); // 23:00 local
  assert.strictEqual(day.sun.sunset, null);
  assert.strictEqual(day.sun.tzeit, null);
  var h = cal.jdToHebrew(cal.gregorianToJd(2026, 6, 21));
  assert.deepStrictEqual(day.hebrew, h);
  var night = cal.compute(Date.UTC(2026, 5, 21, 22, 30), tromso, ON); // 00:30 local
  assert.deepStrictEqual(night.hebrew, cal.jdToHebrew(cal.gregorianToJd(2026, 6, 22)));
});

check('Helsinki midsummer: sunset, but no tzeit', function () {
  var c = cal.compute(Date.UTC(2026, 5, 21, 12), at(60.17, 24.94, 180), ON);
  assert.ok(c.sun.sunset !== null);
  assert.strictEqual(c.sun.tzeit, null);
});

check('date properties, both scripts', function () {
  var c = cal.compute(est(2026, 11, 13, 10), PHILLY, ON);
  var latin = cal.dateProperties(c, ON);
  assert.strictEqual(latin.date.shortText.text, '3 Kislev');
  assert.strictEqual(latin.date.longText.text, '3 Kislev 5787');
  var hebrew = cal.dateProperties(c, { secondDays: true, hebrewScript: true });
  assert.strictEqual(hebrew.date.shortText.text, "ג' כסלו");
  assert.strictEqual(hebrew.date.longText.text, 'ג\' כסלו תשפ"ז');
  assert.strictEqual(latin.holiday, undefined);
  // Chanukah 6 on Rosh Chodesh Tevet: both names, in longText only.
  var both = cal.dateProperties(cal.compute(est(2026, 12, 10, 10), PHILLY, ON), ON);
  assert.ok(/^Chanukah 6, Rosh Chodesh Tevet/.test(both.holiday.longText.text), both.holiday.longText.text);
  assert.strictEqual(both.holiday.shortText, undefined);
});

check('solar offset estimate', function () {
  assert.strictEqual(cal.solarOffset(-75.17, Date.UTC(2026, 0, 5)), -300);
  assert.strictEqual(cal.solarOffset(35.23, Date.UTC(2026, 0, 5)), 120);
  assert.strictEqual(cal.solarOffset(151.21, Date.UTC(2026, 0, 5)), 600);
});

console.log(failures ? '\n' + failures + ' failed' : '\nall passed');
process.exit(failures ? 1 : 0);
