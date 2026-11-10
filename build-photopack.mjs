// Landfall photo pack builder. Runs on GitHub Actions (Node 20).
// For every country it finds geotagged Wikimedia Commons photos that really lie
// inside the country's border, shrinks them, and saves them with credits.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { geoContains, geoBounds } from 'd3-geo';
import { feature } from 'topojson-client';

const TARGET = +process.env.PER_COUNTRY || 12;   // photos wanted per country
const MAX_POINTS = 70;                            // search spots tried per country
const WIDTH = 720, QUALITY = 65;
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = `LandfallPhotoPack/1.0 (https://github.com/${process.env.GITHUB_REPOSITORY || 'unknown'}; hobby geography game)`;
const BAD = /\b(map|maps|flag|flags|logo|coat of arms|locator|diagram|chart|stamp|banknote|coin|poster|plaque|screenshot|schematic|document|certificate|portrait|selfie|interior|emblem|seal|label|menu|plan|svg|panel)\b/i;

// Space and satellite pictures, and anything that is not a normal ground-level photo, are never wanted.
const BAD_TITLE = /(\bISS\d|view of earth|astronaut|satellite|landsat|sentinel|modis|\bnasa\b|space station|from space|orbit|\bsvg\b|\.png|\.gif|\.tif|\.pdf|\bmap\b|\bmaps\b|panorama of the earth)/i;
const BAD_ARTIST = /(NASA|Earth Science and Remote Sensing|astronaut|ESA\b|European Space Agency|USGS|Copernicus|Johnson Space)/i;
const isBadPhoto = (title, artist) => BAD_TITLE.test(title || '') || BAD_ARTIST.test(artist || '');

// Name|ISO2|lat|lng|area km2|aliases
const RAW = `Afghanistan|AF|33.9|67.7|652230|
Albania|AL|41.1|20.0|28748|
Algeria|DZ|28.0|2.6|2381741|
Andorra|AD|42.5|1.6|468|
Angola|AO|-12.3|17.5|1246700|
Antigua and Barbuda|AG|17.1|-61.8|442|Antigua
Argentina|AR|-35.0|-65.0|2780400|
Armenia|AM|40.2|45.0|29743|
Australia|AU|-25.0|134.0|7692024|
Austria|AT|47.6|14.1|83871|
Azerbaijan|AZ|40.3|47.7|86600|
Bahamas|BS|24.3|-76.0|13943|The Bahamas
Bahrain|BH|26.0|50.55|765|
Bangladesh|BD|23.8|90.3|147570|
Barbados|BB|13.2|-59.55|430|
Belarus|BY|53.5|28.0|207600|
Belgium|BE|50.6|4.7|30528|
Belize|BZ|17.2|-88.7|22966|
Benin|BJ|9.6|2.3|112622|
Bhutan|BT|27.4|90.4|38394|
Bolivia|BO|-16.7|-64.7|1098581|
Bosnia and Herzegovina|BA|44.2|17.8|51197|Bosnia
Botswana|BW|-22.2|23.8|581730|
Brazil|BR|-10.8|-52.9|8515767|
Brunei|BN|4.5|114.7|5765|
Bulgaria|BG|42.7|25.5|110879|
Burkina Faso|BF|12.3|-1.7|272967|
Burundi|BI|-3.4|29.9|27834|
Cabo Verde|CV|16.0|-24.0|4033|Cape Verde
Cambodia|KH|12.7|104.9|181035|
Cameroon|CM|5.7|12.7|475442|
Canada|CA|56.1|-106.3|9984670|
Central African Republic|CF|6.6|20.9|622984|
Chad|TD|15.5|18.7|1284000|
Chile|CL|-30.0|-71.0|756102|
China|CN|35.0|103.0|9596961|
Colombia|CO|4.6|-74.1|1141748|
Comoros|KM|-11.9|43.3|1862|
Democratic Republic of the Congo|CD|-2.9|23.7|2344858|DR Congo;DRC;Congo-Kinshasa
Republic of the Congo|CG|-0.7|15.3|342000|Congo;Congo-Brazzaville
Costa Rica|CR|9.9|-84.2|51100|
Côte d'Ivoire|CI|7.6|-5.5|322463|Ivory Coast
Croatia|HR|45.1|15.2|56594|
Cuba|CU|21.5|-79.5|109884|
Cyprus|CY|35.0|33.2|9251|
Czechia|CZ|49.8|15.5|78867|Czech Republic
Denmark|DK|56.0|10.0|42924|
Djibouti|DJ|11.8|42.6|23200|
Dominica|DM|15.4|-61.35|751|
Dominican Republic|DO|18.9|-70.5|48671|
Ecuador|EC|-1.4|-78.4|283561|
Egypt|EG|26.5|30.0|1002450|
El Salvador|SV|13.7|-88.9|21041|
Equatorial Guinea|GQ|1.6|10.5|28051|
Eritrea|ER|15.4|38.9|117600|
Estonia|EE|58.7|25.5|45228|
Eswatini|SZ|-26.5|31.5|17364|Swaziland
Ethiopia|ET|9.0|39.6|1104300|
Fiji|FJ|-17.8|178.0|18272|
Finland|FI|64.0|26.0|338455|
France|FR|46.6|2.5|643801|
Gabon|GA|-0.8|11.6|267668|
Gambia|GM|13.45|-15.4|11295|The Gambia
Georgia|GE|42.3|43.4|69700|
Germany|DE|51.2|10.4|357022|
Ghana|GH|7.9|-1.0|238533|
Greece|GR|39.0|22.0|131957|
Grenada|GD|12.1|-61.7|344|
Guatemala|GT|15.7|-90.4|108889|
Guinea|GN|10.9|-10.9|245857|
Guinea-Bissau|GW|12.0|-15.0|36125|
Guyana|GY|4.8|-58.9|214969|
Haiti|HT|19.0|-72.7|27750|
Honduras|HN|14.8|-86.6|112492|
Hungary|HU|47.2|19.5|93028|
Iceland|IS|64.9|-18.6|103000|
India|IN|22.0|79.0|3287263|
Indonesia|ID|-2.5|118.0|1904569|
Iran|IR|32.4|53.7|1648195|
Iraq|IQ|33.2|43.7|438317|
Ireland|IE|53.4|-8.2|70273|
Israel|IL|31.4|35.0|22072|
Italy|IT|42.8|12.5|301340|
Jamaica|JM|18.1|-77.3|10991|
Japan|JP|36.5|138.0|377975|
Jordan|JO|31.2|36.8|89342|
Kazakhstan|KZ|48.0|67.0|2724900|
Kenya|KE|0.2|37.9|580367|
Kiribati|KI|1.9|-157.4|811|
Kosovo|XK|42.6|20.9|10887|
Kuwait|KW|29.3|47.5|17818|
Kyrgyzstan|KG|41.5|74.6|199951|
Laos|LA|19.0|102.5|236800|
Latvia|LV|56.9|24.9|64589|
Lebanon|LB|33.9|35.9|10452|
Lesotho|LS|-29.6|28.2|30355|
Liberia|LR|6.4|-9.4|111369|
Libya|LY|27.0|17.0|1759540|
Liechtenstein|LI|47.15|9.55|160|
Lithuania|LT|55.3|23.9|65300|
Luxembourg|LU|49.8|6.1|2586|
Madagascar|MG|-19.0|46.7|587041|
Malawi|MW|-13.25|34.3|118484|
Malaysia|MY|3.8|102.0|330803|
Maldives|MV|3.2|73.2|298|
Mali|ML|17.6|-4.0|1240192|
Malta|MT|35.9|14.4|316|
Marshall Islands|MH|7.1|171.2|181|
Mauritania|MR|20.3|-10.3|1030700|
Mauritius|MU|-20.3|57.6|2040|
Mexico|MX|23.6|-102.5|1964375|
Micronesia|FM|6.9|158.2|702|Federated States of Micronesia
Moldova|MD|47.2|28.5|33846|
Monaco|MC|43.74|7.42|2|
Mongolia|MN|46.9|103.8|1564116|
Montenegro|ME|42.8|19.3|13812|
Morocco|MA|31.8|-7.1|446550|
Mozambique|MZ|-18.7|35.5|801590|
Myanmar|MM|21.9|96.0|676578|Burma
Namibia|NA|-22.0|17.0|825615|
Nauru|NR|-0.53|166.93|21|
Nepal|NP|28.4|84.1|147181|
Netherlands|NL|52.1|5.3|41850|Holland
New Zealand|NZ|-41.0|173.0|268838|
Nicaragua|NI|12.9|-85.2|130373|
Niger|NE|17.6|8.1|1267000|
Nigeria|NG|9.1|8.7|923768|
North Korea|KP|40.3|127.5|120538|
North Macedonia|MK|41.6|21.7|25713|Macedonia
Norway|NO|64.5|11.5|385207|
Oman|OM|21.5|55.9|309500|
Pakistan|PK|30.4|69.3|881913|
Palau|PW|7.5|134.6|459|
Palestine|PS|31.9|35.2|6020|State of Palestine
Panama|PA|8.5|-80.1|75417|
Papua New Guinea|PG|-6.5|145.0|462840|
Paraguay|PY|-23.2|-58.4|406752|
Peru|PE|-9.2|-75.0|1285216|
Philippines|PH|12.9|122.0|300000|
Poland|PL|52.1|19.4|312696|
Portugal|PT|39.6|-8.0|92212|
Qatar|QA|25.3|51.2|11586|
Romania|RO|45.9|25.0|238397|
Russia|RU|61.5|99.0|17098246|
Rwanda|RW|-2.0|29.9|26338|
Saint Kitts and Nevis|KN|17.35|-62.75|261|
Saint Lucia|LC|13.9|-60.97|616|
Saint Vincent and the Grenadines|VC|13.2|-61.2|389|
Samoa|WS|-13.75|-172.1|2842|
San Marino|SM|43.94|12.46|61|
São Tomé and Príncipe|ST|0.2|6.6|964|Sao Tome and Principe
Saudi Arabia|SA|24.0|45.0|2149690|
Senegal|SN|14.5|-14.5|196722|
Serbia|RS|44.0|21.0|88361|
Seychelles|SC|-4.7|55.5|452|
Sierra Leone|SL|8.5|-11.8|71740|
Singapore|SG|1.35|103.8|734|
Slovakia|SK|48.7|19.5|49037|
Slovenia|SI|46.1|14.8|20273|
Solomon Islands|SB|-9.6|160.2|28896|
Somalia|SO|5.2|46.2|637657|
South Africa|ZA|-29.0|24.0|1221037|
South Korea|KR|36.5|127.9|100210|Korea
South Sudan|SS|7.3|30.0|619745|
Spain|ES|40.2|-3.7|505990|
Sri Lanka|LK|7.9|80.7|65610|
Sudan|SD|15.6|30.0|1861484|
Suriname|SR|4.0|-56.0|163820|
Sweden|SE|62.0|15.0|450295|
Switzerland|CH|46.8|8.2|41285|
Syria|SY|35.0|38.5|185180|
Taiwan|TW|23.7|121.0|36193|
Tajikistan|TJ|38.9|71.0|143100|
Tanzania|TZ|-6.4|34.9|947303|
Thailand|TH|15.1|101.0|513120|
Timor-Leste|TL|-8.8|125.9|14874|East Timor
Togo|TG|8.6|0.8|56785|
Tonga|TO|-20.4|-174.8|747|
Trinidad and Tobago|TT|10.7|-61.2|5130|
Tunisia|TN|34.0|9.5|163610|
Turkey|TR|39.0|35.2|783562|Türkiye;Turkiye
Turkmenistan|TM|39.0|59.6|488100|
Tuvalu|TV|-8.5|179.2|26|
Uganda|UG|1.3|32.4|241550|
Ukraine|UA|49.0|31.4|603550|
United Arab Emirates|AE|24.0|54.0|83600|UAE
United Kingdom|GB|54.0|-2.5|242495|UK;Britain;Great Britain;England
United States|US|39.8|-98.6|9833517|USA;America;United States of America
Uruguay|UY|-32.8|-56.0|176215|
Uzbekistan|UZ|41.4|64.6|447400|
Vanuatu|VU|-16.0|167.0|12189|
Vatican City|VA|41.9|12.45|0.44|Vatican;Holy See
Venezuela|VE|7.1|-66.2|916445|
Vietnam|VN|16.2|107.8|331212|Viet Nam
Yemen|YE|15.9|47.6|527968|
Zambia|ZM|-13.5|27.8|752618|
Zimbabwe|ZW|-19.0|29.9|390757|
Greenland|GL|72.0|-40.0|2166086|
Puerto Rico|PR|18.2|-66.5|9104|
Hong Kong|HK|22.35|114.15|1114|
Macao|MO|22.2|113.55|33|Macau
Faroe Islands|FO|62.0|-6.8|1393|Faroes
Gibraltar|GI|36.14|-5.35|6.8|
Isle of Man|IM|54.2|-4.55|572|
Jersey|JE|49.2|-2.13|118|
Guernsey|GG|49.45|-2.58|78|
Åland Islands|AX|60.2|20.0|1580|Aland Islands;Aland
Svalbard|SJ|78.5|16.0|61022|Svalbard and Jan Mayen
New Caledonia|NC|-21.3|165.5|18575|
French Polynesia|PF|-17.7|-149.4|4167|
Wallis and Futuna|WF|-13.3|-176.2|142|
Guam|GU|13.45|144.8|544|
Northern Mariana Islands|MP|15.2|145.75|464|
American Samoa|AS|-14.3|-170.7|199|
Cook Islands|CK|-21.2|-159.8|236|
Niue|NU|-19.05|-169.9|260|
Norfolk Island|NF|-29.04|167.95|36|
Pitcairn Islands|PN|-25.07|-130.1|47|Pitcairn
Christmas Island|CX|-10.5|105.65|135|
Cocos Islands|CC|-12.15|96.85|14|Cocos (Keeling) Islands;Keeling Islands
Bermuda|BM|32.3|-64.75|54|
Cayman Islands|KY|19.3|-81.25|264|
Turks and Caicos Islands|TC|21.8|-71.8|948|Turks and Caicos
British Virgin Islands|VG|18.4|-64.6|151|
US Virgin Islands|VI|18.35|-64.9|347|United States Virgin Islands
Anguilla|AI|18.2|-63.05|91|
Montserrat|MS|16.75|-62.2|102|
Aruba|AW|12.5|-69.97|180|
Curaçao|CW|12.17|-69.0|444|Curacao
Sint Maarten|SX|18.04|-63.07|34|
Saint Martin|MF|18.08|-63.05|53|
Saint Barthélemy|BL|17.9|-62.85|21|Saint Barthelemy;St Barts;Saint Barts
Saint Pierre and Miquelon|PM|46.9|-56.3|242|
Falkland Islands|FK|-51.75|-59.5|12173|Falklands
Saint Helena|SH|-15.95|-5.7|122|
Western Sahara|EH|24.5|-13.0|266000|
South Georgia and the South Sandwich Islands|GS|-54.3|-36.7|3903|South Georgia
British Indian Ocean Territory|IO|-7.3|72.4|60|`;

const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/\bst\.?\s/g, 'saint ').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
const COUNTRIES = RAW.split('\n').map((l, id) => { const f = l.split('|'); return { id, name: f[0], iso: f[1], lat: +f[2], lng: +f[3], area: +f[4], al: (f[5] || '').split(';').filter(Boolean) }; });
const NAME2ID = new Map(); COUNTRIES.forEach(c => [c.name, ...c.al].forEach(n => NAME2ID.set(norm(n), c.id)));
const GEO_FIX = { democraticrepubliccongo: 'Democratic Republic of the Congo', unitedstatesofamerica: 'United States', faeroeislands: 'Faroe Islands', somaliland: 'Somalia', northerncyprus: 'Cyprus', saintvincentandgrenadines: 'Saint Vincent and the Grenadines', southgeorgiaandtheislands: 'South Georgia and the South Sandwich Islands', wallisandfutunaislands: 'Wallis and Futuna', swaziland: 'Eswatini', bahamasthe: 'Bahamas', gambiathe: 'Gambia' };
function matchGeoName(n) {
  const s = n.replace(/U\.S\./g, 'US').replace(/^St-/, 'Saint ').replace(/\bIs\./g, 'Islands').replace(/\bI\./g, 'Island').replace(/\bRep\./g, 'Republic')
    .replace(/\bDem\./g, 'Democratic').replace(/\bEq\./g, 'Equatorial').replace(/\bFr\./g, 'French').replace(/\bBr\./g, 'British').replace(/\bN\./g, 'Northern')
    .replace(/\bS\./g, 'South').replace(/\bW\./g, 'Western').replace(/\bSt\./g, 'Saint').replace(/\bTer\./g, 'Territory').replace(/\bHerz\./g, 'Herzegovina')
    .replace(/\bGren\./g, 'Grenadines').replace(/\bVin\./g, 'Vincent').replace(/\bBarb\./g, 'Barbuda').replace(/\bGeo\./g, 'Georgia');
  const k = norm(s);
  if (NAME2ID.has(k)) return NAME2ID.get(k);
  if (GEO_FIX[k]) return NAME2ID.get(norm(GEO_FIX[k]));
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function http(url, asJson) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
      if (r.status === 429 || r.status >= 500) { const wait = (+r.headers.get('retry-after') || 2 * (i + 1)) * 1000; await sleep(Math.min(wait, 30000)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return asJson ? await r.json() : Buffer.from(await r.arrayBuffer());
    } catch (e) { if (i === 4) throw e; await sleep(1500 * (i + 1)); }
  }
  throw new Error('gave up');
}
const plain = h => String(h || '').replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hav = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, dl = (la2 - la1) * r, dg = (lo2 - lo1) * r; const x = Math.sin(dl / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dg / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };

async function geosearch(lat, lng) {
  const p = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', generator: 'geosearch', ggscoord: lat.toFixed(4) + '|' + lng.toFixed(4),
    ggsradius: '10000', ggsnamespace: '6', ggslimit: '50', prop: 'imageinfo|coordinates', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '960', colimit: '50' });
  const j = await http(API + '?' + p, true);
  return ((j.query && j.query.pages) || []).map(pg => {
    const ii = pg.imageinfo && pg.imageinfo[0], co = pg.coordinates && pg.coordinates[0]; if (!ii || !co) return null;
    return { title: pg.title || '', thumb: ii.thumburl, mime: ii.mime, w: ii.width, h: ii.height, page: ii.descriptionurl, lat: co.lat, lng: co.lon, meta: ii.extmetadata || {} };
  }).filter(Boolean);
}

async function main() {
  const topo = JSON.parse(await fs.readFile('node_modules/world-atlas/countries-50m.json', 'utf8'));
  const byEntry = new Map(); let unmatchedShapes = 0;
  for (const f of feature(topo, topo.objects.countries).features) {
    const id = matchGeoName((f.properties && f.properties.name) || ''); if (id == null) { unmatchedShapes++; continue; }
    (byEntry.get(id) || byEntry.set(id, []).get(id)).push({ f, bb: geoBounds(f) });
  }
  console.log(`Shapes matched to ${byEntry.size} of ${COUNTRIES.length} countries (${unmatchedShapes} shapes unmatched).`);
  const inside = (c, lng, lat) => { const fs_ = byEntry.get(c.id); if (!fs_) return hav(lat, lng, c.lat, c.lng) <= Math.max(15, Math.sqrt(c.area / Math.PI) * 0.8); return fs_.some(s => geoContains(s.f, [lng, lat])); };
  const randomPoint = c => {
    const fs_ = byEntry.get(c.id);
    if (fs_) for (let i = 0; i < 400; i++) {
      const s = fs_[Math.floor(Math.random() * fs_.length)], [[w0, s0], [e0, n0]] = s.bb, span = e0 >= w0 ? e0 - w0 : e0 + 360 - w0;
      let lo = w0 + Math.random() * span; if (lo > 180) lo -= 360; const la = s0 + Math.random() * (n0 - s0);
      if (geoContains(s.f, [lo, la])) return [lo, la];
    }
    const rk = Math.min(Math.sqrt(c.area / Math.PI) * 0.7, 60), a = Math.random() * 6.283, d = Math.random() * rk;
    return [c.lng + d * Math.cos(a) / (111 * Math.cos(c.lat * 0.017453) || 1), Math.max(-85, Math.min(85, c.lat + d * Math.sin(a) / 111))];
  };

  let index = {}; try { index = JSON.parse(await fs.readFile('index.json', 'utf8')); } catch (e) {}
  // Clean-up of an earlier run: remove space pictures and other unwanted photos, files included.
  let purged = 0;
  for (const iso of Object.keys(index)) {
    const keep = [];
    for (const x of index[iso]) {
      if (isBadPhoto(x.t, x.a)) { purged++; await fs.rm(`photos/${iso}/${x.f}`, { force: true }); } else keep.push(x);
    }
    index[iso] = keep;
  }
  console.log(`Removed ${purged} unwanted photos from the existing pack.`);
  const used = new Set(Object.values(index).flat().map(x => x.t));
  let bytes = 0;

  for (const c of COUNTRIES) {
    const have = index[c.iso] || [];
    if (have.length >= TARGET) { console.log(`${c.iso} ${c.name}: already has ${have.length}, skipped`); continue; }
    await fs.mkdir(`photos/${c.iso}`, { recursive: true });
    const list = have.slice(); let tried = 0, failed = 0;
    while (list.length < TARGET && tried < MAX_POINTS) {
      tried++; const [lng, lat] = randomPoint(c);
      let found; try { found = await geosearch(lat, lng); } catch (e) { failed++; if (failed > 8) break; continue; }
      await sleep(200);
      const good = shuffle(found.filter(x => x.mime === 'image/jpeg' && x.w >= 1000 && x.w / x.h > 0.6 && x.w / x.h < 2.3 && x.thumb && !BAD.test(x.title) && !isBadPhoto(x.title, plain(x.meta.Artist && x.meta.Artist.value)) && !used.has(x.title) && inside(c, x.lng, x.lat)));
      for (const x of good.slice(0, 2)) {
        if (list.length >= TARGET) break;
        try {
          const buf = await sharp(await http(x.thumb, false)).rotate().resize({ width: WIDTH, withoutEnlargement: true }).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
          const n = list.reduce((m, y) => Math.max(m, parseInt(y.f, 10) || 0), 0) + 1, file = `${n}.jpg`; await fs.writeFile(`photos/${c.iso}/${file}`, buf); bytes += buf.length;
          used.add(x.title); list.push({ f: file, t: x.title, a: plain(x.meta.Artist && x.meta.Artist.value).slice(0, 60) || 'unknown', l: plain(x.meta.LicenseShortName && x.meta.LicenseShortName.value), u: x.page });
          await sleep(150);
        } catch (e) { console.log(`  skip photo (${e.message})`); }
      }
    }
    index[c.iso] = list; await fs.writeFile('index.json', JSON.stringify(index));
    console.log(`${c.iso} ${c.name}: ${list.length}/${TARGET} photos after ${tried} spots`);
  }

  const counts = COUNTRIES.map(c => [c.iso, c.name, (index[c.iso] || []).length]);
  const total = counts.reduce((s, x) => s + x[2], 0), few = counts.filter(x => x[2] < 5);
  const summary = `Removed ${purged} unwanted. Photos: ${total}. New data this run: ${(bytes / 1048576).toFixed(1)} MB.\nCountries with fewer than 5 photos (${few.length}): ${few.map(x => `${x[1]} (${x[2]})`).join(', ') || 'none'}`;
  console.log('\n' + summary);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, '### Photo pack\n' + summary + '\n');
}
main().catch(e => { console.error(e); process.exit(1); });
