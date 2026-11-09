# Hebrew Calendar

A [Pebble plugin](https://developer.repebble.com/guides/plugins/) that serves the Hebrew date, holidays, and sunrise, sunset, and nightfall (tzeit) to any watchface, watchapp, or complication that asks for them.

It runs on the phone, inside the Pebble app, and computes everything there. It fetches nothing and sends nothing anywhere, so the only permission it asks for is Location.

Plugins are a preview feature of the Pebble app (1.18 and later). Turn them on under **Settings → Plugins**.

## Places

There's one instance per weather location the user has set up in the Pebble app, under the same `instanceId`s as the built-in `weather/location` source. The current-location entry uses the phone's position. If the plugin can't read the weather locations, it serves a single `current` instance for where the phone is.

Each place keeps its own time: the phone's time zone for the current location, and elsewhere an estimate from solar noon, rounded to the hour. That estimate can be an hour off where clocks are far from the sun, or during summer time. Near midnight, that can put such a place on the wrong date.

## When the date changes

The Hebrew date changes at **sunset** at each place. On a day when the sun doesn't set (polar day or night), it changes at local midnight instead.

## Sources

### `hebrew_calendar/date`

| Property | Shapes | |
|---|---|---|
| `name` | shortText | The place |
| `date` | shortText, longText | `3 Kislev` / `3 Kislev 5787`, or in Hebrew script |
| `day`, `month`, `year` | numericValue | Months count from Nisan (1) to Adar 2 (13); Tishrei is 7 |
| `month_name` | shortText | |
| `holiday` | shortText, longText | Absent on an ordinary day. A date can have two, such as `Chanukah 6, Rosh Chodesh Tevet`: shortText gives the first, longText gives both |
| `rosh_chodesh` | boolean | |
| `shabbat_or_yom_tov_today` | boolean | Whether today's daytime, by the civil calendar, is Shabbat or yom tov |
| `shabbat_or_yom_tov_tonight` | boolean | Whether one begins or continues at this evening's sunset |

The holidays are the yom tovim, with their erev days and Chol HaMoed, plus Chanukah (with the candle count), the fasts (moved off Shabbat as the calendar requires), Tu BiShvat, Purim Katan, Purim, Shushan Purim, Lag BaOmer, and Rosh Chodesh.

### `hebrew_calendar/times`

| Property | Shapes | |
|---|---|---|
| `name` | shortText | The place |
| `sunrise`, `sunset`, `tzeit` | timestamp | Today's, local to the place. Absent when there isn't one |
| `next_sun` | shortText, longText | The next sunrise or sunset, e.g. `Sunset 4:47 PM`, in the user's 12h or 24h clock |
| `next_sun_time` | timestamp | When `next_sun` happens |
| `next_sun_tzeit` | shortText, longText | The next sunrise, sunset, or tzeit, written the same way |
| `next_sun_tzeit_time` | timestamp | When `next_sun_tzeit` happens |
| `next_sunrise`, `next_sunset`, `next_tzeit` | timestamp | The next of each, today's or a later day's |
| `utc_offset` | numericValue | Minutes east of UTC, as in `weather/location` |
| `daily_sunrise`, `daily_sunset`, `daily_tzeit` | series.timestamp | Seven days from the place's local midnight; `null` where there's none |

Each `next_*` property covers only the times its name lists. If a later version adds more times, they get new properties, and these keep their meaning.

Sunrise and sunset are when the sun's upper edge crosses the horizon, allowing for refraction. Tzeit is when the sun's center is 8.5° below the horizon. These times agree with PyEphem to within about 20 seconds.

Both sources require the caller to hold the Location permission, as `weather/location` does, because the times and place names reveal where the user is.

## Settings

- **Second days of festivals** (on by default) keeps the second day of Sukkot, Shmini Atzeret/Simchat Torah, Pesach, and Shavuot.
- **Hebrew script** (off by default) writes dates, month names, holidays, and the `next_sun` and `next_sun_tzeit` labels in Hebrew. In Hebrew script, the day and year are Hebrew numerals, like the ones for 29 and 5787, whose marks (geresh and gershayim) are written as ASCII `'` and `"`.

  Watches have no Hebrew letters in their system fonts out of the box. To use Hebrew script, install the **English + עברית** font pack ("English + Hebrew glyphs"): in the Pebble app, tap your watch, then **Language → Add language pack**, and choose it under **Font packs**. Some watchfaces bring their own Hebrew font and don't need it.

## Building and testing

You need pebble-tool 5.1 or later and SDK 4.44 or later.

```
pebble build          # build/pebble-hebrew-calendar.pbw
npm test              # node test/test.js && node test/handler.js
```

`test/test.js` checks the date conversion against [convertdate](https://pypi.org/project/convertdate/) and the sun times against [PyEphem](https://rhodesmill.org/pyephem/), using fixtures made by the scripts in `test/gen/`. It also tests the holiday rules and the sunset rollover. `test/handler.js` runs the plugin's handlers against a fake Pebble API.

The calendar and solar math are ported from the [Shaot Zemaniot](https://github.com/rosenbergj/pebble-shaot-zemaniot) watchface, so the two agree.

## License

MIT
