// Hebrew calendar plugin: the Hebrew date, holidays, and sunrise, sunset and nightfall (tzeit),
// for each of the user's weather locations. Everything is computed on the phone; nothing is
// fetched.
//
// Under node, the arithmetic is exported for the tests in test/, and the Pebble handlers at the
// bottom are skipped.

'use strict';

var DAY_MS = 86400000;
var DAYS = 7; // length of the daily_* series

// ---------------------------------------------------------------- Hebrew calendar
//
// Ported from convertdate 2.4 (MIT). Months are numbered from Nisan: Tishrei is 7, Adar is 12,
// and Adar 2 is 13 in a leap year. Julian Days use the noon-boundary convention, so a date's JD
// always ends in .5.

var NISAN = 1, IYAR = 2, SIVAN = 3, TAMMUZ = 4, AV = 5, ELUL = 6;
var TISHREI = 7, HESHVAN = 8, KISLEV = 9, TEVET = 10, SHEVAT = 11, ADAR = 12, ADAR2 = 13;

var HEBREW_EPOCH_JD = 347995.5;
var GREGORIAN_EPOCH_JD = 1721425.5;

function isLeapYear(year) {
  return ((year * 7) + 1) % 19 < 7;
}

function yearMonths(year) {
  return isLeapYear(year) ? ADAR2 : ADAR;
}

// Rosh Hashana postponement for improper weekdays (dechiyot).
function delay1(year) {
  var months = Math.floor((235 * year - 234) / 19);
  var parts = 12084 + 13753 * months;
  var day = months * 29 + Math.floor(parts / 25920);
  if ((3 * (day + 1)) % 7 < 3) day += 1;
  return day;
}

// Further postponement, from the lengths of the adjacent years.
function delay2(year) {
  var last = delay1(year - 1);
  var present = delay1(year);
  var next = delay1(year + 1);
  if (next - present === 356) return 2;
  if (present - last === 382) return 1;
  return 0;
}

function yearDays(year) {
  return hebrewToJd(year + 1, TISHREI, 1) - hebrewToJd(year, TISHREI, 1);
}

function monthLength(year, month) {
  if (month === IYAR || month === TAMMUZ || month === ELUL || month === TEVET || month === ADAR2) {
    return 29;
  }
  if (month === ADAR && !isLeapYear(year)) return 29;
  if (month === HESHVAN && yearDays(year) % 10 !== 5) return 29;
  if (month === KISLEV && yearDays(year) % 10 === 3) return 29;
  return 30;
}

function hebrewToJd(year, month, day) {
  var months = yearMonths(year);
  var jd = HEBREW_EPOCH_JD + delay1(year) + delay2(year) + day + 1;
  var m;
  if (month < TISHREI) {
    for (m = TISHREI; m <= months; m++) jd += monthLength(year, m);
    for (m = NISAN; m < month; m++) jd += monthLength(year, m);
  } else {
    for (m = TISHREI; m < month; m++) jd += monthLength(year, m);
  }
  return Math.floor(jd) + 0.5;
}

function jdToHebrew(jd) {
  jd = Math.floor(jd) + 0.5;
  var count = Math.floor(((jd - HEBREW_EPOCH_JD) * 98496.0) / 35975351.0);
  var year = count - 1;
  for (var i = count; jd >= hebrewToJd(i, TISHREI, 1); i++) year++;
  var month = jd < hebrewToJd(year, NISAN, 1) ? TISHREI : NISAN;
  while (jd > hebrewToJd(year, month, monthLength(year, month))) month++;
  var day = Math.floor(jd - hebrewToJd(year, month, 1)) + 1;
  return { year: year, month: month, day: day };
}

function gregorianToJd(year, month, day) {
  var leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  var adjust = month <= 2 ? 0 : (leap ? -1 : -2);
  return GREGORIAN_EPOCH_JD - 1 +
    365 * (year - 1) +
    Math.floor((year - 1) / 4) -
    Math.floor((year - 1) / 100) +
    Math.floor((year - 1) / 400) +
    Math.floor((367 * month - 362) / 12 + adjust + day);
}

/** 0 = Sunday .. 6 = Saturday. */
function jdWeekday(jd) {
  return Math.floor(jd + 1.5) % 7;
}

// ---------------------------------------------------------------- names

var MONTHS = {
  latin: ['', 'Nisan', 'Iyar', 'Sivan', 'Tammuz', 'Av', 'Elul',
    'Tishrei', 'Heshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar', 'Adar 2'],
  hebrew: ['', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול',
    'תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אדר ב'],
};
var ADAR1 = { latin: 'Adar 1', hebrew: 'אדר א' };

function monthName(year, month, script) {
  if (month === ADAR && isLeapYear(year)) return ADAR1[script];
  return MONTHS[script][month] || '';
}

// Hebrew numerals. The geresh and gershayim are written as ASCII ' and ", which watch fonts
// are far likelier to carry than U+05F3 and U+05F4.
var ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
var TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
var HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];

function gematria(n) {
  n = n % 1000;
  var letters = '';
  var hundreds = Math.floor(n / 100);
  while (hundreds > 4) { letters += 'ת'; hundreds -= 4; }
  letters += HUNDREDS[hundreds];
  var rest = n % 100;
  if (rest === 15) letters += 'טו';
  else if (rest === 16) letters += 'טז';
  else letters += TENS[Math.floor(rest / 10)] + ONES[rest % 10];
  if (letters.length === 1) return letters + "'";
  return letters.slice(0, -1) + '"' + letters.slice(-1);
}

function dayText(h, script) {
  return script === 'hebrew' ? gematria(h.day) : String(h.day);
}

function yearText(h, script) {
  return script === 'hebrew' ? gematria(h.year) : String(h.year);
}

// ---------------------------------------------------------------- holidays

// The yom tov dates; `second` marks the ones kept only with second days. Rosh Hashana is two
// days either way.
var YOM_TOV = [
  { month: TISHREI, day: 1 }, { month: TISHREI, day: 2 }, { month: TISHREI, day: 10 },
  { month: TISHREI, day: 15 }, { month: TISHREI, day: 16, second: true },
  { month: TISHREI, day: 22 }, { month: TISHREI, day: 23, second: true },
  { month: NISAN, day: 15 }, { month: NISAN, day: 16, second: true },
  { month: NISAN, day: 21 }, { month: NISAN, day: 22, second: true },
  { month: SIVAN, day: 6 }, { month: SIVAN, day: 7, second: true },
];

function isYomTov(h, secondDays) {
  return YOM_TOV.some(function (y) {
    return y.month === h.month && y.day === h.day && (secondDays || !y.second);
  });
}

var NAMES = {
  erevRoshHashana: ['Erev Rosh Hashana', 'ערב ראש השנה'],
  roshHashana1: ['Rosh Hashana 1', "ראש השנה א'"],
  roshHashana2: ['Rosh Hashana 2', "ראש השנה ב'"],
  gedaliah: ['Tzom Gedaliah', 'צום גדליה'],
  erevYomKippur: ['Erev Yom Kippur', 'ערב יום כפור'],
  yomKippur: ['Yom Kippur', 'יום כפור'],
  erevSukkot: ['Erev Sukkot', 'ערב סוכות'],
  sukkot1: ['Sukkot 1', "סוכות א'"],
  sukkot2: ['Sukkot 2', "סוכות ב'"],
  cholHamoedSukkot: ['Chol HaMoed Sukkot', 'חול המועד סוכות'],
  hoshanaRabbah: ['Hoshana Rabbah', 'הושענא רבה'],
  shminiAtzeret: ['Shmini Atzeret', 'שמיני עצרת'],
  simchatTorah: ['Simchat Torah', 'שמחת תורה'],
  chanukah: ['Chanukah', 'חנוכה'],
  tevet10: ["Asara B'Tevet", 'עשרה בטבת'],
  tuBishvat: ['Tu BiShvat', 'ט"ו בשבט'],
  purimKatan: ['Purim Katan', 'פורים קטן'],
  esther: ["Ta'anit Esther", 'תענית אסתר'],
  purim: ['Purim', 'פורים'],
  shushanPurim: ['Shushan Purim', 'שושן פורים'],
  erevPesach: ['Erev Pesach', 'ערב פסח'],
  pesach1: ['Pesach 1', "פסח א'"],
  pesach2: ['Pesach 2', "פסח ב'"],
  cholHamoedPesach: ['Chol HaMoed Pesach', 'חול המועד פסח'],
  pesach7: ['Pesach 7', "פסח ז'"],
  pesach8: ['Pesach 8', "פסח ח'"],
  lagBaomer: ['Lag BaOmer', 'ל"ג בעומר'],
  erevShavuot: ['Erev Shavuot', 'ערב שבועות'],
  shavuot1: ['Shavuot 1', "שבועות א'"],
  shavuot2: ['Shavuot 2', "שבועות ב'"],
  tammuz17: ["Shiva Asar B'Tammuz", 'י"ז בתמוז'],
  tishaBav: ["Tisha B'Av", 'תשעה באב'],
  roshChodesh: ['Rosh Chodesh', 'ראש חודש'],
};

/** A fast moved off Shabbat: `day` of `month`, or `moved` when that day is Saturday. */
function fastDay(h, jd, month, day, moved) {
  if (h.month !== month) return false;
  var onShabbat = jdWeekday(hebrewToJd(h.year, month, day)) === 6;
  return h.day === (onShabbat ? moved : day);
}

/**
 * The holidays on Hebrew date h (whose JD is jd), as keys into NAMES, with a number for
 * Chanukah's candle and the month for Rosh Chodesh.
 */
function holidays(h, jd, secondDays) {
  var out = [];
  var m = h.month, d = h.day;
  var leap = isLeapYear(h.year);
  // Purim and its fast fall in Adar 2 in a leap year.
  var purimMonth = leap ? ADAR2 : ADAR;

  if (m === ELUL && d === 29) out.push({ key: 'erevRoshHashana' });
  if (m === TISHREI) {
    if (d === 1) out.push({ key: 'roshHashana1' });
    if (d === 2) out.push({ key: 'roshHashana2' });
    if (d === 9) out.push({ key: 'erevYomKippur' });
    if (d === 10) out.push({ key: 'yomKippur' });
    if (d === 14) out.push({ key: 'erevSukkot' });
    if (d === 15) out.push({ key: 'sukkot1' });
    if (d === 16) out.push({ key: secondDays ? 'sukkot2' : 'cholHamoedSukkot' });
    if (d >= 17 && d <= 20) out.push({ key: 'cholHamoedSukkot' });
    if (d === 21) out.push({ key: 'hoshanaRabbah' });
    if (d === 22) {
      out.push({ key: 'shminiAtzeret' });
      if (!secondDays) out.push({ key: 'simchatTorah' });
    }
    if (d === 23 && secondDays) out.push({ key: 'simchatTorah' });
  }
  if (fastDay(h, jd, TISHREI, 3, 4)) out.push({ key: 'gedaliah' });

  var candle = jd - hebrewToJd(h.year, KISLEV, 25) + 1;
  if (candle < 1) candle = jd - hebrewToJd(h.year - 1, KISLEV, 25) + 1;
  if (candle >= 1 && candle <= 8) out.push({ key: 'chanukah', candle: candle });

  if (m === TEVET && d === 10) out.push({ key: 'tevet10' });
  if (m === SHEVAT && d === 15) out.push({ key: 'tuBishvat' });
  if (leap && m === ADAR && d === 14) out.push({ key: 'purimKatan' });
  // Ta'anit Esther on Shabbat moves back to Thursday, not forward.
  if (fastDay(h, jd, purimMonth, 13, 11)) out.push({ key: 'esther' });
  if (m === purimMonth && d === 14) out.push({ key: 'purim' });
  if (m === purimMonth && d === 15) out.push({ key: 'shushanPurim' });

  if (m === NISAN) {
    if (d === 14) out.push({ key: 'erevPesach' });
    if (d === 15) out.push({ key: 'pesach1' });
    if (d === 16) out.push({ key: secondDays ? 'pesach2' : 'cholHamoedPesach' });
    if (d >= 17 && d <= 20) out.push({ key: 'cholHamoedPesach' });
    if (d === 21) out.push({ key: 'pesach7' });
    if (d === 22 && secondDays) out.push({ key: 'pesach8' });
  }
  if (m === IYAR && d === 18) out.push({ key: 'lagBaomer' });
  if (m === SIVAN) {
    if (d === 5) out.push({ key: 'erevShavuot' });
    if (d === 6) out.push({ key: 'shavuot1' });
    if (d === 7 && secondDays) out.push({ key: 'shavuot2' });
  }
  if (fastDay(h, jd, TAMMUZ, 17, 18)) out.push({ key: 'tammuz17' });
  if (fastDay(h, jd, AV, 9, 10)) out.push({ key: 'tishaBav' });

  if (isRoshChodesh(h)) {
    var next = d === 30 ? jdToHebrew(jd + 1) : h;
    out.push({ key: 'roshChodesh', year: next.year, month: next.month });
  }
  return out;
}

/** The 30th of a month, or the 1st of any month but Tishrei (which is Rosh Hashana). */
function isRoshChodesh(h) {
  return h.day === 30 || (h.day === 1 && h.month !== TISHREI);
}

function holidayText(entry, script) {
  var i = script === 'hebrew' ? 1 : 0;
  var name = NAMES[entry.key][i];
  if (entry.key === 'chanukah') {
    return name + ' ' + (script === 'hebrew' ? gematria(entry.candle) : entry.candle);
  }
  if (entry.key === 'roshChodesh') return name + ' ' + monthName(entry.year, entry.month, script);
  return name;
}

// ---------------------------------------------------------------- sun
//
// NOAA's algorithm, for the center of the disk against the geometric horizon. Within about 20s
// of PyEphem; test/ checks it against the same fixtures the Shaot watchface uses.

var SUNRISE_SET_ANGLE = -0.833; // refraction 34' + semidiameter 16'
var TZEIT_ANGLE = -8.5;
var DEG = Math.PI / 180;

function julianCentury(ms) {
  return (ms / DAY_MS + 2440587.5 - 2451545.0) / 36525.0;
}

/** Declination (degrees) and equation of time (minutes) at Julian century T. */
function solarParams(T) {
  var L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360;
  var M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  var C = Math.sin(M * DEG) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * DEG) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * DEG) * 0.000289;
  var omega = 125.04 - 1934.136 * T;
  var appLong = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  var meanObliq = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  var obliq = meanObliq + 0.00256 * Math.cos(omega * DEG);
  var y = Math.pow(Math.tan((obliq / 2) * DEG), 2);
  return {
    decl: Math.asin(Math.sin(obliq * DEG) * Math.sin(appLong * DEG)) / DEG,
    eqTime: (4 / DEG) * (y * Math.sin(2 * L0 * DEG) - 2 * e * Math.sin(M * DEG) +
      4 * e * y * Math.sin(M * DEG) * Math.cos(2 * L0 * DEG) -
      0.5 * y * y * Math.sin(4 * L0 * DEG) - 1.25 * e * e * Math.sin(2 * M * DEG)),
  };
}

/** Hour angle (degrees) at which the sun's center reaches angle, or null if it never does. */
function hourAngle(lat, decl, angle) {
  var cosHa = (Math.cos((90 - angle) * DEG) - Math.sin(lat * DEG) * Math.sin(decl * DEG)) /
    (Math.cos(lat * DEG) * Math.cos(decl * DEG));
  if (cosHa < -1 || cosHa > 1) return null;
  return Math.acos(cosHa) / DEG;
}

/** The rising or setting on the UTC day containing dayMs (epoch ms), or null. */
function eventOnUtcDay(dayMs, lat, lon, angle, rising) {
  var dayStart = Math.floor(dayMs / DAY_MS) * DAY_MS;
  var guess = dayStart + DAY_MS / 2;
  for (var i = 0; i < 3; i++) {
    var p = solarParams(julianCentury(guess));
    var ha = hourAngle(lat, p.decl, angle);
    if (ha === null) return null;
    var noonMin = 720 - 4 * lon - p.eqTime;
    guess = dayStart + (rising ? noonMin - 4 * ha : noonMin + 4 * ha) * 60000;
  }
  return Math.round(guess);
}

/** Every rising and setting at angle over the UTC days from fromMs to toMs, ascending. */
function solarEvents(fromMs, toMs, lat, lon, angle) {
  var out = [];
  for (var day = Math.floor(fromMs / DAY_MS) - 1; day <= Math.floor(toMs / DAY_MS) + 1; day++) {
    [true, false].forEach(function (rising) {
      var t = eventOnUtcDay(day * DAY_MS, lat, lon, angle, rising);
      if (t !== null) out.push({ t: t, rising: rising });
    });
  }
  return out.sort(function (a, b) { return a.t - b.t; });
}

/** Minutes east of UTC at solar noon, to the nearest hour: a time zone for a place with none. */
function solarOffset(lon, ms) {
  var noonMin = 720 - 4 * lon - solarParams(julianCentury(ms)).eqTime;
  var offset = Math.round((720 - noonMin) / 60) * 60;
  return offset > 14 * 60 ? offset - 24 * 60 : offset < -12 * 60 ? offset + 24 * 60 : offset;
}

// ---------------------------------------------------------------- one place, one moment

/**
 * A place: { lat, lon, offsetAt(ms) -> minutes east of UTC }. The phone's own zone for where it
 * is; elsewhere solarOffset, which is an hour out where the clocks are far from the sun or in
 * summer time.
 */
function localMidnight(ms, place) {
  var off = place.offsetAt(ms) * 60000;
  var local = ms + off;
  var midnight = local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - off;
  // Across a clock change the offset at midnight differs from the one at ms.
  var off2 = place.offsetAt(midnight) * 60000;
  if (off2 !== off) {
    local = ms + off2;
    midnight = local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - off2;
  }
  return midnight;
}

/** The civil {year, month, day, jd} of the local day starting at midnight. */
function civilDate(midnight, place) {
  var d = new Date(midnight + place.offsetAt(midnight + DAY_MS / 2) * 60000 + DAY_MS / 2);
  var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return { year: y, month: m, day: day, jd: gregorianToJd(y, m, day) };
}

/**
 * Sunrise, sunset and tzeit (epoch ms, or null) for the local day starting at midnight. Sunrise
 * and sunset fall within that day; tzeit is the first after that day's sunset.
 */
function sunDay(midnight, place) {
  var end = midnight + DAY_MS;
  var sun = solarEvents(midnight, end, place.lat, place.lon, SUNRISE_SET_ANGLE);
  function first(list, rising, from, to) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].rising === rising && list[i].t >= from && list[i].t < to) return list[i].t;
    }
    return null;
  }
  var sunrise = first(sun, true, midnight, end);
  var sunset = first(sun, false, midnight, end);
  var tzeit = null;
  if (sunset !== null) {
    var dusk = solarEvents(sunset, sunset + DAY_MS, place.lat, place.lon, TZEIT_ANGLE);
    // Where it never gets that dark, the next "tzeit" is a later day's, so it doesn't count.
    tzeit = first(dusk, false, sunset, sunset + DAY_MS / 2);
  }
  return { sunrise: sunrise, sunset: sunset, tzeit: tzeit };
}

/**
 * Everything served for one place at nowMs. The Hebrew date rolls over at the place's sunset;
 * on a day with no sunset (polar day or night), at midnight.
 */
function compute(nowMs, place, settings) {
  var midnight = localMidnight(nowMs, place);
  var civil = civilDate(midnight, place);
  var days = [];
  for (var i = 0; i < DAYS + 1; i++) {
    var dayStart = localMidnight(midnight + i * DAY_MS + DAY_MS / 2, place);
    days.push({ midnight: dayStart, sun: sunDay(dayStart, place) });
  }
  var today = days[0].sun;
  var afterSunset = today.sunset !== null && nowMs >= today.sunset;
  var jd = civil.jd + (afterSunset ? 1 : 0);
  var h = jdToHebrew(jd);
  var daytime = jdToHebrew(civil.jd);
  var evening = jdToHebrew(civil.jd + 1);
  var weekday = jdWeekday(civil.jd);

  var events = [];
  days.slice(0, 2).forEach(function (day) {
    [['sunrise', day.sun.sunrise], ['sunset', day.sun.sunset], ['tzeit', day.sun.tzeit]]
      .forEach(function (pair) { if (pair[1] !== null) events.push({ name: pair[0], t: pair[1] }); });
  });
  events.sort(function (a, b) { return a.t - b.t; });
  var next = events.filter(function (e) { return e.t > nowMs; })[0] || null;
  // The next of each kind, searching the whole week, since near the poles one can be days off.
  var nextOf = {};
  ['sunrise', 'sunset', 'tzeit'].forEach(function (name) {
    nextOf[name] = null;
    for (var i = 0; i < days.length && nextOf[name] === null; i++) {
      if (days[i].sun[name] !== null && days[i].sun[name] > nowMs) nextOf[name] = days[i].sun[name];
    }
  });

  return {
    hebrew: h,
    jd: jd,
    holidays: holidays(h, jd, settings.secondDays),
    roshChodesh: isRoshChodesh(h),
    // Civil-day questions: is today (by daylight) Shabbat or yom tov, and does one begin tonight?
    today: weekday === 6 || isYomTov(daytime, settings.secondDays),
    tonight: weekday === 5 || isYomTov(evening, settings.secondDays),
    midnight: midnight,
    days: days.slice(0, DAYS),
    sun: today,
    next: next,
    nextOf: nextOf,
    // When any of the above next changes: the next sun event, or midnight.
    validUntil: Math.min(next ? next.t : Infinity, days[1].midnight),
  };
}

// ---------------------------------------------------------------- text

var EVENT_NAMES = {
  sunrise: { latin: 'Sunrise', hebrew: 'זריחה' },
  sunset: { latin: 'Sunset', hebrew: 'שקיעה' },
  tzeit: { latin: 'Tzeit', hebrew: 'צאת הכוכבים' },
};

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Local wall-clock time at the place, in the user's 12h or 24h clock. */
function clockText(ms, place, clock) {
  var d = new Date(ms + place.offsetAt(ms) * 60000);
  var h = d.getUTCHours(), m = d.getUTCMinutes();
  if (clock === '24h') return pad(h) + ':' + pad(m);
  return ((h + 11) % 12 + 1) + ':' + pad(m) + (h < 12 ? ' AM' : ' PM');
}

function script(settings) {
  return settings.hebrewScript ? 'hebrew' : 'latin';
}

function dateProperties(c, settings) {
  var s = script(settings);
  var h = c.hebrew;
  var month = monthName(h.year, h.month, s);
  var props = {
    date: {
      shortText: { text: dayText(h, s) + ' ' + month },
      longText: { text: dayText(h, s) + ' ' + month + ' ' + yearText(h, s) },
    },
    day: { numericValue: { value: h.day, min: 1, max: 30 } },
    month: { numericValue: { value: h.month, min: 1, max: 13 } },
    month_name: { shortText: { text: month } },
    year: { numericValue: { value: h.year } },
    rosh_chodesh: { boolean: { value: c.roshChodesh } },
    shabbat_or_yom_tov_today: { boolean: { value: c.today } },
    shabbat_or_yom_tov_tonight: { boolean: { value: c.tonight } },
  };
  if (c.holidays.length) {
    var names = c.holidays.map(function (entry) { return holidayText(entry, s); });
    props.holiday = { shortText: { text: names[0] }, longText: { text: names.join(', ') } };
  }
  return props;
}

function timeProperties(c, place, settings, clock) {
  function stamp(ms) { return ms === null ? null : Math.round(ms / 1000); }
  function series(name) {
    return {
      series: {
        start: Math.round(c.midnight / 1000),
        stepSec: 86400,
        timestamp: { values: c.days.map(function (d) { return stamp(d.sun[name]); }) },
      },
    };
  }
  var props = {
    utc_offset: { numericValue: { value: place.offsetAt(Date.now()), unit: 'min' } },
    daily_sunrise: series('sunrise'),
    daily_sunset: series('sunset'),
    daily_tzeit: series('tzeit'),
  };
  ['sunrise', 'sunset', 'tzeit'].forEach(function (name) {
    if (c.sun[name] !== null) props[name] = { timestamp: { value: stamp(c.sun[name]) } };
    if (c.nextOf[name] !== null) props['next_' + name] = { timestamp: { value: stamp(c.nextOf[name]) } };
  });
  if (c.next) {
    var label = EVENT_NAMES[c.next.name][script(settings)];
    var time = clockText(c.next.t, place, clock);
    props.next = { shortText: { text: label + ' ' + time }, longText: { text: label + ' ' + time } };
    props.next_time = { timestamp: { value: stamp(c.next.t) } };
  }
  return props;
}

// ---------------------------------------------------------------- exports for tests

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isLeapYear: isLeapYear, monthLength: monthLength, hebrewToJd: hebrewToJd,
    jdToHebrew: jdToHebrew, gregorianToJd: gregorianToJd, jdWeekday: jdWeekday,
    gematria: gematria, holidays: holidays, holidayText: holidayText, isYomTov: isYomTov,
    solarEvents: solarEvents, solarOffset: solarOffset, sunDay: sunDay, compute: compute,
    dateProperties: dateProperties, timeProperties: timeProperties, clockText: clockText,
    SUNRISE_SET_ANGLE: SUNRISE_SET_ANGLE, TZEIT_ANGLE: TZEIT_ANGLE,
  };
}

// ---------------------------------------------------------------- Pebble
//
// Places follow the weather: one instance per weather location the user set up in the Pebble
// app, under the same instanceIds, with the phone's position for the current-location entry.

if (typeof Pebble !== 'undefined') {
  var LOCATIONS = { category: 'preferences', item: 'weather_location' };
  var UNITS = { category: 'preferences', item: 'units' };
  var SETTINGS_KEY = 'settings';
  var DEFAULTS = { secondDays: true, hebrewScript: false };

  var loadSettings = function () {
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { stored = {}; }
    return {
      secondDays: typeof stored.secondDays === 'boolean' ? stored.secondDays : DEFAULTS.secondDays,
      hebrewScript: typeof stored.hebrewScript === 'boolean' ? stored.hebrewScript : DEFAULTS.hebrewScript,
    };
  };

  var currentPosition = function () {
    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(
        function (position) { resolve(position.coords); },
        function (error) { reject(error); },
        { maximumAge: 30 * 60 * 1000, timeout: 20 * 1000 }
      );
    });
  };

  var phoneOffset = function (ms) { return -new Date(ms).getTimezoneOffset(); };

  var place = function (id, name, coords, current) {
    var lat = coords.latitude, lon = coords.longitude;
    return {
      id: id, name: name, lat: lat, lon: lon,
      offsetAt: current ? phoneOffset : function (ms) { return solarOffset(lon, ms); },
    };
  };

  var places = async function () {
    var locations;
    try {
      locations = (await Pebble.readSource(LOCATIONS)).instances;
    } catch (e) {
      console.log('No weather locations (' + ((e && e.code) || e) + '); using the current position');
    }
    if (!locations || !locations.length) {
      return [place('current', 'Current location', await currentPosition(), true)];
    }
    var found = await Promise.all(locations.map(async function (location) {
      var p = location.properties;
      var current = !!(p.current && p.current.boolean && p.current.boolean.value);
      var coords = p.latitude && {
        latitude: p.latitude.numericValue.value, longitude: p.longitude.numericValue.value,
      };
      if (current || !coords) {
        try { coords = await currentPosition(); } catch (e) { return null; }
      }
      return place(location.instanceId, p.name.shortText.text, coords, current);
    }));
    return found.filter(function (p) { return p; });
  };

  var clock = async function () {
    try {
      return (await Pebble.readSource(UNITS)).instances[0].properties.clock.shortText.text;
    } catch (e) {
      return '12h';
    }
  };

  Pebble.registerSourceHandler(async function (request, respond) {
    // So this runs again when the user changes their locations or units.
    Pebble.subscribeSource(LOCATIONS);
    Pebble.subscribeSource(UNITS);
    var where;
    try {
      where = await places();
    } catch (e) {
      console.error('No location: ' + ((e && e.message) || e));
      respond.error('PERMISSION_DENIED', (e && e.message) || 'no location');
      return;
    }
    if (!where.length) {
      respond.error('PLUGIN_UNAVAILABLE', 'No location.');
      return;
    }
    var settings = loadSettings();
    var userClock = await clock();
    var now = Date.now();
    var validUntil = Infinity;
    var instances = where.map(function (p) {
      var c = compute(now, p, settings);
      validUntil = Math.min(validUntil, c.validUntil);
      var properties = request.item === 'times'
        ? timeProperties(c, p, settings, userClock)
        : dateProperties(c, settings);
      properties.name = { shortText: { text: p.name } };
      return { instanceId: p.id, properties: properties };
    });
    respond.data({ validUntilMs: validUntil, instances: instances });
  });

  Pebble.registerConfigHandler(function (message, respond) {
    if (message && message.type === 'set') {
      var next = loadSettings();
      if (typeof message.secondDays === 'boolean') next.secondDays = message.secondDays;
      if (typeof message.hebrewScript === 'boolean') next.hebrewScript = message.hebrewScript;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      Pebble.refreshSources(['hebrew_calendar/date', 'hebrew_calendar/times']);
      respond(next);
    } else {
      respond(loadSettings());
    }
  });
}
